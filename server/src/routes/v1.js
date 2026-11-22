import { Router } from "express";
import { getMode } from "../adapters/index.js";
import {
  listModelEntries,
  findModelEntries,
  modeCapabilities,
  sizeToRatio
} from "../adapters/registry.js";
import { resolveChannel, channelApiKey, listChannels } from "../services/channels.js";
import { runGeneration } from "../services/generate.js";
import { ApiError, openAIErrorBody } from "../services/errors.js";
import { getUsage } from "../services/usage.js";

const router = Router();

/** 转 base64 时的体积上限（15MB），防止把超大图拉进内存 */
const MAX_BASE64_BYTES = 15 * 1024 * 1024;

function stripDataUrl(src) {
  return String(src).replace(/^data:[^;]+;base64,/, "");
}

function badRequest(message, code = "") {
  return new ApiError({ status: 400, type: "invalid_request_error", code, message });
}

/** 把 URL / data URL / 裸 base64 统一成裸 base64 */
async function toBase64(input) {
  const s = String(input || "");
  if (!s) throw badRequest("参考图为空");
  if (s.startsWith("data:")) return stripDataUrl(s);
  if (/^https?:\/\//i.test(s)) {
    const res = await fetch(s);
    if (!res.ok) throw new ApiError({ status: 502, type: "upstream_error", message: `参考图下载失败 HTTP ${res.status}` });
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > MAX_BASE64_BYTES) throw badRequest("参考图超过 15MB 上限");
    return buf.toString("base64");
  }
  return s.replace(/\s+/g, "");
}

/** 厂商返回的是图片直链，但调用方要 b64_json —— 服务端代为转码 */
async function urlToBase64(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) return "";
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > MAX_BASE64_BYTES) return "";
    return buf.toString("base64");
  } catch {
    return "";
  }
}

/**
 * size（OpenAI 的画幅尺寸）→ 适配层的比例值。
 * 支持直接命中（1024x1024）或按比例换算（1536x1024 → 3:2）。
 */
function resolveAspect(caps, size) {
  if (!size) return { value: undefined };
  if (caps.aspect.includes(size)) return { value: size };
  const ratio = sizeToRatio(size);
  if (ratio && caps.aspect.includes(ratio)) return { value: ratio };
  return { error: `size "${size}" 不被该模型支持，可用值：${caps.aspect.join(", ")}` };
}

/** response_format（url / b64_json）→ 适配层的格式值 */
function resolveResponseFormat(caps, fmt) {
  if (!fmt) return { value: undefined };
  const allowed = caps.response_format;
  if (!allowed.length) return { value: undefined };
  const f = String(fmt).toLowerCase();
  if (allowed.includes(f)) return { value: f };
  if (f === "b64_json" && allowed.includes("base64")) return { value: "base64" };
  if (f === "url" && allowed.includes("url")) return { value: "url" };
  return { error: `response_format "${fmt}" 不被该模型支持，可用值：${allowed.join(", ")}` };
}

/* ======================================================================
 * POST /v1/images/generations —— OpenAI 兼容的图像生成端点
 * ==================================================================== */
