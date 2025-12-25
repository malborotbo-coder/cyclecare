import type { Express } from "express";
import axios from "axios";
import crypto from "crypto";
import { storage } from "./storage";
import { signJWT, verifyJWT } from "./jwt";

// --------------------------------------------------
// START GOOGLE LOGIN
// --------------------------------------------------
export function setupGoogleAuth(app: Express) {
  const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
  const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
  const GOOGLE_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";

  const CLIENT_ID = process.env.GOOGLE_CLIENT_ID!;
  const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET!;
  const CALLBACK_URL = process.env.GOOGLE_CALLBACK_URL!; 
  const OAUTH_DOMAIN = "cyclecaretec.com";

  // ----------------------------------------------
  // STEP 1: Redirect user to Google
  // ----------------------------------------------
  app.get("/api/auth/google", (req, res) => {
    const redirectTo = (req.query.redirectTo as string) || "/";
    const state = Buffer.from(
      JSON.stringify({
        redirectTo,
        ts: Date.now(),
      }),
    ).toString("base64url");

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

    res.redirect(url);
  });

  // ----------------------------------------------
  // STEP 2: Google Callback
  // ----------------------------------------------
  app.get("/api/auth/google/callback", async (req, res) => {
    try {
      const { code, state } = req.query as { code?: string; state?: string };

      if (!code || !state) {
        return res.redirect("/auth?error=missing_code");
      }

      const parsedState = JSON.parse(
        Buffer.from(state, "base64url").toString("utf8"),
      );

      // ------------------------------------------
      // Exchange code for token
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

      const { access_token } = tokenRes.data;

      // ------------------------------------------
      // Get user info
      // ------------------------------------------
      const userRes = await axios.get(GOOGLE_USERINFO_URL, {
        headers: {
          Authorization: `Bearer ${access_token}`,
        },
      });

      const claims = userRes.data;

      const isAdmin =
        (process.env.ADMIN_EMAILS || "")
          .split(",")
          .map((e) => e.trim().toLowerCase())
          .includes((claims.email || "").toLowerCase());

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

      return res.redirect(
        `/auth/callback?token=${encodeURIComponent(jwt)}&redirectTo=${encodeURIComponent(
          parsedState.redirectTo || "/",
        )}`,
      );
    } catch (err) {
      console.error("[GoogleAuth] Callback error", err);
      return res.redirect("/auth?error=callback_failed");
    }
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