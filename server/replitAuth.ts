import * as client from "openid-client";
import { Strategy, type VerifyFunction } from "openid-client/passport";
import passport from "passport";
import session from "express-session";
import type { Express, RequestHandler } from "express";
import memoize from "memoizee";
import connectPg from "connect-pg-simple";
import { storage } from "./storage";

declare module "express-session" {
  interface SessionData {
    redirectTo?: string;
    nativeCallback?: string;
  }
}

const getOidcConfig = memoize(
  async () => {
    return await client.discovery(
      new URL(process.env.ISSUER_URL ?? "https://replit.com/oidc"),
      process.env.REPL_ID!,
    );
  },
  { maxAge: 3600 * 1000 },
);

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

  return session({
    secret: process.env.SESSION_SECRET!,
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: !isLocalDev,
      sameSite: "lax",
      maxAge: sessionTtl,
    },
  });
}

function updateUserSession(
  user: any,
  tokens: client.TokenEndpointResponse & client.TokenEndpointResponseHelpers,
) {
  user.claims = tokens.claims();
  user.access_token = tokens.access_token;
  user.refresh_token = tokens.refresh_token;
  user.expires_at = user.claims?.exp;
}

async function upsertUser(claims: any) {
  const adminEmails = (process.env.ADMIN_EMAILS || "")
    .split(",")
    .filter((e) => e.trim());
  const isAdmin = adminEmails.some(
    (email) => email.trim().toLowerCase() === claims["email"]?.toLowerCase(),
  );

  const userData: any = {
    id: claims["sub"],
    email: claims["email"],
    firstName: claims["first_name"],
    lastName: claims["last_name"],
    profileImageUrl: claims["profile_image_url"],
  };

  if (isAdmin) userData.isAdmin = true;

  await storage.upsertUser(userData);
}

export async function setupAuth(app: Express) {
  app.set("trust proxy", 1);
  app.use(getSession());
  app.use(passport.initialize());
  app.use(passport.session());

  const config = await getOidcConfig();

  const verify: VerifyFunction = async (
    tokens: client.TokenEndpointResponse & client.TokenEndpointResponseHelpers,
    verified: passport.AuthenticateCallback,
  ) => {
    const user = {};
    updateUserSession(user, tokens);
    await upsertUser(tokens.claims());
    verified(null, user);
  };

  const registeredStrategies = new Set<string>();

  const ensureStrategy = (domain: string) => {
    const strategyName = `replitauth:${domain}`;
    if (!registeredStrategies.has(strategyName)) {
      const callbackURL = `https://${domain}/api/callback`;
      console.log(
        `[AUTH] Registering strategy for ${domain}, callback: ${callbackURL}`,
      );

      const strategy = new Strategy(
        {
          name: strategyName,
          config,
          scope: "openid email profile offline_access",
          callbackURL,
        },
        verify,
      );
      passport.use(strategy);
      registeredStrategies.add(strategyName);
    }
  };

  passport.serializeUser((user: Express.User, cb) => cb(null, user));
  passport.deserializeUser((user: Express.User, cb) => cb(null, user));

  // ---------------------------------------
  // 🔥 LOGIN WITH redirectTo SUPPORT
  // ---------------------------------------
  app.get("/api/login", (req, res, next) => {
    console.log(`[AUTH] Login request - Hostname: ${req.hostname}`);

    const redirectTo = (req.query.redirectTo as string) || "/";
    const nativeCallback = req.query.nativeCallback as string | undefined;
    
    req.session.redirectTo = redirectTo;
    if (nativeCallback) {
      req.session.nativeCallback = decodeURIComponent(nativeCallback);
      console.log(`[AUTH] Native callback saved: ${req.session.nativeCallback}`);
    }

    ensureStrategy(req.hostname);

    passport.authenticate(`replitauth:${req.hostname}`, {
      prompt: "login consent",
      scope: ["openid", "email", "profile", "offline_access"],
    })(req, res, next);
  });

  // ---------------------------------------
  // 🔥 CALLBACK WITH redirectTo RETURNING TO MOBILE APP
  // ---------------------------------------
  app.get("/api/callback", (req, res, next) => {
    console.log(`[AUTH] Callback request - Hostname: ${req.hostname}`);

    ensureStrategy(req.hostname);

    passport.authenticate(`replitauth:${req.hostname}`, {
      failureRedirect: "/auth?error=login_failed",
    })(req, res, (err: any) => {
      if (err) {
        console.error("[AUTH] Callback error:", err);
        const nativeCallback = req.session.nativeCallback;
        if (nativeCallback) {
          return res.redirect(`${nativeCallback}?error=auth_failed`);
        }
        return res.redirect("/auth?error=auth_failed");
      }

      const nativeCallback = req.session.nativeCallback;
      const redirectTo = req.session.redirectTo || "/";
      
      if (nativeCallback) {
        const user = req.user as any;
        const sessionId = req.sessionID;
        console.log("[AUTH] Native callback redirect:", nativeCallback);
        
        delete req.session.nativeCallback;
        
        return res.redirect(`${nativeCallback}?success=true&session=${sessionId}`);
      }
      
      console.log("[AUTH] Redirecting to:", redirectTo);
      res.redirect(redirectTo);
    });
  });

  // ---------------------------------------
  // 🔥 LOGOUT
  // ---------------------------------------
  app.post("/api/logout", (req, res) => {
    console.log("[AUTH] Logout requested");

    req.user = undefined;

    req.logout((logoutErr: any) => {
      if (logoutErr) console.error("[AUTH] Passport logout error:", logoutErr);

      if (req.session) {
        req.session.destroy((err: any) => {
          if (err) console.error("[AUTH] Session destroy error:", err);

          res.clearCookie("connect.sid", {
            path: "/",
            httpOnly: true,
            secure: process.env.NODE_ENV !== "development",
            sameSite: "lax",
          });

          res.clearCookie("session", {
            path: "/",
            httpOnly: true,
            secure: process.env.NODE_ENV !== "development",
            sameSite: "lax",
          });

          console.log("[AUTH] Logout complete");
          res.status(200).json({ success: true });
        });
      } else {
        res.clearCookie("connect.sid");
        console.log("[AUTH] Logout complete (no session)");
        res.status(200).json({ success: true });
      }
    });
  });
}

