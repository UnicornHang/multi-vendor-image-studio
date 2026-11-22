import fs from "node:fs";
import path from "node:path";
import { HOST, PORT, REPO_ROOT } from "./config.js";
import { createApp } from "./app.js";

const app = createApp();

app.listen(PORT, HOST, () => {
  console.log(`[server] http://${HOST}:${PORT}`);
  console.log(`[server] 扩展接口：GET /api/health · GET /api/profiles · POST /api/generate · GET/POST/DELETE /api/history · POST /api/proxy/*`);
  console.log(`[server] OpenAI 兼容：POST /v1/images/generations · GET /v1/models · GET /v1/providers · GET /v1/usage`);
  const dist = path.join(REPO_ROOT, "web", "dist");
  if (fs.existsSync(dist)) console.log(`[server] 已托管前端构建产物：${dist}`);
});
