import type { Express, Request, Response, NextFunction } from "express";
import admin from "firebase-admin";
import twilio from "twilio";
import { randomBytes } from "crypto";
import { storage } from "./storage";
import { signJWT, verifyJWT } from "./jwt";
import { pgFetch } from "./postgrest";

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const ALLOW_LEGACY_PHONE_TOKENS = process.env.ALLOW_LEGACY_PHONE_TOKENS === "true";
const OTP_SEND_WINDOW_MS = 10 * 60 * 1000;
const OTP_VERIFY_WINDOW_MS = 10 * 60 * 1000;
const OTP_SEND_MAX = 5;
const OTP_VERIFY_MAX = 10;

// Initialize Twilio
const twilioClient = process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN
  ? twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
  : null;

// Normalize phone numbers to 9-digit SA local format for comparisons/admin checks
const normalizePhone = (p: string): string => {
  if (!p) return '';
  let digits = p.replace(/\D/g, '');
  if (digits.startsWith('966')) {
    digits = digits.slice(3);
  }
  if (digits.startsWith('0')) {
    digits = digits.slice(1);
  }
  return digits.slice(-9);
};

const isAdminPhoneNumber = (phone: string | undefined | null): boolean => {
  if (!phone) return false;
  const adminPhone = process.env.ADMIN_PHONE_NUMBER;
  if (!adminPhone) return false;
  return normalizePhone(adminPhone) === normalizePhone(phone);
};

const createSessionToken = () =>
  `session_${Date.now()}_${randomBytes(24).toString("hex")}`;

const APP_JWT_ISSUER = "cyclecare-app";
const APP_JWT_AUDIENCE = "cyclecare-users";
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

let auth: admin.auth.Auth | null = null;
let initialized = false;

const decodeJwtPayload = (token: string) => {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const decoded = Buffer.from(parts[1], "base64url").toString("utf8");
    return JSON.parse(decoded);
  } catch {
    return null;
  }
};

type RateBucket = {
  count: number;
  resetAt: number;
};

const otpRateBuckets = new Map<string, RateBucket>();

const getClientIp = (req: Request): string => {
  const forwarded = req.headers["x-forwarded-for"];
  if (Array.isArray(forwarded) && forwarded.length > 0) {
    return forwarded[0].split(",")[0].trim();
  }
  if (typeof forwarded === "string" && forwarded.trim()) {
    return forwarded.split(",")[0].trim();
  }
  return req.ip || "unknown";
};

const enforceOtpRateLimit = (
  req: Request,
  res: Response,
  keyPrefix: "send" | "verify",
  max: number,
  windowMs: number,
) => {
  const now = Date.now();
  const phone = typeof req.body?.phoneNumber === "string" ? normalizePhone(req.body.phoneNumber) : "";
  const key = `${keyPrefix}:${getClientIp(req)}:${phone || "no-phone"}`;
  const current = otpRateBuckets.get(key);

  if (!current || current.resetAt <= now) {
    otpRateBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }

  if (current.count >= max) {
    const retryAfterSeconds = Math.max(Math.ceil((current.resetAt - now) / 1000), 1);
    res.setHeader("Retry-After", String(retryAfterSeconds));
    res.status(429).json({ error: "too_many_requests", retryAfterSeconds });
    return false;
  }

  current.count += 1;
  otpRateBuckets.set(key, current);
  return true;
};

// Initialize Firebase Admin SDK
export async function initializeFirebaseAdmin() {
  if (initialized) return auth;

  try {
    const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const projectId = process.env.FIREBASE_PROJECT_ID || "cyclecare-aa686";

    console.log("[Firebase Admin] Checking credentials...");
    console.log("[Firebase Admin] Project ID:", projectId);
    console.log("[Firebase Admin] Client Email exists:", !!clientEmail);
    console.log("[Firebase Admin] Private Key exists:", !!privateKey);

    if (!privateKey || !clientEmail) {
      console.warn("[Firebase] Credentials not fully configured, using mock auth");
      initialized = true;
      return null;
    }

    const serviceAccount = {
      projectId,
      clientEmail,
      privateKey,
    };

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount as admin.ServiceAccount),
    });

    auth = admin.auth();
    initialized = true;
    console.log("[Firebase Admin] Initialized successfully");
    return auth;
  } catch (error) {
    console.error("[Firebase Admin] Initialization error:", error);
    initialized = true;
    return null;
  }
}

