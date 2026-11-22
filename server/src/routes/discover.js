import { Router } from "express";
import { checkUpstream } from "../services/upstream.js";
import { STRICT_UPSTREAM } from "../config.js";

const router = Router();

/** 各家常见的模型列表路径 */
const CANDIDATE_PATHS = ["/v1/models", "/v1beta/models", "/models"];

/** 把不同厂商的返回结构归一成 [{ id, owned_by }] */
function normalizeModels(json) {
  const out = [];
  const push = (id, owned) => {
    if (id) out.push({ id: String(id), owned_by: owned || "" });
  };
  if (Array.isArray(json?.data)) {
    json.data.forEach((m) => push(m?.id || m?.name, m?.owned_by));
  }
  if (Array.isArray(json?.models)) {
    json.models.forEach((m) => push(String(m?.name || "").replace(/^models\//, ""), m?.owner));
  }
  if (Array.isArray(json)) {
    json.forEach((m) => push(m?.id || m?.name, m?.owned_by));
  }
  return out.filter((m) => m.id);
}

/**
 * 获取厂商模型列表。
 * 依次尝试「带前缀的 base」和「仅 origin」两种拼法，兼容自建网关把 /v1/models 挂在别处的情况。
 */
router.post("/discover-models", async (req, res) => {
  const { baseUrl, apiKey, authHeader = "Authorization", authPrefix = "Bearer " } = req.body || {};
  if (!baseUrl) {
    return res.status(400).json({ error: { message: "缺少 baseUrl" } });
  }
  const checked = checkUpstream(baseUrl, { useWhitelist: STRICT_UPSTREAM });
  if (checked.error) {
    return res.status(400).json({ error: { message: checked.error } });
  }

  const base = String(baseUrl).replace(/\/+$/, "");
  let origin = base;
  try {
    origin = new URL(base).origin;
  } catch {
    /* 保留原样 */
  }

  const headers = { Accept: "application/json" };
  if (authHeader && apiKey) headers[authHeader] = (authPrefix || "") + apiKey;

  const urls = [];
  for (const p of CANDIDATE_PATHS) {
    urls.push(base + p);
    if (origin !== base) urls.push(origin + p);
  }

  const tried = [];
  for (const url of urls) {
    try {
      const r = await fetch(url, { headers, signal: AbortSignal.timeout(15000) });
      if (!r.ok) {
        tried.push(`${url} → HTTP ${r.status}`);
        continue;
      }
      const json = await r.json().catch(() => null);
      const models = normalizeModels(json);
      if (models.length) {
        return res.json({ ok: true, endpoint: url, models });
      }
      tried.push(`${url} → 未解析到模型`);
    } catch (e) {
      tried.push(`${url} → ${e.message}`);
    }
  }
  return res.status(404).json({
    error: { message: "未能获取模型列表：" + tried.join("；") },
    tried
  });
});

export default router;
