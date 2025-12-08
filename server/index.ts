import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { setupGoogleAuth } from "./googleAuth";

// Wrap entire initialization in try-catch for Autoscale deployments
async function startServer() {
  try {
    const app = express();

    // دعم RAW BODY
    app.use(
      express.json({
        verify: (req: any, _res, buf) => {
          req.rawBody = buf;
        },
      })
    );

    app.use(express.urlencoded({ extended: false }));

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
    app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
      const status = err.status || 500;
      console.error("[Server] Error:", err.message);
      res.status(status).json({ message: err.message || "Server error" });
    });

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
