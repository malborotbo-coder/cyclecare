import * as client from "openid-client";
import passport from "passport";
import session from "express-session";
import type { Express, RequestHandler } from "express";
import memoize from "memoizee";
import connectPg from "connect-pg-simple";
import { storage } from "./storage";
import crypto from "crypto";

// =============================================
// JWT Token Functions (Stateless Auth)
// =============================================
function getJWTSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("[JWT] SESSION_SECRET must be set and at least 32 characters long");
  }
  return secret;
}

const JWT_SECRET = getJWTSecret();
const JWT_EXPIRES_IN = 7 * 24 * 60 * 60; // 7 days in seconds
const JWT_ISSUER = "cyclecare-app";
const JWT_AUDIENCE = "cyclecare-users";

interface JWTPayload {
  sub: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  profileImageUrl: string | null;
  isAdmin: boolean;
  iss: string;
  aud: string;
  iat: number;
  exp: number;
}

function base64UrlEncode(str: string): string {
  return Buffer.from(str).toString("base64url");
}

function base64UrlDecode(str: string): string {
  return Buffer.from(str, "base64url").toString("utf8");
}

export function signJWT(payload: Omit<JWTPayload, "iat" | "exp" | "iss" | "aud">): string {
  const header = { alg: "HS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  
  const fullPayload: JWTPayload = {
    ...payload,
    iss: JWT_ISSUER,
    aud: JWT_AUDIENCE,
    iat: now,
    exp: now + JWT_EXPIRES_IN,
  };
  
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(fullPayload));
  const signature = crypto
    .createHmac("sha256", JWT_SECRET)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest("base64url");
  
  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

export function verifyJWT(token: string): JWTPayload | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    
    const [encodedHeader, encodedPayload, signature] = parts;
    
    // Verify signature
    const expectedSignature = crypto
      .createHmac("sha256", JWT_SECRET)
      .update(`${encodedHeader}.${encodedPayload}`)
      .digest("base64url");
    
    if (signature !== expectedSignature) {
      console.log("[JWT] Invalid signature");
      return null;
    }
    
    // Decode payload
    const payload = JSON.parse(base64UrlDecode(encodedPayload)) as JWTPayload;
    
    // Check expiration
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp < now) {
      console.log("[JWT] Token expired");
      return null;
    }
    
    // Verify issuer and audience
    if (payload.iss !== JWT_ISSUER) {
      console.log("[JWT] Invalid issuer:", payload.iss);
      return null;
    }
    
    if (payload.aud !== JWT_AUDIENCE) {
      console.log("[JWT] Invalid audience:", payload.aud);
      return null;
    }
    
    return payload;
  } catch (error) {
    console.error("[JWT] Verification error:", error);
    return null;
  }
}

declare module "express-session" {
  interface SessionData {
    redirectTo?: string;
    nativeCallback?: string;
    oauth_state?: string;
    oauth_nonce?: string;
    oauth_code_verifier?: string;
  }
}

// Cache the Google OIDC configuration
const getGoogleConfig = memoize(
  async () => {
    console.log("[GoogleAuth] Discovering Google OIDC configuration...");
    const config = await client.discovery(
      new URL("https://accounts.google.com"),
      process.env.GOOGLE_CLIENT_ID!,
      process.env.GOOGLE_CLIENT_SECRET!,
    );
    console.log("[GoogleAuth] Google OIDC configuration discovered successfully");
    return config;
  },
  { maxAge: 3600 * 1000 },
);

// Generate random string for state/nonce
function generateRandomString(length: number = 32): string {
  return crypto.randomBytes(length).toString("hex");
}

// Generate PKCE code verifier
function generateCodeVerifier(): string {
  return crypto.randomBytes(32).toString("base64url");
}

// Generate PKCE code challenge from verifier
function generateCodeChallenge(verifier: string): string {
  return crypto.createHash("sha256").update(verifier).digest("base64url");
}

