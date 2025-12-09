import type { Express, Request, Response, NextFunction } from "express";
import admin from "firebase-admin";
import twilio from "twilio";
import { storage } from "./storage";
import { verifyJWT } from "./jwt";

declare global {
  var otpSessions: Record<string, { phoneNumber: string; code: string; timestamp: number; verified: boolean }> | undefined;
}

// Initialize Twilio
const twilioClient = process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN
  ? twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
  : null;

let auth: admin.auth.Auth | null = null;
let initialized = false;

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
    }
  }
}

export async function setupFirebaseAuth(app: Express) {
  await initializeFirebaseAdmin();

  // Helper to normalize phone numbers
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

  // Middleware to verify Firebase ID tokens or phone session tokens
  app.use("/api", async (req: Request, res: Response, next: NextFunction) => {
    const token = req.headers.authorization?.split("Bearer ")[1];

    if (!token) {
      return next();
    }

    try {
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
      }
      
      // Check if it's a legacy phone token (phone_XXXXXXXXX format)
      if (token.startsWith('phone_')) {
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
        // Fallback to mock auth if Firebase not initialized
        const decoded = JSON.parse(Buffer.from(token.split(".")[1], "base64").toString());
        req.firebaseUser = decoded;
        req.userId = decoded.uid;
      }
    } catch (error) {
      console.error("[Firebase Auth] Token verification error:", error);
    }

    next();
  });

  // Send OTP endpoint with Twilio
  app.post("/api/auth/send-otp", async (req: Request, res: Response) => {
    try {
      const { phoneNumber } = req.body;

      if (!phoneNumber) {
        return res.status(400).json({ error: "Phone number required" });
      }

      // Admin phone bypass - use fixed code for admin
      const adminPhone = process.env.ADMIN_PHONE_NUMBER;
      // Normalize phone to E.164 format for comparison
      const normalizePhone = (p: string): string => {
        if (!p) return '';
        // Remove all non-digits
        let digits = p.replace(/\D/g, '');
        // If starts with 966, keep as is
        // If 10 digits starting with 0, remove the 0
        // If 9 digits, that's the core number
        if (digits.startsWith('966')) {
          digits = digits.slice(3); // Remove country code for comparison
        }
        if (digits.startsWith('0')) {
          digits = digits.slice(1); // Remove leading 0
        }
        return digits.slice(-9); // Get last 9 digits
      };
      
      const incomingNormalized = normalizePhone(phoneNumber);
      const adminNormalized = normalizePhone(adminPhone || '');
      const isAdminPhone = adminNormalized.length === 9 && incomingNormalized === adminNormalized;
      
      console.log(`[OTP] Phone check: incoming="${phoneNumber}" -> "${incomingNormalized}", admin="${adminPhone}" -> "${adminNormalized}", isAdmin=${isAdminPhone}`);

      // Generate 6-digit OTP code (or use 123456 for admin)
      const code = isAdminPhone ? "123456" : Math.floor(100000 + Math.random() * 900000).toString();
      const sessionId = `otp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      // Store session with code
      if (!global.otpSessions) {
        (global as any).otpSessions = {};
      }
      (global as any).otpSessions[sessionId] = {
        phoneNumber,
        code,
        timestamp: Date.now(),
        verified: false,
      };

      console.log(`[OTP] Session created: ${sessionId} for ${phoneNumber}, code: ${code}${isAdminPhone ? ' (ADMIN)' : ''}`);

      // Admin bypass - skip Twilio, use fixed code
      if (isAdminPhone) {
        console.log(`[OTP] Admin phone detected - use code: 123456`);
        return res.json({
          success: true,
          sessionId,
          message: "OTP sent to your phone",
          isAdmin: true,
        });
      }

      // Send SMS via Twilio if available
      if (twilioClient) {
        try {
          const message = await twilioClient.messages.create({
            body: `Your Cycle Care OTP: ${code}`,
            from: process.env.TWILIO_PHONE_NUMBER,
            to: phoneNumber,
          });
          console.log(`[OTP] SMS sent via Twilio: ${message.sid}`);
        } catch (twilioError: any) {
          console.error("[OTP] Twilio error:", twilioError.message);
          // For international numbers, Twilio trial may fail - allow mock mode
          console.warn("[OTP] Falling back to mock mode due to Twilio limitation");
          return res.json({
            success: true,
            sessionId,
            message: "OTP sent to your phone",
            mockMode: true,
          });
        }
      } else {
        console.warn("[OTP] Twilio not configured, using mock mode");
      }

      res.json({
        success: true,
        sessionId,
        message: "OTP sent to your phone",
      });
    } catch (error: any) {
      console.error("[OTP] Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Verify OTP endpoint
  app.post("/api/auth/verify-otp", async (req: Request, res: Response) => {
    try {
      const { sessionId, code } = req.body;

      if (!sessionId || !code) {
        return res.status(400).json({ error: "Session and code required" });
      }

      if (!global.otpSessions || !global.otpSessions[sessionId]) {
        return res.status(400).json({ error: "Invalid or expired session" });
      }

      const session = (global as any).otpSessions[sessionId];

      // Verify code format
      if (!/^\d{6}$/.test(code)) {
        return res.status(400).json({ error: "Invalid code format" });
      }

      // Compare with stored code
      if (session.code !== code) {
        return res.status(400).json({ error: "Invalid OTP code" });
      }

      // Check session expiry (5 minutes)
      if (Date.now() - session.timestamp > 5 * 60 * 1000) {
        return res.status(400).json({ error: "OTP expired" });
      }

      // Mark as verified
      session.verified = true;
      const phoneNumber = session.phoneNumber;

      console.log(`[OTP] Verified for ${phoneNumber}`);

      // Try Firebase first, fallback to simple token if it fails
      let customToken: string | null = null;
      let userId: string | null = null;

      if (auth) {
        try {
          // Try to get user by phone, if not exists create one
          let user: any;
          try {
            user = await auth.getUserByPhoneNumber(phoneNumber);
            console.log(`[OTP] Existing Firebase user found: ${user.uid}`);
          } catch (err: any) {
            if (err.code === 'auth/user-not-found') {
              user = await auth.createUser({
                phoneNumber,
                disabled: false,
              });
              console.log(`[OTP] New Firebase user created: ${user.uid}`);
            } else {
              throw err;
            }
          }

          // Create custom token
          customToken = await auth.createCustomToken(user.uid);
          userId = user.uid;
          console.log(`[OTP] Custom token created for ${user.uid}`);
        } catch (firebaseError: any) {
          console.warn("[OTP] Firebase token creation failed, using fallback:", firebaseError.message);
        }
      }

      // If Firebase failed, create a simple session token and persist to database
      if (!customToken) {
        // Generate a simple session token
        userId = `phone_${phoneNumber.replace(/\D/g, '')}`;
        customToken = `session_${Date.now()}_${Math.random().toString(36).substr(2, 16)}`;
        
        // Store the session in database for persistence across server restarts
        try {
          // Session expires in 30 days
          const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
          await storage.createPhoneSession({
            token: customToken,
            userId,
            phoneNumber,
            expiresAt,
          });
          console.log(`[OTP] Session persisted to database for: ${userId}`);
        } catch (dbError: any) {
          console.error("[OTP] Failed to persist session:", dbError.message);
        }
        
        console.log(`[OTP] Fallback session created: ${userId}`);
      }

      res.json({
        success: true,
        message: "Phone verified successfully",
        phoneNumber,
        customToken,
        userId,
        useSimpleAuth: !auth || customToken.startsWith('session_'),
      });
    } catch (error: any) {
      console.error("[OTP Verify] Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Logout endpoint
  app.post("/api/auth/logout", (req: Request, res: Response) => {
    res.clearCookie("session");
    res.json({ message: "Logged out successfully" });
  });
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
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
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
  
  console.log("[Auth Check] No authenticated user found");
  return res.status(401).json({ message: "Unauthorized" });
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
