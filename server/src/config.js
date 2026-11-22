import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** server/ 目录 */
export const SERVER_ROOT = path.resolve(__dirname, "..");
/** 仓库根目录 */
export const REPO_ROOT = path.resolve(SERVER_ROOT, "..");

/** 极简 .env 解析（不引入 dotenv 依赖；已存在的环境变量优先） */
function loadEnvFile(file) {
  let raw;
  try {
    raw = fs.readFileSync(file, "utf8");
  } catch {
    return;
  }
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_-]*)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    const key = m[1];
    const value = m[2].replace(/^["'](.*)["']$/, "$1");
    if (process.env[key] === undefined) process.env[key] = value;
  }
}
loadEnvFile(path.join(SERVER_ROOT, ".env"));

export const HOST = process.env.HOST || "127.0.0.1";
export const PORT = Number(process.env.PORT || 8787);
export const CORS_ORIGIN = process.env.CORS_ORIGIN || "*";
export const ALLOW_ANY_UPSTREAM = process.env.ALLOW_ANY_UPSTREAM === "1";
/** 为 1 时，适配器请求（自定义厂商 Base URL）也必须命中上游白名单 */
export const STRICT_UPSTREAM = process.env.STRICT_UPSTREAM === "1";
export const GENERATE_TIMEOUT_MS = Number(process.env.GENERATE_TIMEOUT_MS || 180000);

/** 默认允许的转发上游（与原 proxy.js 保持一致） */
const DEFAULT_ALLOWED_HOSTS = [
  "api.minimaxi.com",
  "api.minimax.io",
  "api.openai.com",
  "generativelanguage.googleapis.com",
  "api.deepseek.com",
  "open.bigmodel.cn",
  "api.siliconflow.cn",
  "api.moonshot.cn",
  "dashscope.aliyuncs.com"
];

export const ALLOWED_HOSTS = new Set(
  (process.env.ALLOWED_UPSTREAM_HOSTS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .length
    ? process.env.ALLOWED_UPSTREAM_HOSTS.split(",").map((s) => s.trim()).filter(Boolean)
    : DEFAULT_ALLOWED_HOSTS
);

/** 数据目录（历史记录） */
export const DATA_DIR = path.isAbsolute(process.env.DATA_DIR || "")
  ? process.env.DATA_DIR
  : path.join(SERVER_ROOT, process.env.DATA_DIR || "data");

/**
 * 服务端托管的 API Key。
 * 页面里填了 Key 就用页面的；没填则回落到这里（适合部署成团队内部服务，避免 Key 落在浏览器里）。
 */
function parseServerKeys() {
  const keys = {};
  let json = {};
  try {
    json = JSON.parse(process.env.STUDIO_API_KEYS || "{}");
  } catch {
    console.warn("[config] STUDIO_API_KEYS 不是合法 JSON，已忽略。");
  }
  const envMap = {
    minimax: process.env.MINIMAX_API_KEY,
    openai: process.env.OPENAI_API_KEY,
    gemini: process.env.GEMINI_API_KEY,
    custom: process.env.CUSTOM_API_KEY
  };
  for (const [id, val] of Object.entries(envMap)) {
    if (val) keys[id] = val;
  }
  for (const [id, val] of Object.entries(json)) {
    if (typeof val === "string" && val) keys[id] = val;
  }
  return keys;
}

export const SERVER_KEYS = parseServerKeys();

/* ---------- AI Agent（漫画助手）---------- */

/**
 * Agent 的「大脑」：一个 OpenAI 兼容的 chat/completions 端点。
 * DeepSeek / 通义 / 智谱 / OpenAI / 各类聚合网关都能直接用。
 * 前端可以在「AI 助手」面板里覆盖这里的配置（存浏览器 localStorage）。
 */
export const AGENT = {
  baseUrl: process.env.AGENT_BASE_URL || "",
  path: process.env.AGENT_PATH || "/v1/chat/completions",
  apiKey: process.env.AGENT_API_KEY || "",
  model: process.env.AGENT_MODEL || "",
  /** 复盘需要看图，单独指定一个支持视觉输入的模型；留空则复用 model */
  visionModel: process.env.AGENT_VISION_MODEL || "",
  authHeader: process.env.AGENT_AUTH_HEADER || "Authorization",
  authPrefix:
    process.env.AGENT_AUTH_PREFIX === undefined ? "Bearer " : process.env.AGENT_AUTH_PREFIX,
  temperature: Number(process.env.AGENT_TEMPERATURE || 0.8),
  maxTokens: Number(process.env.AGENT_MAX_TOKENS || 4096),
  timeoutMs: Number(process.env.AGENT_TIMEOUT_MS || 120000)
};

/**
 * 合并 Agent 配置：前端传了就用前端的，缺项回落服务端 .env。
 * authPrefix 允许显式传空串（有些网关用 api-key 头，不需要前缀）。
 */
export function resolveAgentConfig(override = {}) {
  const o = override || {};
  const pick = (k, def) => {
    const v = o[k];
    return v === undefined || v === null || v === "" ? def : v;
  };
  const model = String(pick("model", AGENT.model) || "");
  return {
    baseUrl: String(pick("baseUrl", AGENT.baseUrl) || "").replace(/\/+$/, ""),
    path: String(pick("path", AGENT.path) || "/v1/chat/completions"),
    apiKey: String(pick("apiKey", AGENT.apiKey) || ""),
    model,
    visionModel: String(pick("visionModel", AGENT.visionModel) || model),
    authHeader: String(pick("authHeader", AGENT.authHeader) || "Authorization"),
    authPrefix: o.authPrefix === undefined ? AGENT.authPrefix : String(o.authPrefix),
    temperature: Number(pick("temperature", AGENT.temperature)),
    maxTokens: Number(pick("maxTokens", AGENT.maxTokens)),
    timeoutMs: Number(pick("timeoutMs", AGENT.timeoutMs))
  };
}

/** 取某个厂商最终使用的 Key */
export function resolveApiKey(providerId, clientKey) {
  const client = String(clientKey || "").trim();
  if (client) return client;
  return SERVER_KEYS[providerId] || "";
}
