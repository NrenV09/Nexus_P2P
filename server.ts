import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Health check routes for Cloud Run / load balancers
  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  // Support direct offline single-file download in production
  app.get("/QuantumLink.html", (_req, res) => {
    const filePath = path.join(process.cwd(), "dist", "index.html");
    if (fs.existsSync(filePath)) {
      res.setHeader("Content-Disposition", "attachment; filename=QuantumLink.html");
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      return res.sendFile(filePath);
    }
    return res.status(404).send("File not found");
  });

  // Vite middleware for development vs static serve for production
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
