import { ApiError, normalizeError } from "./errors.js";
import { checkUpstream } from "./upstream.js";

/**
 * 文本模型调用（OpenAI 兼容 chat/completions）。
 *
 * Agent 用它把「一句描述」变成结构化 JSON。
 * 选 OpenAI 兼容协议而不是各家私有协议，是因为 DeepSeek / 通义 / 智谱 /
 * OpenAI / 各类聚合网关全都实现了这一套，填个地址就能换模型。
 */

/** 去掉 Markdown 代码块围栏，取出最外层的 JSON 对象 */
export function extractJson(text) {
  let s = String(text || "").trim();
  // ```json ... ``` 或 ``` ... ```
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();
  const start = s.indexOf("{");
  if (start === -1) {
    throw new ApiError({
      status: 502,
      type: "upstream_error",
      message: "模型没有返回 JSON 对象，请重试或换个模型。"
    });
  }
  // 扫描出与第一个 { 配对的 }（跳过字符串里的括号）
  let depth = 0;
  let inStr = false;
  let esc = false;
  let end = -1;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (esc) {
      esc = false;
      continue;
    }
    if (c === "\\") {
      esc = true;
      continue;
    }
    if (c === '"') {
      inStr = !inStr;
      continue;
    }
    if (inStr) continue;
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  const json = end === -1 ? s.slice(start) : s.slice(start, end + 1);
  try {
    return JSON.parse(json);
  } catch (e) {
    throw new ApiError({
      status: 502,
      type: "upstream_error",
      message: "模型返回的内容不是合法 JSON：" + e.message
    });
  }
}

/** 从各家可能的响应结构里取出正文 */
export function pickContent(json) {
  const c = json?.choices?.[0]?.message?.content;
  if (typeof c === "string") return c;
  if (Array.isArray(c)) {
    // 兼容 [{type:'text', text:'...'}] 这种分段结构
    return c.map((p) => (typeof p === "string" ? p : p?.text || "")).join("");
  }
  if (typeof json?.content === "string") return json.content;
  if (typeof json?.output_text === "string") return json.output_text;
  if (typeof json?.message === "string") return json.message;
  return "";
}

function buildUrl(config) {
  const base = String(config.baseUrl || "").replace(/\/+$/, "");
  let path = String(config.path || "").trim();
  if (!path.startsWith("/")) path = "/" + path;
  return base + path;
}

function buildHeaders(config) {
  const headers = { "Content-Type": "application/json" };
  if (config.authHeader && config.apiKey) {
    headers[config.authHeader] = (config.authPrefix || "") + config.apiKey;
  }
  return headers;
}

/** 组装 user 消息；带图片时用多模态数组结构 */
function buildUserContent(user, images) {
  if (!images?.length) return String(user || "");
  const parts = [{ type: "text", text: String(user || "") }];
  for (const url of images) {
    parts.push({ type: "image_url", image_url: { url } });
  }
  return parts;
}

/**
 * 调一次 chat/completions。
 *
 * @param {object} o
 * @param {object} o.config     解析后的 Agent 配置
 * @param {string} o.system     系统提示词
 * @param {string} o.user       用户提示词
 * @param {string[]} o.images   图片 data URL（多模态）
 * @param {boolean} o.json      是否要求返回 JSON
 * @param {AbortSignal} o.signal 外部取消信号
 * @param {boolean} o.useVision  用 visionModel 而不是 model
 */
export async function chat({
  config,
  system,
  user,
  images = [],
  json = false,
  signal = null,
  useVision = false
}) {
  if (!config.baseUrl) {
    throw new ApiError({
      status: 400,
      type: "invalid_request_error",
      code: "missing_agent_config",
      message: "未配置 Agent 模型地址：请在「AI 助手」面板里填 Base URL，或在服务端 .env 设置 AGENT_BASE_URL / AGENT_API_KEY / AGENT_MODEL。"
    });
  }
  if (!config.apiKey) {
    throw new ApiError({
      status: 401,
      type: "authentication_error",
      code: "missing_agent_key",
      message: "未配置 Agent 的 API Key：请在「AI 助手」面板里填，或在服务端 .env 设置 AGENT_API_KEY。"
    });
  }
  const model = useVision && config.visionModel ? config.visionModel : config.model;
  if (!model) {
    throw new ApiError({
      status: 400,
      type: "invalid_request_error",
      code: "missing_agent_model",
      message: "未配置 Agent 模型名：请在「AI 助手」面板里填 Model，或在服务端 .env 设置 AGENT_MODEL。"
    });
  }

  const url = buildUrl(config);
  const checked = checkUpstream(url);
  if (checked.error) {
    throw new ApiError({ status: 400, type: "invalid_request_error", message: checked.error });
  }

  const body = {
    model,
    messages: [
      { role: "system", content: system },
      { role: "user", content: buildUserContent(user, images) }
    ],
    temperature: config.temperature,
    max_tokens: config.maxTokens,
    stream: false
  };
  if (json) body.response_format = { type: "json_object" };

  const controller = new AbortController();
  let timedOut = false;
  const onOuterAbort = () => controller.abort();
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener("abort", onOuterAbort, { once: true });
  }
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, config.timeoutMs);

  const send = async (payload) => {
    const res = await fetch(url, {
      method: "POST",
      headers: buildHeaders(config),
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    const text = await res.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      /* 非 JSON */
    }
    return { res, text, data };
  };

  try {
    let { res, text, data } = await send(body);

    // 有些网关不支持 response_format，去掉后重试一次
    if (!res.ok && json && res.status === 400 && /response_format|json_object/i.test(text)) {
      const retryBody = { ...body };
      delete retryBody.response_format;
      ({ res, text, data } = await send(retryBody));
    }

    if (!res.ok) {
      const norm = normalizeError(res.status, data, text);
      throw new ApiError({
        status: norm.status,
        type: norm.type,
        code: norm.code,
        message: norm.message,
        retryable: norm.retryable
      });
    }

    const content = pickContent(data);
    if (!content) {
      throw new ApiError({
        status: 502,
        type: "upstream_error",
        message: "模型返回了空内容。"
      });
    }
    return {
      text: content,
      raw: data,
      model,
      usage: data?.usage || null
    };
  } catch (err) {
    if (err instanceof ApiError) throw err;
    const aborted = err.name === "AbortError";
    throw new ApiError({
      status: aborted ? (timedOut ? 504 : 499) : 502,
      type: aborted ? (timedOut ? "timeout" : "cancelled") : "upstream_error",
      code: aborted ? (timedOut ? "timeout" : "client_closed_request") : "agent_upstream_error",
      message: aborted
        ? timedOut
          ? `Agent 请求超时（${Math.round(config.timeoutMs / 1000)}s）`
          : "Agent 请求已取消"
        : `调用 Agent 模型失败：${err.message}`,
      retryable: aborted ? timedOut : true
    });
  } finally {
    clearTimeout(timer);
    if (signal) signal.removeEventListener?.("abort", onOuterAbort);
  }
}

/**
 * 要求模型返回 JSON，并解析成对象。
 * 解析失败时把原始文本带在错误里，方便用户排查。
 */
export async function chatJson(options) {
  const res = await chat({ ...options, json: true });
  try {
    return { data: extractJson(res.text), raw: res.raw, model: res.model, usage: res.usage };
  } catch (e) {
    throw new ApiError({
      status: e.status || 502,
      type: e.type || "upstream_error",
      code: e.code || "bad_agent_json",
      message: (e.message || "解析失败") + `（模型原始输出前 200 字：${res.text.slice(0, 200)}）`
    });
  }
}
