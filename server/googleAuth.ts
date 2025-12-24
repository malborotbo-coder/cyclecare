import * as client from "openid-client";
import passport from "passport";
import session from "express-session";
import type { Express, RequestHandler } from "express";
import memoize from "memoizee";
import connectPg from "connect-pg-simple";
import crypto from "crypto";
import { storage } from "./storage";
import { signJWT, verifyJWT } from "./jwt";

// ---------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------
interface OAuthStatePayload {
  nonce: string;
  codeVerifier: string;
  redirectTo: string;
  nativeCallback?: string;
  stateId: string;
  exp: number;
}

// ---------------------------------------------------------------------
// OAuth helpers
// ---------------------------------------------------------------------
const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

function getStateSecret(): string {
  if (!process.env.SESSION_SECRET) {
    throw new Error("[GoogleAuth] SESSION_SECRET is missing");
  }
  return process.env.SESSION_SECRET;
}

function signOAuthState(payload: Omit<OAuthStatePayload, "exp">): string {
  const body: OAuthStatePayload = {
    ...payload,
    exp: Date.now() + OAUTH_STATE_TTL_MS,
  };
  const encoded = Buffer.from(JSON.stringify(body)).toString("base64url");
  const sig = crypto
    .createHmac("sha256", getStateSecret())
    .update(encoded)
    .digest("base64url");
  return `${encoded}.${sig}`;
}

function verifyOAuthState(state?: string): OAuthStatePayload | null {
  if (!state) return null;
  const [encoded, sig] = state.split(".");
  if (!encoded || !sig) return null;

  const expected = crypto
    .createHmac("sha256", getStateSecret())
    .update(encoded)
    .digest("base64url");

  if (expected !== sig) return null;

  const payload = JSON.parse(
    Buffer.from(encoded, "base64url").toString("utf8"),
  ) as OAuthStatePayload;

  if (payload.exp < Date.now()) return null;
  return payload;
}

// ---------------------------------------------------------------------
// Google OIDC config (cached)
// ---------------------------------------------------------------------
const getGoogleConfig = memoize(
  async () => {
    return await client.discovery(
      new URL("https://accounts.google.com"),
      process.env.GOOGLE_CLIENT_ID!,
      process.env.GOOGLE_CLIENT_SECRET!,
    );
  },
  { maxAge: 60 * 60 * 1000 },
);

// ---------------------------------------------------------------------
// Session
// ---------------------------------------------------------------------
export function getSession() {
  const pgStore = connectPg(session);
  const store = new pgStore({
    conString: process.env.DATABASE_URL,
    tableName: "sessions",
  });

  return session({
    secret: process.env.SESSION_SECRET!,
    store,
    proxy: true,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: true,
      sameSite: "none",
      domain: ".cyclecaretec.com",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    },
  });
}

// ---------------------------------------------------------------------
// Main setup
// ---------------------------------------------------------------------
export async function setupGoogleAuth(app: Express) {
  app.set("trust proxy", true);
  app.use(getSession());
  app.use(passport.initialize());
  app.use(passport.session());

  const OAUTH_DOMAIN = "cyclecaretec.com";

  // -------------------------------------------------------------------
  // START GOOGLE LOGIN
  // -------------------------------------------------------------------
  app.get("/api/auth/google", async (req, res) => {
    try {
      const redirectTo = (req.query.redirectTo as string) || "/";
      const nativeCallback = req.query.nativeCallback as string | undefined;

      const nonce = crypto.randomBytes(16).toString("hex");
      const codeVerifier = crypto.randomBytes(32).toString("base64url");
      const codeChallenge = crypto
        .createHash("sha256")
        .update(codeVerifier)
        .digest("base64url");

      const state = signOAuthState({
        nonce,
        codeVerifier,
        redirectTo,
        nativeCallback,
        stateId: crypto.randomBytes(8).toString("hex"),
      });

      const callbackUrl = `https://${OAUTH_DOMAIN}/api/auth/google/callback`;

      const config = await getGoogleConfig();

      const authUrl = client.buildAuthorizationUrl(config, {
        redirect_uri: callbackUrl,
        scope: "openid email profile",
        state,
        nonce,
        code_challenge: codeChallenge,
        code_challenge_method: "S256",
        prompt: "select_account",
      });

      return res.redirect(authUrl.href);
    } catch (e) {
      console.error("[GoogleAuth] Login error", e);
      return res.redirect("/auth?error=google_auth_failed");
    }
  });

  // -------------------------------------------------------------------
  // GOOGLE CALLBACK  ✅ (FIXED)
  // -------------------------------------------------------------------
  app.get("/api/auth/google/callback", async (req, res) => {
    try {
      const stateData = verifyOAuthState(req.query.state as string);
      if (!stateData) {
        return res.redirect("/auth?error=invalid_state");
      }

      if (!req.query.code) {
        return res.redirect("/auth?error=no_code");
      }

      const callbackUrl = `https://${OAUTH_DOMAIN}/api/auth/google/callback`;

      // 🔥 FIX: build URL from callbackUrl (NOT req.url)
      const currentUrl = new URL(callbackUrl);
      currentUrl.search = new URLSearchParams(req.query as any).toString();

      const config = await getGoogleConfig();

      const tokenSet = await client.authorizationCodeGrant(config, currentUrl, {
        expectedState: req.query.state as string,
        expectedNonce: stateData.nonce,
        pkceCodeVerifier: stateData.codeVerifier,
      });

      const claims = tokenSet.claims();

      const isAdmin =
        (process.env.ADMIN_EMAILS || "")
          .split(",")
          .map((e) => e.trim().toLowerCase())
          .includes(claims.email?.toLowerCase());

      const user = {
        id: `google_${claims.sub}`,
        email: claims.email,
        firstName: claims.given_name,
        lastName: claims.family_name,
        profileImageUrl: claims.picture,
        isAdmin,
      };

      await storage.upsertUser(user);

      const jwt = signJWT({
        sub: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        profileImageUrl: user.profileImageUrl,
        isAdmin,
      });

      const redirectTo = stateData.redirectTo || "/";
      return res.redirect(
        `/auth/callback?token=${encodeURIComponent(jwt)}&redirectTo=${encodeURIComponent(
          redirectTo,
        )}`,
      );
    } catch (e) {
      console.error("[GoogleAuth] Callback error", e);
      return res.redirect("/auth?error=callback_failed");
    }
  });
}

// ---------------------------------------------------------------------
// Session check
// ---------------------------------------------------------------------
export const isAuthenticated: RequestHandler = (req, res, next) => {
  const auth = req.headers.authorization;
  if (auth?.startsWith("Bearer ")) {
    const payload = verifyJWT(auth.slice(7));
    if (payload) {
      (req as any).jwtUser = payload;
      return next();
    }
  }
  return res.status(401).json({ message: "Unauthorized" });
};