import type { Express } from "express";
import axios from "axios";
import { signJWT, verifyJWT } from "./jwt";

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

  // --------------------------------------------------
  // STEP 1: Redirect user to Google
  // --------------------------------------------------
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

      const parsedState = JSON.parse(
        Buffer.from(state, "base64url").toString("utf8"),
      );

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

      return res.redirect(
        `/auth/callback?token=${encodeURIComponent(jwt)}&redirectTo=${encodeURIComponent(
          parsedState.redirectTo || "/",
        )}`,
      );
    } catch (err: any) {
      console.error("[GoogleAuth] Callback error", {
        message: err?.message,
        data: err?.response?.data,
      });
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