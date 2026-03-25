import express from "express";
import { createServer } from "http";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { errorHandler, getRequestLang, normalizeErrorBody } from "./errors";

// Wrap entire initialization in try-catch for Autoscale deployments
async function startServer() {
  try {
    const app = express();

    // Trust reverse proxies (Render/Cloudflare) so secure cookies work correctly
    app.set("trust proxy", true);

    // Minimal CORS to allow the Capacitor WebView (capacitor://localhost) and web origins
    const allowedOrigins = new Set([
      "capacitor://localhost",
      "http://localhost",
      "http://localhost:5173",
      "http://127.0.0.1:5173",
      "https://cyclecaretec.com",
      "https://www.cyclecaretec.com",
    ]);

    const allowedHostSuffixes = [".cyclecaretec.com"];
    const isAllowedOrigin = (origin: string) => {
      try {
        const parsed = new URL(origin);
        const protocolAllowed =
          parsed.protocol === "https:" ||
          parsed.protocol === "http:" ||
          parsed.protocol === "capacitor:";
        if (!protocolAllowed) return false;
        if (allowedOrigins.has(origin)) return true;
        return allowedHostSuffixes.some(
          (suffix) => parsed.hostname === suffix.slice(1) || parsed.hostname.endsWith(suffix),
        );
      } catch {
        return false;
      }
    };

    app.use((req, res, next) => {
      const origin = req.headers.origin;
      const allowed = typeof origin === "string" ? isAllowedOrigin(origin) : false;

      if (allowed && origin) {
        res.setHeader("Access-Control-Allow-Origin", origin);
        res.setHeader("Vary", "Origin");
        res.setHeader("Access-Control-Allow-Credentials", "true");
      }
      res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Lang, Accept-Language");
      if (req.method === "OPTIONS") {
        if (origin && !allowed) {
          return res.sendStatus(403);
        }
        return res.sendStatus(204);
      }
      next();
    });

    app.use((_req, res, next) => {
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("X-Frame-Options", "DENY");
      res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
      next();
    });

    // دعم RAW BODY
    app.use(
      express.json({
        verify: (req: any, _res, buf) => {
          req.rawBody = buf;
        },
      })
    );

    app.use(express.urlencoded({ extended: false }));

    // Language + error response normalization (keeps responses consistent)
    app.use((req, res, next) => {
      (req as any).lang = getRequestLang(req);
      const originalJson = res.json.bind(res);
      res.json = (body: any) => {
        if (res.statusCode >= 400) {
          const lang = (req as any).lang || getRequestLang(req);
          return originalJson(normalizeErrorBody(res.statusCode, body, lang));
        }
        return originalJson(body);
      };
      next();
    });

    // لوق API
    app.use((req, res, next) => {
      const start = Date.now();
      const path = req.path;

      res.on("finish", () => {
        if (path.startsWith("/api")) {
          const duration = Date.now() - start;
          log(`${req.method} ${path} ${res.statusCode} in ${duration}ms`);
        }
      });

      next();
    });

    // Health check endpoint for Autoscale deployments
    app.get("/health", (_req, res) => {
      res.status(200).json({ status: "healthy", timestamp: new Date().toISOString() });
    });

    // TEST
    app.get("/api/test", (_req, res) => {
      res.json({ ok: true });
    });

    // ===========================
    // 🔥 API ROUTES هنا
    // ===========================
    await registerRoutes(app);
    log("API routes registered");

    // Error handler
    app.use(errorHandler);

    // ===========================
    // 🔥 FRONTEND STATIC آخر شيء
    // ===========================
    const server = createServer(app);

    if (app.get("env") === "development") {
      await setupVite(app, server);
    } else {
      serveStatic(app);
    }

    // Use PORT environment variable (required for Autoscale deployments)
    const port = Number(process.env.PORT) || 5000;

    server.listen(port, "0.0.0.0", () => {
      log(`Server running on port ${port}`);
    });

    // Handle graceful shutdown
    process.on("SIGTERM", () => {
      log("SIGTERM received, shutting down gracefully");
      server.close(() => {
        log("Server closed");
        process.exit(0);
      });
    });

  } catch (error: any) {
    console.error("[Server] Fatal startup error:", error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Start the server
startServer();
