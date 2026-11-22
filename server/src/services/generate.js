import {
  getMode,
  buildContext,
  buildPayload,
  buildUrl,
  buildHeaders,
  extractItems
} from "../adapters/index.js";
import { resolveApiKey, GENERATE_TIMEOUT_MS, STRICT_UPSTREAM } from "../config.js";
import { checkUpstream, postUpstream } from "./upstream.js";
import { ApiError, normalizeError } from "./errors.js";
import { recordUsage } from "./usage.js";

/**
 * 生成流程的唯一实现。
 *
 * /api/generate（页面用的扩展端点）和 /v1/images/generations（OpenAI 兼容端点）
 * 都走这里，保证两条路的请求构造、错误语义、耗时统计完全一致。
 *
 * 失败时抛 ApiError（已归一化），由路由决定用哪种错误信封返回。
 */
export async function runGeneration({
  provider,
  mode: modeId,
  config = {},
  prompt,
  negative = "",
  negativeMode = "off",
  ref = null,
  signal = null,
  timeoutMs = GENERATE_TIMEOUT_MS,
  usageMeta = {}
}) {
  const started = Date.now();

  const found = getMode(provider, modeId);
  if (!found) {
    throw new ApiError({
      status: 400,
      type: "invalid_request_error",
      message: `未知厂商或模式：${provider}/${modeId}`
    });
  }
  const { profile, mode } = found;

  const apiKey = resolveApiKey(provider, config.apiKey);
  if (!apiKey) {
    throw new ApiError({
      status: 401,
      type: "authentication_error",
      code: "missing_api_key",
      message: `缺少 ${profile.label} 的 API Key：请在页面填写，或在服务端 .env / channels.json 中配置`
    });
  }

  const finalPrompt = String(prompt ?? "");
  if (!finalPrompt.trim()) {
    throw new ApiError({
      status: 400,
      type: "invalid_request_error",
      code: "missing_prompt",
      message: "缺少提示词：请先填写主体描述"
    });
  }

  const ctx = buildContext(
    { config, prompt: finalPrompt, negative, negativeMode, ref },
    mode
  );

  let payload;
  try {
    payload = buildPayload(mode, ctx, config.extraJson);
  } catch (e) {
    throw new ApiError({ status: 400, type: "invalid_request_error", message: e.message });
  }

  const url = buildUrl(config);
  const checked = checkUpstream(config.baseUrl, { useWhitelist: STRICT_UPSTREAM });
  if (checked.error) {
    throw new ApiError({ status: 400, type: "invalid_request_error", message: checked.error });
  }

  const headers = buildHeaders(config, apiKey);

  // 超时 + 客户端断开 → 中断上游请求
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
  }, timeoutMs);

  try {
    const upstream = await postUpstream({ url, headers, body: payload, signal: controller.signal });
    const durationMs = Date.now() - started;

    if (!upstream.ok) {
      const norm = normalizeError(upstream.status, upstream.json, upstream.text);
      recordUsage({
        provider,
        model: ctx.model,
        mode: mode.id,
        images: 0,
        ok: false,
        durationMs,
        errorType: norm.type
      });
      throw new ApiError({
        status: norm.status,
        type: norm.type,
        code: norm.code,
        message: norm.message,
        retryable: norm.retryable
      });
    }
    if (upstream.json?.base_resp && upstream.json.base_resp.status_code !== 0) {
      const norm = normalizeError(502, upstream.json, upstream.text);
      recordUsage({
        provider,
        model: ctx.model,
        mode: mode.id,
        images: 0,
        ok: false,
        durationMs,
        errorType: norm.type
      });
      throw new ApiError({
        status: 502,
        type: norm.type,
        code: norm.code,
        message: norm.message,
        retryable: norm.retryable
      });
    }

    const items = extractItems(mode, upstream.json, ctx);
    recordUsage({
      provider,
      model: ctx.model,
      mode: mode.id,
      images: items.length,
      ok: true,
      durationMs,
      ...usageMeta
    });
    console.log(`[generate] ${provider}/${mode.id} → ${items.length} 张 · ${(durationMs / 1000).toFixed(1)}s`);

    return {
      ok: true,
      provider,
      mode: mode.id,
      profile: profile.label,
      items,
      duration: (durationMs / 1000).toFixed(1),
      durationMs,
      url,
      payload,
      ctx
    };
  } catch (err) {
    if (err instanceof ApiError) throw err;
    const aborted = err.name === "AbortError";
    if (aborted) {
      recordUsage({
        provider,
        model: ctx.model,
        mode: mode.id,
        images: 0,
        ok: false,
        durationMs: Date.now() - started,
        errorType: timedOut ? "timeout" : "cancelled"
      });
      throw new ApiError({
        status: timedOut ? 504 : 499,
        type: timedOut ? "timeout" : "cancelled",
        code: timedOut ? "timeout" : "client_closed_request",
        message: timedOut ? `请求超时（${Math.round(timeoutMs / 1000)}s）` : "请求已取消",
        retryable: timedOut
      });
    }
    recordUsage({
      provider,
      model: ctx.model,
      mode: mode.id,
      images: 0,
      ok: false,
      durationMs: Date.now() - started,
      errorType: "upstream_error"
    });
    throw new ApiError({ status: 502, type: "upstream_error", message: err.message, retryable: true });
  } finally {
    clearTimeout(timer);
    if (signal) signal.removeEventListener?.("abort", onOuterAbort);
  }
}
