import type { Express } from "express";
import axios from "axios";
import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import { signJWT, verifyJWT } from "./jwt";

const AUTH_COOKIE_NAME = "cc_auth";

const getAuthCookieOptions = () => {
  const secure = process.env.NODE_ENV === "production";
  const configuredDomain = process.env.AUTH_COOKIE_DOMAIN?.trim();
  return {
    httpOnly: true,
    secure,
    sameSite: "lax" as const,
    path: "/",
    ...(configuredDomain ? { domain: configuredDomain } : {}),
  };
};

const readCookieToken = (cookieHeader: string | undefined, name: string): string | null => {
  if (!cookieHeader) return null;
  const parts = cookieHeader.split(";").map((part) => part.trim());
  for (const part of parts) {
    if (!part.startsWith(`${name}=`)) continue;
    const value = part.slice(name.length + 1);
    if (!value) return null;
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }
  return null;
};

// --------------------------------------------------
// GOOGLE AUTH (JWT ONLY – NO DB – NO SESSION)
// --------------------------------------------------
export function setupGoogleAuth(app: Express) {
  const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
  const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
  const GOOGLE_USERINFO_URL =
    "https://openidconnect.googleapis.com/v1/userinfo";

  const CLIENT_ID = process.env.GOOGLE_CLIENT_ID!;
  const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET!;
  const CALLBACK_URL = process.env.GOOGLE_CALLBACK_URL!;
  const STATE_TTL_MS = 10 * 60 * 1000;
  const STATE_SECRET = process.env.SESSION_SECRET;

  if (!STATE_SECRET || STATE_SECRET.length < 32) {
    throw new Error("SESSION_SECRET must be set for OAuth state signing");
  }

  const allowedRedirectHosts = (process.env.ALLOWED_OAUTH_REDIRECT_HOSTS ||
    "cyclecaretec.com,www.cyclecaretec.com,localhost,127.0.0.1")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  const allowedDeepLinkSchemes = new Set(
    (process.env.ALLOWED_OAUTH_DEEP_LINK_SCHEMES || "cyclecare")
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
  );

  const isAllowedRedirectHost = (hostname: string) => {
    const normalized = hostname.toLowerCase();
    return allowedRedirectHosts.some(
      (allowed) => normalized === allowed || normalized.endsWith(`.${allowed}`),
    );
  };

  const sanitizeRedirectTarget = (value: unknown): string => {
    if (typeof value !== "string") return "/";
    const trimmed = value.trim();
    if (!trimmed) return "/";

    if (trimmed.startsWith("/") && !trimmed.startsWith("//")) {
      return trimmed;
    }

    try {
      const parsed = new URL(trimmed);
      const scheme = parsed.protocol.replace(":", "").toLowerCase();

      if (
        (parsed.protocol === "https:" || parsed.protocol === "http:") &&
        isAllowedRedirectHost(parsed.hostname)
      ) {
        return parsed.toString();
      }

      if (allowedDeepLinkSchemes.has(scheme)) {
        return parsed.toString();
      }
    } catch {
      return "/";
    }

    return "/";
  };

  const buildOAuthState = (redirectTo: string) => {
    const payload = {
      redirectTo,
      ts: Date.now(),
      nonce: randomBytes(12).toString("hex"),
    };
    const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
    const signature = createHmac("sha256", STATE_SECRET).update(encoded).digest("base64url");
    return `${encoded}.${signature}`;
  };

  const parseOAuthState = (state: string): { redirectTo: string } | null => {
    const [encoded, signature] = state.split(".");
    if (!encoded || !signature) return null;
    const expectedSignature = createHmac("sha256", STATE_SECRET).update(encoded).digest("base64url");
    const signatureBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expectedSignature);

    if (
      signatureBuffer.length !== expectedBuffer.length ||
      !timingSafeEqual(signatureBuffer, expectedBuffer)
    ) {
      return null;
    }

    try {
      const parsed = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
      const ts = Number(parsed?.ts);
      if (!Number.isFinite(ts)) return null;
      if (Date.now() - ts > STATE_TTL_MS) return null;
      return { redirectTo: sanitizeRedirectTarget(parsed?.redirectTo) };
    } catch {
      return null;
    }
  };

  // --------------------------------------------------
  // STEP 1: Redirect user to Google
  // --------------------------------------------------
  app.get("/api/auth/google", (req, res) => {
    const redirectTo = sanitizeRedirectTarget((req.query.redirectTo as string) || "/");
    const state = buildOAuthState(redirectTo);

    const url =
      `${GOOGLE_AUTH_URL}?` +
      new URLSearchParams({
        client_id: CLIENT_ID,
        redirect_uri: CALLBACK_URL,
        response_type: "code",
        scope: "openid email profile",
        state,
        prompt: "select_account",
      }).toString();

    return res.redirect(url);
  });

  // --------------------------------------------------
  // STEP 2: Google Callback (NO DB, NO SESSION)
  // --------------------------------------------------
  app.get("/api/auth/google/callback", async (req, res) => {
    try {
      const { code, state } = req.query as {
        code?: string;
        state?: string;
      };

      if (!code || !state) {
        return res.redirect("/auth?error=missing_code");
      }

      const parsedState = parseOAuthState(state);
      if (!parsedState?.redirectTo) {
        return res.redirect("/auth?error=invalid_state");
      }

      // ------------------------------------------
      // Exchange code for access token
      // ------------------------------------------
      const tokenRes = await axios.post(
        GOOGLE_TOKEN_URL,
        new URLSearchParams({
          code,
          client_id: CLIENT_ID,
          client_secret: CLIENT_SECRET,
          redirect_uri: CALLBACK_URL,
          grant_type: "authorization_code",
        }),
        {
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
        },
      );

      const accessToken = tokenRes.data.access_token;
      if (!accessToken) {
        throw new Error("No access token returned from Google");
      }

      // ------------------------------------------
      // Fetch Google user profile
      // ------------------------------------------
      const userRes = await axios.get(GOOGLE_USERINFO_URL, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      const claims = userRes.data;

      const isAdmin =
        (process.env.ADMIN_EMAILS || "")
          .split(",")
          .map((e) => e.trim().toLowerCase())
          .includes((claims.email || "").toLowerCase());

      // ------------------------------------------
      // Create JWT (SOURCE OF TRUTH)
      // ------------------------------------------
      const jwt = signJWT({
        sub: `google_${claims.sub}`,
        email: claims.email,
        firstName: claims.given_name,
        lastName: claims.family_name,
        profileImageUrl: claims.picture,
        isAdmin,
      });
      const tokenPreview = `${jwt.slice(0, 12)}...`;

      const redirectTarget = parsedState.redirectTo || "/";
      const tokenParam = `token=${encodeURIComponent(jwt)}`;
      const redirectParam = `redirectTo=${encodeURIComponent(redirectTarget)}`;
      console.info("[GoogleAuth] Callback token generated", {
        email: claims.email || null,
        redirectTarget,
        tokenPreview,
      });
      res.cookie(AUTH_COOKIE_NAME, jwt, getAuthCookieOptions());

      // If redirect target is an absolute/deep-link URL, send the token directly there
      if (
        redirectTarget.startsWith("http://") ||
        redirectTarget.startsWith("https://") ||
        redirectTarget.includes("://")
      ) {
        const separator = redirectTarget.includes("?") ? "&" : "?";
        console.info("[GoogleAuth] Callback redirecting to absolute target", { redirectTarget });
        return res.redirect(`${redirectTarget}${separator}${tokenParam}`);
      }

      // Default: send back to SPA callback with token
      console.info("[GoogleAuth] Callback redirecting to SPA", { redirectTarget });
      return res.redirect(`/auth/callback?${tokenParam}&${redirectParam}`);
    } catch (err: any) {
      console.error("[GoogleAuth] Callback error", {
        message: err?.message,
        data: err?.response?.data,
      });
      return res.redirect("/auth?error=callback_failed");
    }
  });

  // --------------------------------------------------
  // STEP 3: Session check (JWT first, no redirects)
  // --------------------------------------------------
  app.get("/api/auth/session", (req, res) => {
    res.set("Cache-Control", "no-store");

    const authHeader = req.headers.authorization;
    const headerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    const cookieToken = readCookieToken(req.headers.cookie, AUTH_COOKIE_NAME);
    const tokenCandidates = [headerToken, cookieToken].filter(
      (value): value is string => typeof value === "string" && value.trim().length > 0,
    );
    for (const token of tokenCandidates) {
      const payload = verifyJWT(token);
      if (payload) {
        const isPhoneSession = Boolean(payload.phone);
        return res.status(200).json({
          authenticated: true,
          authToken: token,
          user: {
            id: payload.sub,
            email: payload.email || null,
            firstName: payload.firstName || null,
            lastName: payload.lastName || null,
            phone: payload.phone || null,
            profileImageUrl: payload.profileImageUrl || null,
            isAdmin: payload.isAdmin === true,
            source: isPhoneSession ? ("firebase_auth" as const) : ("google_auth" as const),
          },
        });
      }
    }

    // Phone/Firebase user injected by firebaseMiddleware (OTP)
    const firebaseUser = (req as any).firebaseUser;
    if (firebaseUser) {
      return res.status(200).json({
        authenticated: true,
        user: {
          id: firebaseUser.uid,
          email: firebaseUser.email || null,
          firstName: null,
          lastName: null,
          phone: firebaseUser.phone_number || null,
          isAdmin: firebaseUser.isAdmin === true,
          source: "firebase_auth" as const,
        },
      });
    }

    return res.status(200).json({ authenticated: false, user: null });
  });
}

// --------------------------------------------------
// Auth middleware (JWT only)
// --------------------------------------------------
export const isAuthenticated = (req: any, res: any, next: any) => {
  const auth = req.headers.authorization;
  if (auth?.startsWith("Bearer ")) {
    const payload = verifyJWT(auth.slice(7));
    if (payload) {
      req.jwtUser = payload;
      return next();
    }
  }
  return res.status(401).json({ message: "Unauthorized" });
};
