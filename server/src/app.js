import fs from "node:fs";
import path from "node:path";
import express from "express";
import { CORS_ORIGIN, REPO_ROOT } from "./config.js";
import profilesRouter from "./routes/profiles.js";
import generateRouter from "./routes/generate.js";
import historyRouter from "./routes/history.js";
import proxyRouter from "./routes/proxy.js";
import v1Router from "./routes/v1.js";
import discoverRouter from "./routes/discover.js";
import agentRouter from "./routes/agent.js";

/** Express 应用（与监听端口解耦，方便测试直接 listen(0)） */
export function createApp() {
  const app = express();
  app.disable("x-powered-by");

  /* ---------- CORS ---------- */
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    const allow = CORS_ORIGIN.split(",").map((s) => s.trim()).filter(Boolean);
    if (allow.includes("*")) {
      res.setHeader("Access-Control-Allow-Origin", "*");
    } else if (origin && allow.includes(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
    }
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, x-goog-api-key, api-key, x-upstream-base");
    if (req.method === "OPTIONS") return res.status(204).end();
    next();
  });

  /* 参考图以 base64 整张上传，放宽 body 限制 */
  app.use(express.json({ limit: "32mb" }));

  /* ---------- 扩展接口 ---------- */
  app.get("/api/health", (req, res) => {
    res.json({ ok: true, service: "multi-vendor-image-studio", time: new Date().toISOString() });
  });
  app.use("/api", profilesRouter);
  app.use("/api", generateRouter);
  app.use("/api", historyRouter);
  app.use("/api", proxyRouter);
  app.use("/api", discoverRouter);
  app.use("/api", agentRouter);

  /* ---------- OpenAI 兼容协议层 ---------- */
  app.use("/v1", v1Router);

  /* ---------- 前端构建产物（可选） ---------- */
  const dist = path.join(REPO_ROOT, "web", "dist");
  if (fs.existsSync(dist)) {
    app.use(express.static(dist));
    app.get(/^(?!\/api).*/, (req, res) => res.sendFile(path.join(dist, "index.html")));
  }

  /* ---------- 错误处理 ---------- */
  app.use((req, res) => {
    res.status(404).json({ error: { message: `找不到接口：${req.method} ${req.path}` } });
  });
  app.use((err, req, res, next) => {
    console.error("[server] 未捕获异常:", err);
    res.status(err.status || 500).json({ error: { message: err.message || "服务器内部错误" } });
  });

  return app;
}

export default createApp;
