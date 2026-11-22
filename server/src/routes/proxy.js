import { Router } from "express";
import { checkUpstream, postUpstream } from "../services/upstream.js";

const router = Router();

/**
 * 通用转发（原 proxy.js 的等价物）。
 *
 *   POST /api/proxy/v1/image_generation
 *     x-upstream-base: https://api.minimaxi.com   ← 指明转发到哪个厂商
 *     Authorization: Bearer sk-xxx                ← 原样透传
 *
 * 页面上的生成请求走 /api/generate（由适配层拼请求体）；
 * 这个接口用于临时对接未注册的厂商，或用 curl 手工调试。
 */
router.all("/proxy/*", async (req, res) => {
  if (req.method === "OPTIONS") return res.status(204).end();

  const raw = req.headers["x-upstream-base"];
  if (!raw) {
    return res.status(400).json({ error: { message: "缺少 x-upstream-base 请求头" } });
  }
  const checked = checkUpstream(raw, { useWhitelist: true });
  if (checked.error) {
    return res.status(403).json({ error: { message: checked.error } });
  }

  const upstream = checked.url;
  const suffix = req.url.replace(/^\/api\/proxy/, "");
  upstream.pathname = upstream.pathname.replace(/\/+$/, "") + suffix;

  const headers = { "Content-Type": req.headers["content-type"] || "application/json" };
  for (const h of ["authorization", "x-goog-api-key", "api-key"]) {
    if (req.headers[h]) headers[h] = req.headers[h];
  }

  try {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = Buffer.concat(chunks);

    const out = await postUpstream({
      url: upstream.toString(),
      headers,
      body: body.length ? body.toString("utf8") : "{}",
      signal: req.signal
    });
    console.log(`[proxy] ${upstream.host}${upstream.pathname}`);
    res.status(out.status);
    res.setHeader("Content-Type", "application/json");
    res.send(out.text);
  } catch (err) {
    res.status(502).json({ error: { message: err.message } });
  }
});

export default router;
