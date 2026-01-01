import express from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { setupGoogleAuth } from "./googleAuth";
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
    app.use((req, res, next) => {
      const origin = req.headers.origin;
      if (origin) {
        try {
          const hostname = new URL(origin).hostname;
          if (allowedOrigins.has(origin) || hostname.endsWith("cyclecaretec.com")) {
            res.setHeader("Access-Control-Allow-Origin", origin);
            res.setHeader("Vary", "Origin");
          }
        } catch {
          // Ignore malformed Origin headers
        }
      }
      res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
      res.setHeader("Access-Control-Allow-Credentials", "true");
      if (req.method === "OPTIONS") {
        return res.sendStatus(204);
      }
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

      const originalResJson = res.json;
      let captured: any;

      res.json = function (body, ...args) {
        captured = body;
        return originalResJson.apply(res, [body, ...args]);
      };

      res.on("finish", () => {
        if (path.startsWith("/api")) {
          const duration = Date.now() - start;
          let line = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
          if (captured) line += ` :: ${JSON.stringify(captured)}`;
          log(line);
        }
      });

      next();
    });

    // Health check endpoint for Autoscale deployments
    app.get("/health", (_req, res) => {
      res.status(200).json({ status: "healthy", timestamp: new Date().toISOString() });
    });

    // ===========================
    // 🔥 الأهم: GoogleAuth هنا
    // ===========================
    try {
      await setupGoogleAuth(app);
      log("Google Auth setup completed");
    } catch (authError: any) {
      console.error("[Server] Google Auth setup error:", authError.message);
      // Continue without Google Auth in case of error
    }

    // TEST
    app.get("/api/test", (_req, res) => {
      res.json({ ok: true });
    });

    // ===========================
    // 🔥 API ROUTES هنا
    // ===========================
    const server = await registerRoutes(app);
    log("API routes registered");

    // Error handler
    app.use(errorHandler);

    // ===========================
    // 🔥 FRONTEND STATIC آخر شيء
    // ===========================
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