// ---------------------------------------
// 🔥 Middlewares (Optional)
// ---------------------------------------
export const isAuthenticated: RequestHandler = async (req, res, next) => {
  // Check Firebase/Phone Auth first (from firebaseMiddleware)
  if ((req as any).firebaseUser) {
    console.log("[AUTH] Firebase/Phone user authenticated:", (req as any).firebaseUser.uid);
    return next();
  }

  // Check Replit Auth (Passport)
  const user = req.user as any;
  if (!req.isAuthenticated || !req.isAuthenticated()) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  // Check token expiration
  if (!user || !user.expires_at) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const now = Math.floor(Date.now() / 1000);
  if (now <= user.expires_at) {
    console.log("[AUTH] Replit user authenticated:", user.claims?.sub);
    return next();
  }

  // Try to refresh token
  if (!user.refresh_token) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  try {
    const config = await getOidcConfig();
    const tokenResponse = await client.refreshTokenGrant(
      config,
      user.refresh_token,
    );
    updateUserSession(user, tokenResponse);
    console.log("[AUTH] Token refreshed for user:", user.claims?.sub);
    return next();
  } catch (error) {
    console.error("[AUTH] Token refresh failed:", error);
    return res.status(401).json({ message: "Unauthorized" });
  }
};

export const isAdmin: RequestHandler = async (req, res, next) => {
  // Check Firebase/Phone Auth first
  if ((req as any).firebaseUser) {
    if ((req as any).firebaseUser.isAdmin === true) {
      console.log("[AUTH] Firebase admin user authorized");
      return next();
    }
    return res.status(403).json({ message: "Forbidden: Admin access required" });
  }

  // Check Replit Auth
  const user = req.user as any;
  if (!user?.claims?.sub) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const dbUser = await storage.getUser(user.claims.sub);
  if (!dbUser || !dbUser.isAdmin) {
    console.log("[AUTH] User is not admin:", user.claims.sub);
    return res.status(403).json({ message: "Forbidden: Admin access required" });
  }

  console.log("[AUTH] Replit admin user authorized:", user.claims.sub);
  return next();
};
