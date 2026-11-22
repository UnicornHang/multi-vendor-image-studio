import { PROFILES, ASPECTS, resolvePath } from "./profiles.js";

export { PROFILES, ASPECTS, resolvePath };

/**
 * 剥离函数，返回可 JSON 序列化的 profile 元数据。
 * 前端用它渲染厂商/模式/比例/参数控件，不需要知道请求怎么拼。
 */
export function profileMeta() {
  const out = {};
  for (const [id, p] of Object.entries(PROFILES)) {
    out[id] = {
      id,
      label: p.label,
      note: p.note,
      modes: p.modes.map((m) => ({
        id: m.id,
        label: m.label,
        defaults: m.defaults || {},
        models: m.models || [],
        aspectOptions: m.aspectOptions || [],
        modelCaps: m.modelCaps || {},
        aspectLabel: m.aspectLabel || "画面比例",
        responseFormats: m.responseFormats || [],
        qualities: m.qualities || [],
        negativeModes: m.negativeModes || [],
        supports: m.supports || {}
      }))
    };
  }
  return out;
}

/** 取厂商 + 模式对象 */
export function getMode(providerId, modeId) {
  const profile = PROFILES[providerId];
  if (!profile) return null;
  const mode = profile.modes.find((m) => m.id === modeId) || profile.modes[0];
  return mode ? { profile, mode } : null;
}

/**
 * 组装适配层上下文。
 * prompt 已经由前端按栏目拼好（inline 模式的负向提示词也已拼进去），
 * 这里只负责决定负向提示词是否走独立字段。
 */
export function buildContext({ config = {}, prompt = "", negative = "", negativeMode = "", ref = null }, mode) {
  const neg = String(negative || "").trim();
  const ctx = {
    model: config.model || "",
    prompt: String(prompt || ""),
    negative: neg && negativeMode === "field" ? neg : "",
    aspect: config.aspect || "",
    resolution: config.resolution || "",
    n: Math.min(9, Math.max(1, parseInt(config.n, 10) || 1)),
    quality: config.quality || "",
    responseFormat: config.responseFormat || "",
    optimizer: !!config.optimizer,
    seed: config.seed === undefined || config.seed === null ? "" : config.seed,
    bodyTemplate: config.bodyTemplate || "",
    respPath: config.respPath || "data[].url"
  };
  if (ref && ref.base64 && mode?.supports?.reference) {
    ctx.ref = { type: ref.type || "character", base64: ref.base64 };
  }
  return ctx;
}

/** 请求体：适配层产出 + 附加自定义参数合并 */
export function buildPayload(mode, ctx, extraJson) {
  const payload = mode.build(ctx);
  const extra = String(extraJson || "").trim();
  if (extra) {
    let obj;
    try {
      obj = JSON.parse(extra);
    } catch (e) {
      throw new Error("附加参数 JSON 解析失败：" + e.message);
    }
    if (obj && typeof obj === "object" && !Array.isArray(obj)) {
      Object.assign(payload, obj);
    }
  }
  return payload;
}

/** 完整请求 URL */
export function buildUrl(config) {
  const base = String(config.baseUrl || "").replace(/\/+$/, "");
  let path = String(config.path || "").trim();
  if (!path.startsWith("/")) path = "/" + path;
  path = path.split("{model}").join(encodeURIComponent(config.model || ""));
  return base + path;
}

/** 请求头：鉴权头 + JSON */
export function buildHeaders(config, apiKey) {
  const headers = { "Content-Type": "application/json" };
  if (config.authHeader) {
    headers[config.authHeader] = (config.authPrefix || "") + (apiKey || "");
  }
  return headers;
}

/** 从响应里取图片 */
export function extractItems(mode, json, ctx) {
  return mode.extract(json, ctx) || [];
}

/**
 * 从厂商返回体里找一条可读的错误信息。
 * 兼容各家不同的错误结构。
 */
export function pickErrorMessage(json, text) {
  return (
    json?.error?.message ||
    json?.base_resp?.status_msg ||
    json?.message ||
    json?.error?.error?.message ||
    String(text || "").slice(0, 400)
  );
}