export function getSession() {
  const sessionTtl = 7 * 24 * 60 * 60 * 1000; // 1 week
  const pgStore = connectPg(session);
  const sessionStore = new pgStore({
    conString: process.env.DATABASE_URL,
    createTableIfMissing: false,
    ttl: sessionTtl,
    tableName: "sessions",
  });

  const isLocalDev =
    process.env.NODE_ENV === "development" && !process.env.REPL_ID;

  console.log("[Session] Configuring session with:", {
    isLocalDev,
    nodeEnv: process.env.NODE_ENV,
    replId: !!process.env.REPL_ID,
  });

  return session({
    secret: process.env.SESSION_SECRET!,
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      // For Replit and production: use secure + sameSite none to allow cross-origin redirects
      secure: true,
      sameSite: "none" as const,
      maxAge: sessionTtl,
    },
  });
}

async function upsertGoogleUser(claims: any) {
  const adminEmails = (process.env.ADMIN_EMAILS || "malborotbo@gmail.com")
    .split(",")
    .filter((e) => e.trim());
  
  const isAdmin = adminEmails.some(
    (email) => email.trim().toLowerCase() === claims.email?.toLowerCase(),
  );

  const userData: any = {
    id: `google_${claims.sub}`,
    email: claims.email,
    firstName: claims.given_name || claims.name?.split(' ')[0],
    lastName: claims.family_name || claims.name?.split(' ').slice(1).join(' '),
    profileImageUrl: claims.picture,
  };

  if (isAdmin) userData.isAdmin = true;

  console.log("[GoogleAuth] Upserting user:", userData.email, "isAdmin:", isAdmin);
  await storage.upsertUser(userData);
  
  return userData;
}

