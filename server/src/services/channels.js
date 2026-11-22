import fs from "node:fs";
import path from "node:path";
import { SERVER_ROOT, SERVER_KEYS } from "../config.js";
import { PROFILES } from "../adapters/profiles.js";

/**
 * 渠道配置。
 *
 * 统一端点（/v1/*）按「模型 → 厂商/模式 → 渠道」解析出实际要调用的接口与密钥。
 * 渠道可以放在 server/channels.json（默认）或 CHANNELS_FILE 指定的文件里，
 * 未配置时退回到 profile 自带的默认值 + .env 里的密钥。
 */

const DEFAULT_FILE = path.join(SERVER_ROOT, "channels.json");

let channels = [];

function normalizeChannel(raw, index) {
  const provider = String(raw.provider || "");
  const profile = PROFILES[provider];
  if (!profile) return null;
  const mode =
    profile.modes.find((m) => m.id === raw.mode) || profile.modes[0];
  return {
    id: String(raw.id || `${provider}-${mode.id}`),
    provider,
    provider_label: profile.label,
    mode: mode.id,
    mode_label: mode.label,
    enabled: raw.enabled !== false,
    priority: Number.isFinite(raw.priority) ? raw.priority : 100,
    models: Array.isArray(raw.models) ? raw.models : [],
    baseUrl: raw.baseUrl || mode.defaults?.baseUrl || "",
    path: raw.path || mode.defaults?.path || "",
    authHeader: raw.authHeader || mode.defaults?.authHeader || "",
    authPrefix: raw.authPrefix ?? mode.defaults?.authPrefix ?? "",
    model: raw.model || mode.defaults?.model || "",
    apiKeyEnv: raw.apiKeyEnv || "",
    apiKey: raw.apiKey || ""
  };
}

export function loadChannels() {
  const file = process.env.CHANNELS_FILE
    ? path.isAbsolute(process.env.CHANNELS_FILE)
      ? process.env.CHANNELS_FILE
      : path.join(SERVER_ROOT, process.env.CHANNELS_FILE)
    : DEFAULT_FILE;
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    const list = Array.isArray(parsed) ? parsed : parsed.channels || [];
    channels = list.map(normalizeChannel).filter(Boolean);
  } catch {
    channels = [];
  }
  return channels;
}

/** 渠道列表（不含密钥） */
export function listChannels() {
  if (!channels.length) loadChannels();
  return channels
    .slice()
    .sort((a, b) => a.priority - b.priority)
    .map((c) => ({
      id: c.id,
      provider: c.provider,
      provider_label: c.provider_label,
      mode: c.mode,
      mode_label: c.mode_label,
      enabled: c.enabled,
      priority: c.priority,
      models: c.models,
      baseUrl: c.baseUrl,
      path: c.path,
      model: c.model,
      has_key: !!(c.apiKey || (c.apiKeyEnv && process.env[c.apiKeyEnv]) || SERVER_KEYS[c.provider])
    }));
}

/**
 * 解析某个厂商+模式对应的渠道配置与密钥。
 * 找不到渠道时返回 profile 默认配置（密钥仍从 .env 取）。
 */
export function resolveChannel(providerId, modeId) {
  if (!channels.length) loadChannels();
  const hit = channels
    .filter((c) => c.provider === providerId && c.mode === modeId && c.enabled)
    .sort((a, b) => a.priority - b.priority)[0];
  if (!hit) {
    const profile = PROFILES[providerId];
    if (!profile) return null;
    const mode = profile.modes.find((m) => m.id === modeId) || profile.modes[0];
    return {
      id: `${providerId}-${mode.id}`,
      provider: providerId,
      mode: mode.id,
      enabled: true,
      priority: 100,
      baseUrl: mode.defaults?.baseUrl || "",
      path: mode.defaults?.path || "",
      authHeader: mode.defaults?.authHeader || "",
      authPrefix: mode.defaults?.authPrefix ?? "",
      model: mode.defaults?.model || "",
      apiKey: ""
    };
  }
  return { ...hit };
}

/** 渠道密钥：channels.json 里的 apiKey > apiKeyEnv 环境变量 > .env 的厂商密钥 */
export function channelApiKey(channel) {
  if (!channel) return "";
  if (channel.apiKey) return channel.apiKey;
  if (channel.apiKeyEnv && process.env[channel.apiKeyEnv]) return process.env[channel.apiKeyEnv];
  return SERVER_KEYS[channel.provider] || "";
}

loadChannels();
