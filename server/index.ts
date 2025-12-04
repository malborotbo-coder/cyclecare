import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";

const app = express();

// دعم قراءة RAW BODY
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
  }),
);

app.use(express.urlencoded({ extended: false }));

// ———————————————————————————————
// ⭐ أهم خطوة: تفعيل رفع الملفات
// تصبح كل عمليات الرفع عبر:
// POST /api/public/technicians/upload
// ———————————————————————————————
// ———————————————————————————————
// لوق لكل API
// ———————————————————————————————
app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }
      if (logLine.length > 80) logLine = logLine.slice(0, 79) + "…";
      log(logLine);
    }
  });

  next();
});

// ———————————————————————————————
// 🔥 API TEST ENDPOINT
// ———————————————————————————————
app.get("/api/test", (req, res) => {
  res.json({ ok: true, message: "API is working 🎉" });
});

// ———————————————————————————————
// تشغيل السيرفر
// ———————————————————————————————
(async () => {
  const server = await registerRoutes(app);

  // Error handler
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    res.status(status).json({ message });
    throw err;
  });

  // Serve PWA public
  app.use(express.static("public"));

  // VITE في التطوير فقط
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const port = parseInt(process.env.PORT || "5000", 10);

  server.on("error", (err: any) => {
    if (err.code === "EADDRINUSE") {
      console.error(`Server error: Port ${port} already in use. Retrying...`);
      server.close();
      setTimeout(() => server.listen(port, "0.0.0.0"), 3000);
    } else {
      throw err;
    }
  });

  server.listen(port, "0.0.0.0", () => log(`serving on port ${port}`));
})();