export async function setupGoogleAuth(app: Express) {
  app.set("trust proxy", 1);
  app.use(getSession());
  app.use(passport.initialize());
  app.use(passport.session());

  passport.serializeUser((user: any, cb) => {
    console.log("[GoogleAuth] Serializing user:", user?.claims?.email);
    // Serialize only essential data to avoid data loss
    const serialized = {
      claims: {
        sub: user?.claims?.sub,
        email: user?.claims?.email,
        first_name: user?.claims?.first_name,
        last_name: user?.claims?.last_name,
        profile_image_url: user?.claims?.profile_image_url,
      },
      access_token: user?.access_token,
      refresh_token: user?.refresh_token,
      expires_at: user?.expires_at,
    };
    console.log("[GoogleAuth] Serialized data:", JSON.stringify(serialized).substring(0, 100));
    cb(null, JSON.stringify(serialized));
  });
  
  passport.deserializeUser((serialized: any, cb) => {
    try {
      console.log("[GoogleAuth] Deserializing:", typeof serialized, serialized ? serialized.substring(0, 50) : "null");
      const user = typeof serialized === "string" ? JSON.parse(serialized) : serialized;
      console.log("[GoogleAuth] Deserialized user:", user?.claims?.email);
      cb(null, user);
    } catch (err) {
      console.error("[GoogleAuth] Deserialization error:", err);
      cb(err);
    }
  });

  // Check if Google credentials are configured
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    console.warn("[GoogleAuth] GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET not configured");
    
    app.get("/api/auth/google", (req, res) => {
      res.status(500).json({ error: "Google OAuth not configured" });
    });
    return;
  }

  console.log("[GoogleAuth] Google OAuth configured with Client ID:", process.env.GOOGLE_CLIENT_ID.substring(0, 20) + "...");

  // Fixed OAuth domain - use cyclecaretec.com for Google OAuth
  const OAUTH_DOMAIN = "cyclecaretec.com";
  
  // Helper function to get the correct host for OAuth redirects
  function getOAuthHost(req: any): string {
    // Always use the fixed domain for OAuth to avoid redirect_uri_mismatch
    console.log(`[GoogleAuth] Using fixed OAuth domain: ${OAUTH_DOMAIN}`);
    return OAUTH_DOMAIN;
  }

  // ---------------------------------------
  // 🔥 GOOGLE LOGIN START
  // ---------------------------------------
  app.get("/api/auth/google", async (req, res) => {
    try {
      const oauthHost = getOAuthHost(req);
      console.log(`[GoogleAuth] Login request - Host: ${oauthHost}`);

      const redirectTo = (req.query.redirectTo as string) || "/";
      const nativeCallback = req.query.nativeCallback as string | undefined;
      
      req.session.redirectTo = redirectTo;
      if (nativeCallback) {
        req.session.nativeCallback = decodeURIComponent(nativeCallback);
        console.log(`[GoogleAuth] Native callback saved: ${req.session.nativeCallback}`);
      }

      // Generate state, nonce, and PKCE values
      const state = generateRandomString();
      const nonce = generateRandomString();
      const codeVerifier = generateCodeVerifier();
      const codeChallenge = generateCodeChallenge(codeVerifier);
      
      req.session.oauth_state = state;
      req.session.oauth_nonce = nonce;
      req.session.oauth_code_verifier = codeVerifier;

      // Build callback URL based on correct host
      const callbackUrl = `https://${oauthHost}/api/auth/google/callback`;
      console.log(`[GoogleAuth] Callback URL: ${callbackUrl}`);

      const config = await getGoogleConfig();

      // Build authorization URL using openid-client v6 API
      const authUrl = client.buildAuthorizationUrl(config, {
        redirect_uri: callbackUrl,
        scope: "openid email profile",
        state,
        nonce,
        code_challenge: codeChallenge,
        code_challenge_method: "S256",
        prompt: "select_account",
      });

      console.log(`[GoogleAuth] Redirecting to Google...`);
      
      // Save session before redirect
      req.session.save((err) => {
        if (err) {
          console.error("[GoogleAuth] Session save error:", err);
          return res.redirect("/auth?error=session_error");
        }
        res.redirect(authUrl.href);
      });
    } catch (error) {
      console.error("[GoogleAuth] Login error:", error);
      res.redirect("/auth?error=google_auth_failed");
    }
  });

  // Also support legacy /api/login route for backwards compatibility
  app.get("/api/login", async (req, res) => {
    const provider = req.query.provider as string;
    if (provider === "google" || !provider) {
      // Forward to Google auth
      const params = new URLSearchParams();
      if (req.query.redirectTo) params.set("redirectTo", req.query.redirectTo as string);
      if (req.query.nativeCallback) params.set("nativeCallback", req.query.nativeCallback as string);
      return res.redirect(`/api/auth/google?${params.toString()}`);
    }
    // For other providers (like Apple), return error for now
    res.status(400).json({ error: `Provider ${provider} not supported yet` });
  });

  // ---------------------------------------
  // 🔥 GOOGLE CALLBACK
  // ---------------------------------------
  app.get("/api/auth/google/callback", async (req, res) => {
    try {
      const oauthHost = getOAuthHost(req);
      console.log(`[GoogleAuth] Callback request - Host: ${oauthHost}`);
      console.log(`[GoogleAuth] Query params:`, req.query);

      const { error: oauthError, error_description, code } = req.query;

      if (oauthError) {
        console.error("[GoogleAuth] OAuth error:", oauthError, error_description);
        const nativeCallback = req.session.nativeCallback;
        if (nativeCallback) {
          return res.redirect(`${nativeCallback}?error=auth_failed`);
        }
        return res.redirect("/auth?error=auth_failed");
      }

      if (!code) {
        console.error("[GoogleAuth] No authorization code received");
        return res.redirect("/auth?error=no_code");
      }

      // Build callback URL using correct host
      const callbackUrl = `https://${oauthHost}/api/auth/google/callback`;
      
      const config = await getGoogleConfig();

      // Exchange code for tokens using PKCE
      const currentUrl = new URL(req.url, `https://${oauthHost}`);
      
      const tokenSet = await client.authorizationCodeGrant(config, currentUrl, {
        expectedState: req.session.oauth_state,
        expectedNonce: req.session.oauth_nonce,
        pkceCodeVerifier: req.session.oauth_code_verifier,
      });

      console.log("[GoogleAuth] Tokens received successfully");

      // Get user info from tokens
      const claims = tokenSet.claims();
      console.log("[GoogleAuth] User claims:", claims?.email);

      // Upsert user in database
      const userData = await upsertGoogleUser(claims);

      // Get saved session data before cleanup
      const nativeCallback = req.session.nativeCallback;
      const redirectTo = req.session.redirectTo || "/";
      
      // Clean up OAuth session data
      delete req.session.oauth_state;
      delete req.session.oauth_nonce;
      delete req.session.oauth_code_verifier;
      delete req.session.nativeCallback;
      delete req.session.redirectTo;

      // =============================================
      // 🔥 NEW: Generate JWT Token (Stateless Auth)
      // =============================================
      const jwtPayload = {
        sub: userData.id,
        email: userData.email || null,
        firstName: userData.firstName || null,
        lastName: userData.lastName || null,
        profileImageUrl: userData.profileImageUrl || null,
        isAdmin: userData.isAdmin || false,
      };
      
      const token = signJWT(jwtPayload);
      console.log("[GoogleAuth] JWT token generated for:", userData.email);

      // Redirect with token in URL (will be captured by client)
      if (nativeCallback) {
        console.log("[GoogleAuth] Native callback redirect with token");
        return res.redirect(`${nativeCallback}?token=${token}`);
      }

      // For web: redirect to auth callback page with token
      console.log("[GoogleAuth] Web redirect with token to:", redirectTo);
      const callbackPage = `/auth/callback?token=${encodeURIComponent(token)}&redirectTo=${encodeURIComponent(redirectTo)}`;
      res.redirect(callbackPage);
    } catch (error: any) {
      console.error("[GoogleAuth] Callback error:", error.message || error);
      const nativeCallback = req.session.nativeCallback;
      if (nativeCallback) {
        return res.redirect(`${nativeCallback}?error=auth_failed`);
      }
      res.redirect("/auth?error=callback_failed");
    }
  });

  // ---------------------------------------
  // 🔥 LOGOUT
  // ---------------------------------------
  app.post("/api/logout", (req, res) => {
    console.log("[GoogleAuth] Logout requested");

    req.user = undefined;

    req.logout((logoutErr: any) => {
      if (logoutErr) console.error("[GoogleAuth] Passport logout error:", logoutErr);

      if (req.session) {
        req.session.destroy((err: any) => {
          if (err) console.error("[GoogleAuth] Session destroy error:", err);

          res.clearCookie("connect.sid", {
            path: "/",
            httpOnly: true,
            secure: process.env.NODE_ENV !== "development",
            sameSite: "lax",
          });

          console.log("[GoogleAuth] Logout complete");
          res.status(200).json({ success: true });
        });
      } else {
        res.clearCookie("connect.sid");
        console.log("[GoogleAuth] Logout complete (no session)");
        res.status(200).json({ success: true });
      }
    });
  });

  // ---------------------------------------
  // 🔥 GET CURRENT USER SESSION (JWT + Firebase)
  // ---------------------------------------
  app.get("/api/auth/session", async (req, res) => {
    // 1. Check JWT token in Authorization header
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.slice(7);
      const payload = verifyJWT(token);
      
      if (payload) {
        console.log("[GoogleAuth] JWT session valid for:", payload.email);
        
        // Fetch latest isAdmin status from database (not from token)
        let isAdmin = payload.isAdmin;
        try {
          const dbUser = await storage.getUserByEmail(payload.email || "");
          if (dbUser) {
            isAdmin = dbUser.isAdmin || false;
            console.log("[GoogleAuth] DB isAdmin status:", isAdmin);
          }
        } catch (e) {
          console.log("[GoogleAuth] Could not fetch user from DB, using token isAdmin");
        }
        
        return res.json({
          user: {
            id: payload.sub,
            email: payload.email,
            firstName: payload.firstName,
            lastName: payload.lastName,
            profileImageUrl: payload.profileImageUrl,
            isAdmin: isAdmin,
            source: "google_auth" as const,
          }
        });
      }
    }
    
    // 2. Check Firebase/Phone auth (from firebaseMiddleware)
    if ((req as any).firebaseUser) {
      console.log("[GoogleAuth] Returning Firebase user:", (req as any).firebaseUser.uid);
      
      // isAdmin from middleware (set by ADMIN_EMAILS or ADMIN_PHONE_NUMBER check)
      let isAdmin = (req as any).firebaseUser.isAdmin || false;
      
      // Also check database for isAdmin status (user might be marked admin in DB)
      try {
        const email = (req as any).firebaseUser.email;
        if (email) {
          const dbUser = await storage.getUserByEmail(email);
          if (dbUser && dbUser.isAdmin) {
            isAdmin = true;
            console.log("[GoogleAuth] Firebase user DB isAdmin status: true");
          }
        }
      } catch (e) {
        console.log("[GoogleAuth] Could not fetch Firebase user from DB");
      }
      
      console.log("[GoogleAuth] Final isAdmin status:", isAdmin);
      
      return res.json({
        user: {
          id: (req as any).firebaseUser.uid,
          email: (req as any).firebaseUser.email,
          firstName: null,
          lastName: null,
          phone: (req as any).firebaseUser.phone_number,
          isAdmin: isAdmin,
          source: "firebase_auth" as const,
        }
      });
    }
    
    // 3. Check legacy Passport session (fallback)
    const user = req.user as any;
    if (user && user.claims?.sub) {
      console.log("[GoogleAuth] Returning Passport session user:", user.claims?.email);
      return res.json({
        user: {
          id: `google_${user.claims.sub}`,
          email: user.claims?.email,
          firstName: user.claims?.first_name,
          lastName: user.claims?.last_name,
          profileImageUrl: user.claims?.profile_image_url,
          isAdmin: false,
          source: "replit_auth" as const,
        }
      });
    }
    
    console.log("[GoogleAuth] No authenticated user found");
    res.status(401).json({ user: null });
  });
}