router.post("/images/generations", async (req, res) => {
  const body = req.body || {};
  const ac = new AbortController();
  res.on("close", () => {
    if (!res.writableEnded) ac.abort();
  });

  try {
    const model = String(body.model || "").trim();
    if (!model) throw badRequest("缺少 model", "missing_model");

    // 1) 解析模型 → 厂商/模式
    let provider = String(body.provider || "");
    let modeId = String(body.mode || "");
    let entry = null;

    if (provider) {
      const found = getMode(provider, modeId);
      if (!found) throw badRequest(`未知厂商或模式：${provider}/${modeId}`);
      modeId = found.mode.id;
      entry = {
        provider,
        mode: modeId,
        capabilities: modeCapabilities(found.mode, model)
      };
    } else {
      const hits = findModelEntries(model);
      if (!hits.length) {
        throw new ApiError({
          status: 404,
          type: "invalid_request_error",
          code: "model_not_found",
          message: `模型注册表中没有 ${model}，可用模型见 GET /v1/models`
        });
      }
      // 多个厂商提供同名模型时，优先选启用了渠道、优先级最高的那家
      const ranked = hits
        .map((h) => {
          const ch = resolveChannel(h.provider, h.mode);
          return { h, ch, score: ch?.enabled === false ? 1e9 : ch?.priority ?? 100 };
        })
        .sort((a, b) => a.score - b.score);
      entry = ranked[0].h;
      provider = entry.provider;
      modeId = entry.mode;
    }

    const caps = entry.capabilities;

    // 2) 渠道（配置 + 密钥）
    const channel = resolveChannel(provider, modeId);
    if (!channel) throw badRequest(`没有可用的渠道：${provider}/${modeId}`);

    // 3) 参数归一 + 能力校验
    const aspect = resolveAspect(caps, body.size);
    if (aspect.error) throw badRequest(aspect.error, "unsupported_size");

    const fmt = resolveResponseFormat(caps, body.response_format);
    if (fmt.error) throw badRequest(fmt.error, "unsupported_response_format");

    if (body.quality) {
      if (!caps.quality.length) {
        throw badRequest(`模型 ${model} 不支持 quality 参数`, "unsupported_quality");
      }
      if (!caps.quality.includes(String(body.quality))) {
        throw badRequest(`quality "${body.quality}" 不被该模型支持，可用值：${caps.quality.join(", ")}`, "unsupported_quality");
      }
    }

    const n = Math.min(caps.max_n, Math.max(1, parseInt(body.n, 10) || 1));

    // 4) 提示词（支持字符串，或多模态 content 数组）
    let prompt = body.prompt;
    if (Array.isArray(prompt)) {
      prompt = prompt
        .map((part) => (typeof part === "string" ? part : part?.text || ""))
        .filter(Boolean)
        .join(" ");
    }
    prompt = String(prompt ?? "");

    // 5) 扩展字段：参考图 / 负向提示词 / 附加请求体
    let ref = null;
    if (body.reference_image) {
      if (!caps.reference) {
        throw badRequest(`模型 ${model} 不支持参考图`, "reference_unsupported");
      }
      ref = {
        type: String(body.reference_type || "character"),
        base64: await toBase64(body.reference_image)
      };
    }

    const negativeMode = String(body.negative_mode || (body.negative_prompt ? "field" : "off"));
    const negative = String(body.negative_prompt || "");

    const config = {
      baseUrl: channel.baseUrl,
      path: channel.path,
      authHeader: channel.authHeader,
      authPrefix: channel.authPrefix,
      model: model || channel.model,
      apiKey: channelApiKey(channel),
      aspect: aspect.value ?? "",
      n,
      seed: body.seed ?? "",
      quality: body.quality || "",
      responseFormat: fmt.value ?? "",
      optimizer: !!body.prompt_optimizer,
      extraJson: body.extra_body ? JSON.stringify(body.extra_body) : "",
      bodyTemplate: "",
      respPath: ""
    };

    // 6) 执行
    const result = await runGeneration({
      provider,
      mode: modeId,
      config,
      prompt,
      negative,
      negativeMode,
      ref,
      signal: ac.signal
    });

    // 7) 组装 OpenAI 兼容响应
    const wantB64 = String(body.response_format || "").toLowerCase() === "b64_json";
    const data = [];
    for (const it of result.items) {
      if (it.type === "base64") {
        data.push({ b64_json: stripDataUrl(it.src) });
      } else if (wantB64) {
        const b64 = await urlToBase64(it.src);
        if (b64) data.push({ b64_json: b64 });
        else data.push({ url: it.src });
      } else {
        data.push({ url: it.src });
      }
    }

    return res.json({
      created: Math.floor(Date.now() / 1000),
      data,
      model: config.model,
      provider,
      usage: {
        images: data.length,
        requests: 1,
        latency_ms: result.durationMs
      }
    });
  } catch (err) {
    const e =
      err instanceof ApiError
        ? err
        : new ApiError({ status: 500, type: "server_error", message: err.message });
    if (e.status !== 499) console.error("[v1] 失败:", e.message);
    return res.status(e.status).json(openAIErrorBody(e));
  }
});

/* ======================================================================
 * GET /v1/models —— 跨厂商模型注册表（带能力矩阵）
 * ==================================================================== */
router.get("/models", (req, res) => {
  res.json({ object: "list", data: listModelEntries() });
});

/* ======================================================================
 * GET /v1/providers —— 渠道列表与健康状态
 * ==================================================================== */
router.get("/providers", (req, res) => {
  res.json({ object: "list", data: listChannels() });
});

/* ======================================================================
 * GET /v1/usage —— 用量统计
 * ==================================================================== */
router.get("/usage", (req, res) => {
  res.json(getUsage());
});

export default router;