declare global {
  namespace Express {
    interface Request {
      firebaseUser?: any;
      userId?: string;
      jwtUser?: any;
      authError?: { code: string; message?: string };
    }
  }
}

export async function setupFirebaseAuth(app: Express) {
  await initializeFirebaseAdmin();

  // Middleware to verify Firebase ID tokens or phone session tokens
  app.use("/api", async (req: Request, res: Response, next: NextFunction) => {
    req.jwtUser = undefined;
    req.firebaseUser = undefined;
    req.authError = undefined;
    req.userId = undefined;

    const authHeader = req.headers.authorization;
    const tokenMatch = authHeader?.match(/^Bearer\s+(.+)$/i);
    const token = tokenMatch?.[1]?.trim();

    if (!token) {
      if (authHeader) {
        req.authError = { code: "invalid_token", message: "authorization_header_invalid" };
      }
      return next();
    }

    try {
      // 0) First, try native JWT (Google OAuth) - no Firebase verification
      const jwtPayload = verifyJWT(token);
      if (jwtPayload) {
        (req as any).jwtUser = jwtPayload;
        req.userId = jwtPayload.sub;
        return next();
      }

      // If token looks like our app JWT but failed verification, skip Firebase
      const payload = decodeJwtPayload(token);
      if (payload?.iss === APP_JWT_ISSUER && payload?.aud === APP_JWT_AUDIENCE) {
        const now = Math.floor(Date.now() / 1000);
        const reason = payload.exp && payload.exp < now ? "token_expired" : "invalid_token";
        console.warn("[Auth] Skipping Firebase check for app JWT with invalid signature/expiry");
        req.authError = { code: reason, message: "app_jwt_invalid" };
        return next();
      }

      // Check if it's a phone session token (fallback auth) - check database first
      if (token.startsWith('session_')) {
        const dbSession = await storage.getPhoneSession(token);
        if (dbSession) {
          const adminPhone = process.env.ADMIN_PHONE_NUMBER;
          const sessionPhoneNormalized = normalizePhone(dbSession.phoneNumber);
          const adminPhoneNormalized = normalizePhone(adminPhone || '');
          const isAdmin = adminPhoneNormalized.length === 9 && sessionPhoneNormalized === adminPhoneNormalized;
          
          req.firebaseUser = {
            uid: dbSession.userId,
            phone_number: dbSession.phoneNumber,
            isAdmin,
          };
          req.userId = dbSession.userId;
          console.log(`[Phone Auth DB] User: ${dbSession.phoneNumber}, isAdmin: ${isAdmin}`);
          return next();
        }
        req.authError = { code: "session_not_found", message: "phone_session_not_found" };
        return next();
      }
      
      // Check if it's a legacy phone token (phone_XXXXXXXXX format)
      if (token.startsWith('phone_')) {
        if (!ALLOW_LEGACY_PHONE_TOKENS) {
          req.authError = { code: "invalid_token", message: "legacy_phone_token_disabled" };
          return next();
        }
        const phoneDigits = token.replace('phone_', '');
        const adminPhone = process.env.ADMIN_PHONE_NUMBER;
        const tokenPhoneNormalized = normalizePhone(phoneDigits);
        const adminPhoneNormalized = normalizePhone(adminPhone || '');
        const isAdmin = adminPhoneNormalized.length === 9 && tokenPhoneNormalized === adminPhoneNormalized;
        
        req.firebaseUser = {
          uid: token,
          phone_number: `+${phoneDigits}`,
          isAdmin,
        };
        req.userId = token;
        console.log(`[Phone Auth Legacy] User: ${token}, isAdmin: ${isAdmin}`);
        return next();
      }

      // Try Firebase token verification
      if (auth) {
        const decodedToken = await auth.verifyIdToken(token);
        
        // Check if email is in ADMIN_EMAILS
        const adminEmails = (process.env.ADMIN_EMAILS || "").split(",").map(e => e.trim().toLowerCase());
        const userEmail = decodedToken.email?.toLowerCase();
        const isAdminEmail = userEmail && adminEmails.includes(userEmail);
        
        req.firebaseUser = {
          ...decodedToken,
          isAdmin: isAdminEmail || decodedToken.admin === true,
        };
        req.userId = decodedToken.uid;
        console.log(`[Firebase Auth] User: ${decodedToken.email || decodedToken.uid}, isAdmin: ${isAdminEmail}`);
      } else {
        req.authError = { code: "firebase_not_configured", message: "firebase_admin_not_configured" };
        return next();
      }
    } catch (error: any) {
      const errorCode = String(error?.code || "");
      const reason = errorCode.includes("id-token-expired") ? "token_expired" : "invalid_token";
      req.authError = { code: reason, message: error?.message };
      console.error("[Firebase Auth] Token verification error:", {
        message: error?.message,
        name: error?.name,
        stack: error?.stack,
      });
    }

    next();
  });

  // Exchange Firebase ID token for app JWT
  app.post("/api/auth/firebase", async (req: Request, res: Response) => {
    res.set("Cache-Control", "no-store");

    try {
      const idToken = req.body?.idToken as string | undefined;
      if (!idToken) {
        return res.status(400).json({ authenticated: false, error: "idToken_required" });
      }

      const firebaseAuth = auth || (await initializeFirebaseAdmin());
      if (!firebaseAuth) {
        console.error("[Firebase Auth] Admin SDK not configured");
        return res.status(500).json({ authenticated: false, error: "firebase_admin_not_configured" });
      }

      const decoded = await firebaseAuth.verifyIdToken(idToken);
      const adminEmails = (process.env.ADMIN_EMAILS || "")
        .split(",")
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean);
      const isAdminEmail =
        typeof decoded.email === "string" && adminEmails.includes(decoded.email.toLowerCase());
      const isAdminUser = decoded.admin === true || isAdminEmail === true;
      const emailValue = decoded.email ?? null;
      const firstNameValue = decoded.name || (decoded as any).given_name || null;
      const lastNameValue = (decoded as any).family_name || null;
      const profileImageUrlValue = decoded.picture ?? null;

      const jwt = signJWT({
        sub: decoded.uid,
        email: emailValue,
        firstName: firstNameValue,
        lastName: lastNameValue,
        profileImageUrl: profileImageUrlValue,
        isAdmin: isAdminUser,
      });

      return res.status(200).json({
        authenticated: true,
        authToken: jwt,
        token: jwt,
        user: {
          id: decoded.uid,
          email: decoded.email || null,
          firstName: decoded.name || (decoded as any).given_name || null,
          lastName: (decoded as any).family_name || null,
          profileImageUrl: decoded.picture || null,
          isAdmin: isAdminUser,
          source: "firebase_auth",
        },
      });
    } catch (error: any) {
      console.error("[Firebase Auth] ID token exchange failed:", error?.message || error);
      return res.status(401).json({ authenticated: false, error: "invalid_firebase_token" });
    }
  });

  // Send OTP endpoint with Twilio Verify
  app.post("/api/auth/send-otp", async (req: Request, res: Response) => {
    try {
      if (!enforceOtpRateLimit(req, res, "send", OTP_SEND_MAX, OTP_SEND_WINDOW_MS)) {
        return;
      }
      const { phoneNumber } = req.body;

      if (!phoneNumber) {
        return res.status(400).json({ error: "Phone number required" });
      }

      const verifySid = process.env.TWILIO_VERIFY_SID;
      if (!twilioClient || !verifySid) {
        console.error("[OTP] Twilio Verify not configured");
        return res.status(500).json({ error: "otp_not_configured" });
      }

      try {
        const verification = await twilioClient.verify.v2
          .services(verifySid)
          .verifications.create({ to: phoneNumber, channel: "sms" });

        console.log(`[OTP] Verification initiated for ${phoneNumber}: ${verification.status}`);
        return res.json({
          success: true,
          status: verification.status,
          message: "OTP sent to your phone",
        });
      } catch (twilioError: any) {
        console.error("[OTP] Twilio Verify error:", twilioError?.message || twilioError);
        return res.status(500).json({ error: "otp_send_failed" });
      }
    } catch (error: any) {
      console.error("[OTP] Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Verify OTP endpoint using Twilio Verify
  app.post("/api/auth/verify-otp", async (req: Request, res: Response) => {
    try {
      if (!enforceOtpRateLimit(req, res, "verify", OTP_VERIFY_MAX, OTP_VERIFY_WINDOW_MS)) {
        return;
      }
      const { phoneNumber, code } = req.body;

      if (!phoneNumber || !code) {
        return res.status(400).json({ error: "Phone and code required" });
      }

      const verifySid = process.env.TWILIO_VERIFY_SID;
      if (!twilioClient || !verifySid) {
        console.error("[OTP] Twilio Verify not configured");
        return res.status(500).json({ error: "otp_not_configured" });
      }

      const verification = await twilioClient.verify.v2
        .services(verifySid)
        .verificationChecks.create({ to: phoneNumber, code });

      if (verification.status !== "approved") {
        return res.status(400).json({ error: "invalid_or_expired_otp" });
      }

      const normalizedPhone = normalizePhone(phoneNumber);
      const fallbackUserId = `phone_${normalizedPhone}`;
      const ensureUsersSql = `
-- Ensure users table exists with phone storage
CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email varchar,
  first_name varchar,
  last_name varchar,
  phone_number varchar,
  auth_provider varchar,
  auth_provider_id varchar,
  profile_image_url varchar,
  is_technician boolean DEFAULT false,
  is_admin boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_users_phone_number ON users(phone_number);
      `.trim();

      let userId = fallbackUserId;

      // Look up user by phone number (best-effort)
      try {
        const { resp, data } = await pgFetch(
          `/users?phone_number=eq.${encodeURIComponent(phoneNumber)}&select=id,phone_number&limit=1`,
        );

        if (resp.ok && Array.isArray(data) && data[0]?.id) {
          userId = data[0].id;
        } else {
          console.warn("[OTP][Users] Not found; ensure users table exists. SQL:\n" + ensureUsersSql);
          // Try to create a minimal user with phone
          try {
            const { resp: createResp, data: createData } = await pgFetch("/users", {
              method: "POST",
              body: [
                {
                  phone_number: phoneNumber,
                  auth_provider: "phone",
                  auth_provider_id: fallbackUserId,
                  is_admin: false,
                  is_technician: false,
                },
              ],
            });
            if (createResp.ok) {
              const created = Array.isArray(createData) ? createData[0] : createData;
              if (created?.id) {
                userId = created.id;
              }
            } else {
              console.warn("[OTP][Users] Create user failed:", createResp.status, createData);
              console.warn("[OTP][Users][SQL] Run this if table/column is missing:\n" + ensureUsersSql);
            }
          } catch (createErr: any) {
            console.warn("[OTP][Users] Create user error:", createErr?.message || createErr);
            console.warn("[OTP][Users][SQL] Run this if table/column is missing:\n" + ensureUsersSql);
          }
        }
      } catch (userErr: any) {
        console.warn("[OTP][Users] Lookup error:", userErr?.message || userErr);
        console.warn("[OTP][Users][SQL] Run this if table/column is missing:\n" + ensureUsersSql);
      }

      const sessionToken = createSessionToken();
      const adminPhone = process.env.ADMIN_PHONE_NUMBER;
      const sessionPhoneNormalized = normalizePhone(phoneNumber);
      const adminPhoneNormalized = normalizePhone(adminPhone || "");
      const isAdmin = adminPhoneNormalized.length === 9 && sessionPhoneNormalized === adminPhoneNormalized;
      const authToken = signJWT({
        sub: userId,
        email: null,
        phone: phoneNumber,
        firstName: null,
        lastName: null,
        profileImageUrl: null,
        isAdmin,
      });
      console.info("[OTP Verify] Auth token generated", {
        userId,
        phoneNumber,
        tokenPreview: `${authToken.slice(0, 12)}...`,
      });

      // Best-effort session persistence
      try {
        const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
        await storage.createPhoneSession({
          token: sessionToken,
          userId,
          phoneNumber,
          expiresAt,
        });
        console.log(`[OTP] Session persisted to database for: ${userId}`);
      } catch (dbError: any) {
        const phoneSessionsSql = `
-- Ensure phone_sessions table exists for OTP sessions
CREATE TABLE IF NOT EXISTS phone_sessions (
  token varchar PRIMARY KEY,
  user_id varchar NOT NULL,
  phone_number varchar NOT NULL,
  created_at timestamptz DEFAULT now(),
  expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_phone_session_expires ON phone_sessions (expires_at);
        `.trim();
        console.error("[OTP] Failed to persist session (login continues):", dbError?.message || dbError);
        console.warn("[OTP][SQL] To enable session persistence, run:\n" + phoneSessionsSql);
      }

      const user = {
        id: userId,
        phoneNumber,
        isAdmin,
      };

      res.cookie(AUTH_COOKIE_NAME, authToken, getAuthCookieOptions());

      return res.json({
        success: true,
        authenticated: true,
        authToken,
        token: authToken,
        sessionToken,
        user,
      });
    } catch (error: any) {
      console.error("[OTP Verify] Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Logout endpoints (both paths kept for backward compatibility)
  const handleLogout = (_req: Request, res: Response) => {
    res.clearCookie("session");
    res.clearCookie(AUTH_COOKIE_NAME, getAuthCookieOptions());
    res.json({ message: "Logged out successfully" });
  };
  app.post("/api/auth/logout", handleLogout);
  app.post("/api/logout", handleLogout);
}

export const isAuthenticated = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  // Check Firebase/Phone Auth first (set by firebaseMiddleware)
  if (req.firebaseUser) {
    console.log("[Auth Check] Firebase/Phone user:", req.firebaseUser.uid);
    return next();
  }
  
  // Check for JWT token in Authorization header (Google OAuth / custom JWT)
  const authHeader = req.headers.authorization;
  const tokenMatch = authHeader?.match(/^Bearer\s+(.+)$/i);
  if (tokenMatch) {
    const token = tokenMatch[1];
    const payload = verifyJWT(token);
    
    if (payload) {
      // Attach JWT user to request for downstream handlers
      (req as any).jwtUser = payload;
      console.log("[Auth Check] JWT user:", payload.email);
      return next();
    }
  }
  
  // Check Replit Auth (Passport session)
  const replitUser = (req as any).user;
  if (replitUser?.claims) {
    console.log("[Auth Check] Replit user:", replitUser.claims.email || replitUser.claims.sub);
    return next();
  }
  
  // Check if Passport session is authenticated
  if ((req as any).isAuthenticated && (req as any).isAuthenticated()) {
    console.log("[Auth Check] Passport session authenticated");
    return next();
  }
  
  const hasAuthHeader = Boolean(req.headers.authorization);
  const reason =
    (req as any).authError?.code || (hasAuthHeader ? "invalid_token" : "missing_token");
  console.log("[Auth Check] No authenticated user found", { reason });
  return res.status(401).json({ message: "Unauthorized", code: "UNAUTHORIZED", reason });
};

export const isAdmin = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  // Helper to check if email is in ADMIN_EMAILS
  const isAdminEmail = (email: string | undefined | null): boolean => {
    if (!email) return false;
    const adminEmails = (process.env.ADMIN_EMAILS || "malborotbo@gmail.com").split(",").map((e: string) => e.trim().toLowerCase());
    return adminEmails.includes(email.toLowerCase());
  };

  try {
    // Check JWT user first (set by isAuthenticated middleware)
    const jwtUser = (req as any).jwtUser;
    if (jwtUser) {
      if (jwtUser.isAdmin === true || isAdminEmail(jwtUser.email)) {
        console.log("[Admin Check] JWT admin user verified:", jwtUser.email);
        return next();
      }
      console.log("[Admin Check] JWT user not admin:", jwtUser.email);
      return res.status(403).json({ message: "Forbidden" });
    }

    // Check if phone auth user with isAdmin flag set by middleware
    if (req.firebaseUser) {
      if (req.firebaseUser.isAdmin === true || isAdminEmail(req.firebaseUser.email)) {
        console.log("[Admin Check] Firebase/Phone admin user verified:", req.firebaseUser.email || req.firebaseUser.uid);
        return next();
      }
      
      // Check Firebase custom claims for Firebase auth users
      if (auth && !req.firebaseUser.uid.startsWith('phone_') && !req.firebaseUser.uid.startsWith('session_')) {
        try {
          const userRecord = await auth.getUser(req.firebaseUser.uid);
          if (userRecord.customClaims?.admin === true) {
            console.log("[Admin Check] Firebase custom claims admin verified");
            return next();
          }
        } catch (e) {
          // User not found in Firebase
        }
      }
      
      console.log("[Admin Check] Firebase user not admin:", req.firebaseUser.uid);
      return res.status(403).json({ message: "Forbidden" });
    }

    // Check Replit Auth user (req.user from passport)
    const replitUser = (req as any).user;
    if (replitUser?.claims) {
      const userEmail = replitUser.claims.email;
      if (isAdminEmail(userEmail)) {
        console.log("[Admin Check] Replit Auth admin user verified:", userEmail);
        return next();
      }
      console.log("[Admin Check] Replit user not admin:", userEmail);
      return res.status(403).json({ message: "Forbidden" });
    }

    // No authenticated user found
    console.log("[Admin Check] No authenticated user for admin check");
    return res.status(401).json({ message: "Unauthorized" });
  } catch (error) {
    console.error("Admin check error:", error);
    res.status(403).json({ message: "Forbidden" });
  }
};