// ---------------------------------------
// 🔥 Middlewares (JWT + Firebase + Passport)
// ---------------------------------------
export const isAuthenticated: RequestHandler = async (req, res, next) => {
  // 1. Check JWT token in Authorization header
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    const payload = verifyJWT(token);
    
    if (payload) {
      // Attach user to request for downstream handlers
      (req as any).jwtUser = payload;
      console.log("[Auth] JWT user authenticated:", payload.email);
      return next();
    }
  }
  
  // 2. Check Firebase/Phone Auth (from firebaseMiddleware)
  if ((req as any).firebaseUser) {
    console.log("[Auth] Firebase/Phone user authenticated:", (req as any).firebaseUser.uid);
    return next();
  }

  // 3. Check legacy Passport session
  const user = req.user as any;
  if (user && user.claims?.sub) {
    console.log("[Auth] Passport user authenticated:", user.claims?.sub);
    return next();
  }

  return res.status(401).json({ message: "Unauthorized" });
};

export const isAdmin: RequestHandler = async (req, res, next) => {
  // 1. Check JWT user first
  if ((req as any).jwtUser) {
    if ((req as any).jwtUser.isAdmin === true) {
      console.log("[Auth] JWT admin user authorized");
      return next();
    }
    return res.status(403).json({ message: "Forbidden: Admin access required" });
  }

  // 2. Check Firebase/Phone Auth
  if ((req as any).firebaseUser) {
    if ((req as any).firebaseUser.isAdmin === true) {
      console.log("[Auth] Firebase admin user authorized");
      return next();
    }
    return res.status(403).json({ message: "Forbidden: Admin access required" });
  }

  // 3. Check legacy Passport session
  const user = req.user as any;
  if (!user?.claims?.sub) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const dbUser = await storage.getUser(`google_${user.claims.sub}`);
  if (!dbUser || !dbUser.isAdmin) {
    console.log("[Auth] User is not admin:", user.claims.sub);
    return res.status(403).json({ message: "Forbidden: Admin access required" });
  }

  console.log("[Auth] Passport admin user authorized:", user.claims.sub);
  return next();
};
