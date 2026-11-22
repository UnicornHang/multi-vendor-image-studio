/**
 * 错误归一化。
 *
 * 各家厂商的错误结构差别很大（OpenAI 的 error.type、MiniMax 的 base_resp、
 * Gemini 的 error.status……），这里统一成 OpenAI 风格的信封：
 *   { status, type, code, message, retryable }
 * type 决定上层能不能重试 / 要不要换渠道。
 */

export class ApiError extends Error {
  constructor({ status = 500, type = "server_error", code = "", message = "", retryable = false } = {}) {
    super(message || "服务器内部错误");
    this.name = "ApiError";
    this.status = status;
    this.type = type;
    this.code = code;
    this.retryable = retryable;
  }
}

/** MiniMax base_resp.status_code 的尽力映射（不认识的归为 upstream_error） */
const MINIMAX_CODES = {
  1002: "authentication_error",
  1003: "rate_limit_error",
  1004: "quota_exceeded",
  1008: "quota_exceeded",
  1027: "content_policy_violation",
  2013: "invalid_request_error"
};

const POLICY_RE = /safety|blocked|content.?policy|审核|违规|敏感/i;

function rawMessage(json, text) {
  return (
    json?.error?.message ||
    json?.base_resp?.status_msg ||
    json?.message ||
    json?.error?.error?.message ||
    json?.error?.status ||
    String(text || "").slice(0, 500)
  );
}

/**
 * 把上游错误归一化。
 * @param {number} status HTTP 状态码
 * @param {object|null} json 已解析的响应体
 * @param {string} text 原始响应文本
 */
export function normalizeError(status, json, text) {
  const message = rawMessage(json, text);
  let type = "server_error";
  let code = "";
  let retryable = status >= 500;

  if (status === 401) {
    type = "authentication_error";
    retryable = false;
  } else if (status === 402) {
    type = "quota_exceeded";
    retryable = false;
  } else if (status === 403) {
    type = "permission_error";
    retryable = false;
  } else if (status === 404) {
    type = "not_found_error";
    retryable = false;
  } else if (status === 408 || status === 504) {
    type = "timeout";
    retryable = true;
  } else if (status === 413) {
    type = "invalid_request_error";
    retryable = false;
  } else if (status === 429) {
    type = "rate_limit_error";
    retryable = true;
  } else if (status === 400) {
    type = POLICY_RE.test(message) ? "content_policy_violation" : "invalid_request_error";
    retryable = false;
  } else if (status >= 500) {
    type = "upstream_error";
    retryable = true;
  }

  // MiniMax 风格：HTTP 200 但 body 里带错误
  const base = json?.base_resp?.status_code;
  if (base && base !== 0) {
    type = MINIMAX_CODES[base] || "upstream_error";
    code = String(base);
    retryable = type === "rate_limit_error" || type === "timeout";
  }

  if (!code) {
    code = json?.error?.code ?? json?.error?.status ?? "";
    code = code === undefined || code === null ? "" : String(code);
  }
  if (!code && json?.error?.type) code = String(json.error.type);

  return {
    status,
    type,
    code,
    message: message || `HTTP ${status}`,
    retryable
  };
}

/** OpenAI 风格错误信封 */
export function openAIErrorBody(err) {
  return {
    error: {
      message: err.message,
      type: err.type || "server_error",
      param: err.param || null,
      code: err.code || null
    }
  };
}

/** 项目内部使用的错误信封（前端读 error.message，附带归一化字段） */
export function internalErrorBody(err) {
  return {
    error: {
      message: err.message,
      type: err.type || "server_error",
      code: err.code || null,
      retryable: !!err.retryable
    }
  };
}
