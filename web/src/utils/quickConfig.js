/**
 * 快速配置解析器
 *
 * 支持粘贴以下任意一种 JSON，一次性解析出厂商 / Base URL / 路径 / 鉴权 / Key / 模型：
 *   1. Claude Code 的 settings.json（含 env 段，ANTHROPIC_* 之类）
 *   2. CC Switch 的渠道配置
 *   3. 本项目自己的扁平配置 { baseUrl, path, authHeader, authPrefix, apiKey, model }
 */

/** 按域名猜测厂商 */
const PROVIDER_HINTS = [
  { id: "minimax", test: /minimaxi|minimax/i },
  { id: "openai", test: /openai\.com|azure\.com\/openai/i },
  { id: "gemini", test: /googleapis\.com|generativelanguage/i }
];

const KNOWN_PROVIDERS = ["minimax", "openai", "gemini", "custom"];

/** 路径里像 API 前缀的段（用来把完整 URL 拆成 base + path） */
const API_PATH_RE = /^\/(v\d|api|anthropic|openai|compatible-mode|chat)\b/i;

export function detectProvider(text) {
  const s = String(text || "");
  for (const h of PROVIDER_HINTS) if (h.test.test(s)) return h.id;
  return "custom";
}

/**
 * 解析一段配置文本。
 * @returns {{provider:string, baseUrl:string, path:string, authHeader:string,
 *            authPrefix:string, apiKey:string, model:string, warnings:string[]}}
 * @throws {Error} JSON 非法时抛出
 */
export function parseProviderConfig(text) {
  const trimmed = String(text || "").trim();
  if (!trimmed) throw new Error("请先粘贴配置内容");

  let raw;
  try {
    raw = JSON.parse(trimmed);
  } catch (e) {
    throw new Error("JSON 解析失败：" + e.message);
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("配置必须是一个 JSON 对象");
  }

  // Claude Code 的 settings.json 把配置放在 env 里，两层合并（env 优先）
  const env = raw.env && typeof raw.env === "object" && !Array.isArray(raw.env) ? raw.env : {};
  const flat = { ...raw, ...env };

  const pick = (...keys) => {
    for (const k of keys) {
      const v = flat[k];
      if (typeof v === "string" && v.trim()) return v.trim();
    }
    return "";
  };

  const warnings = [];

  /* ---------- 厂商 ---------- */
  const providerRaw = pick("provider", "providerId", "channel", "vendor").toLowerCase();
  const urlRaw = pick(
    "baseUrl", "base_url", "baseURL", "apiBase", "api_base", "BASE_URL",
    "endpointBase", "ANTHROPIC_BASE_URL", "OPENAI_BASE_URL", "AZURE_OPENAI_ENDPOINT", "base"
  );
  let provider = KNOWN_PROVIDERS.includes(providerRaw) ? providerRaw : "";
  if (!provider) provider = detectProvider(urlRaw + " " + pick("model", "ANTHROPIC_MODEL"));

  /* ---------- Base URL 与请求路径 ---------- */
  const pathRaw = pick("path", "apiPath", "api_path", "PATH", "api_path_suffix");
  let baseUrl = urlRaw;
  let path = pathRaw;

  if (!pathRaw && urlRaw) {
    // 完整 URL 里带路径段 → 拆成 base + path
    try {
      const u = new URL(urlRaw);
      const seg = u.pathname.replace(/\/+$/, "");
      if (seg && API_PATH_RE.test(seg)) {
        baseUrl = u.origin;
        path = seg;
      } else {
        baseUrl = u.origin + seg;
        path = "";
      }
    } catch {
      /* 不是合法 URL，原样保留 */
    }
  }
  if (!baseUrl) warnings.push("没找到 Base URL，请在详细配置里补上");
  if (!path) warnings.push("没找到请求路径，将使用该厂商的默认路径");
  if (/anthropic/i.test(path) || /anthropic/i.test(urlRaw)) {
    warnings.push("解析到的是 Anthropic 对话端点，本项目做图像生成，请把请求路径改成对应厂商的图像接口");
  }

  /* ---------- 鉴权 ---------- */
  const hasAnthropicApiKey = !!flat.ANTHROPIC_API_KEY;
  const hasAnthropicAuthToken = !!flat.ANTHROPIC_AUTH_TOKEN;
  let authHeader = pick("authHeader", "auth_header", "AUTH_HEADER");
  let authPrefix = pick("authPrefix", "auth_prefix", "AUTH_PREFIX", "prefix", "tokenPrefix");

  if (!authHeader) {
    if (hasAnthropicApiKey) {
      authHeader = "x-api-key";
      if (!authPrefix) authPrefix = "";
    } else {
      authHeader = "Authorization";
      if (!authPrefix) authPrefix = "Bearer ";
    }
  } else if (authPrefix === "" && hasAnthropicAuthToken) {
    authPrefix = "Bearer ";
  }

  /* ---------- Key 与模型 ---------- */
  const apiKey = pick(
    "apiKey", "api_key", "API_KEY", "ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN",
    "OPENAI_API_KEY", "token", "secret", "key"
  );
  if (!apiKey) warnings.push("没找到 API Key，请在详细配置里补上");

  const model = pick(
    "model", "MODEL", "ANTHROPIC_MODEL", "ANTHROPIC_DEFAULT_SONNET_MODEL",
    "ANTHROPIC_DEFAULT_OPUS_MODEL", "ANTHROPIC_DEFAULT_HAIKU_MODEL",
    "ANTHROPIC_DEFAULT_FABLE_MODEL", "defaultModel", "modelName"
  );

  return {
    provider,
    baseUrl,
    path,
    authHeader,
    authPrefix,
    apiKey,
    model,
    warnings
  };
}

/** 把当前配置导出成一段 JSON（方便复制到别处 / 备份） */
export function exportProviderConfig(cfg) {
  return JSON.stringify(
    {
      provider: cfg.provider,
      baseUrl: cfg.baseUrl || "",
      path: cfg.path || "",
      authHeader: cfg.authHeader || "",
      authPrefix: cfg.authPrefix ?? "",
      apiKey: cfg.apiKey || "",
      model: cfg.model || ""
    },
    null,
    2
  );
}
