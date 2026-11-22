#!/usr/bin/env node
/**
 * 多厂商图像生成 · 本地转发代理（解决浏览器 CORS 限制）
 *
 * 用法：
 *   node proxy.js                        # 监听 127.0.0.1:8787
 *   PORT=9000 node proxy.js              # 自定义端口
 *   ALLOW_ANY_UPSTREAM=1 node proxy.js   # 允许任意上游（默认仅允许白名单内的厂商域名）
 *
 * 工作方式：
 *   浏览器 POST {proxy}/v1/image_generation
 *     Header: x-upstream-base: https://api.minimaxi.com   ← 指明转发到哪个厂商
 *     Header: Authorization: Bearer sk-xxx                 ← 原样透传
 *   代理 → https://api.minimaxi.com/v1/image_generation
 *
 * 页面上的「代理前缀」填 http://127.0.0.1:8787 即可，无需为每家厂商分别配置。
 */

const http = require("http");
const https = require("https");
const { URL } = require("url");

const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || "127.0.0.1";
const ALLOW_ANY = process.env.ALLOW_ANY_UPSTREAM === "1";

/** 默认允许的上游域名白名单（覆盖页面上内置的厂商 + 常见 OpenAI 兼容网关） */
const ALLOWED_HOSTS = new Set([
  "api.minimaxi.com",
  "api.minimax.io",
  "api.openai.com",
  "generativelanguage.googleapis.com",
  "api.deepseek.com",
  "open.bigmodel.cn",
  "api.siliconflow.cn",
  "api.moonshot.cn",
  "dashscope.aliyuncs.com"
]);

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-goog-api-key, api-key, x-upstream-base"
};

function pickUpstream(req) {
  const raw = req.headers["x-upstream-base"];
  if (!raw) return null;
  let u;
  try { u = new URL(raw); } catch { return null; }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  if (!ALLOW_ANY && !ALLOWED_HOSTS.has(u.hostname)) {
    return { error: `上游域名 ${u.hostname} 不在白名单内。设置 ALLOW_ANY_UPSTREAM=1 可放开。` };
  }
  return u;
}

const server = http.createServer((req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, CORS);
    return res.end();
  }

  if (req.method !== "POST" || !req.url.startsWith("/")) {
    res.writeHead(404, { ...CORS, "Content-Type": "application/json" });
    return res.end(JSON.stringify({ error: "仅支持 POST /<厂商路径>" }));
  }

  const upstream = pickUpstream(req);
  if (!upstream) {
    res.writeHead(400, { ...CORS, "Content-Type": "application/json" });
    return res.end(JSON.stringify({ error: "缺少或非法的 x-upstream-base 请求头" }));
  }
  if (upstream.error) {
    res.writeHead(403, { ...CORS, "Content-Type": "application/json" });
    return res.end(JSON.stringify({ error: upstream.error }));
  }

  const chunks = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", () => {
    const body = Buffer.concat(chunks);

    // 透传鉴权头
    const headers = { "Content-Type": req.headers["content-type"] || "application/json" };
    for (const h of ["authorization", "x-goog-api-key", "api-key"]) {
      if (req.headers[h]) headers[h] = req.headers[h];
    }

    const target = {
      protocol: upstream.protocol,
      host: upstream.host,
      path: upstream.pathname.replace(/\/+$/, "") + req.url,
      method: "POST",
      headers
    };

    const mod = upstream.protocol === "https:" ? https : http;
    const upReq = mod.request(target, (upRes) => {
      res.writeHead(upRes.statusCode || 502, {
        ...CORS,
        "Content-Type": upRes.headers["content-type"] || "application/json"
      });
      upRes.pipe(res);
    });
    upReq.on("error", (e) => {
      res.writeHead(502, { ...CORS, "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: e.message }));
    });
    upReq.write(body);
    upReq.end();

    console.log(`[proxy] ${upstream.host}${target.path}`);
  });
});

server.listen(PORT, HOST, () => {
  console.log(`[proxy] http://${HOST}:${PORT}  ->  多厂商转发`);
  console.log(`[proxy] 白名单模式：${ALLOW_ANY ? "已放开（ALLOW_ANY_UPSTREAM=1）" : [...ALLOWED_HOSTS].join(", ")}`);
});
