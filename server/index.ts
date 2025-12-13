import express, { Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { setupGoogleAuth } from "./googleAuth";

const app = express();

// دعم RAW BODY
declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(
  express.json({
    verify: (req, _res, buf) => {
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

(async () => {
  try {
    // 🔥 Google Auth (لازم داخل async)
    await setupGoogleAuth(app);

    // 🔥 Route اختبار مؤكد
    app.get("/api/test", (_req, res) => {
      res.json({ ok: true });
    });

    // 🔥 تسجيل كل الـ API
    const server = await registerRoutes(app);

    // Error handler
    app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
      const status = err.status || 500;
      res.status(status).json({
        message: err.message || "Server error",
      });
    });

    // 🔥 Frontend
    if (app.get("env") === "development") {
      await setupVite(app, server);
    } else {
      serveStatic(app);
    }

    const port = Number(process.env.PORT) || 3000;

    server.listen(port, "0.0.0.0", () => {
      log(`🚀 Server running on port ${port}`);
    });
  } catch (err) {
    console.error("❌ Failed to start server:", err);
    process.exit(1);
  }
})();
