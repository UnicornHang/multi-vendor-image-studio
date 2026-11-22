import { PROFILES } from "./profiles.js";

/** 固定时间戳：模型条目需要稳定的 created 字段 */
const BASE_CREATED = 1735689600; // 2025-01-01

/**
 * 统一模型注册表。
 *
 * 把各厂商 profile 里散落的 models 收敛成一份跨厂商的模型目录，
 * 每个条目带一份「能力矩阵」，调用方据此校验参数，而不是靠猜。
 */

/** 某个 mode 下，指定模型的能力（支持模型级覆盖） */
export function modeCapabilities(mode, model) {
  const caps = (mode.modelCaps && model && mode.modelCaps[model]) || {};
  const aspectOptions = caps.aspectOptions || mode.aspectOptions || [];
  const qualities = caps.qualities || mode.qualities || [];
  const responseFormats = caps.responseFormats || mode.responseFormats || [];
  return {
    aspect: aspectOptions.map((a) => a[1]),
    aspect_detail: aspectOptions.map((a) => ({ value: a[1], label: a[0] })),
    quality: qualities.map((q) => q[1]),
    response_format: responseFormats.map((r) => r[1]),
    negative_mode: (mode.negativeModes || []).map((n) => n[0]),
    seed: !!mode.supports?.seed,
    optimizer: !!mode.supports?.optimizer,
    reference: !!mode.supports?.reference,
    max_n: caps.max_n || 9
  };
}

/** 该 mode 提供的模型列表 */
export function modeModels(mode) {
  if (mode.models?.length) return mode.models;
  return mode.defaults?.model ? [mode.defaults.model] : [];
}

/** 全部模型条目 */
export function listModelEntries() {
  const out = [];
  for (const [providerId, profile] of Object.entries(PROFILES)) {
    for (const mode of profile.modes) {
      for (const model of modeModels(mode)) {
        out.push({
          id: model,
          object: "model",
          created: BASE_CREATED,
          owned_by: providerId,
          provider: providerId,
          provider_label: profile.label,
          mode: mode.id,
          mode_label: mode.label,
          is_default: mode.defaults?.model === model,
          capabilities: modeCapabilities(mode, model)
        });
      }
    }
  }
  return out;
}

/**
 * 按模型名查找候选条目。
 * 同一个模型可能被多个厂商提供（例如各类 OpenAI 兼容网关都叫 gpt-image-1），
 * 由调用方按渠道优先级挑选。
 */
export function findModelEntries(modelId, providerId) {
  const id = String(modelId || "").trim();
  if (!id) return [];
  return listModelEntries().filter(
    (e) => e.id === id && (!providerId || e.provider === providerId)
  );
}

/** 唯一命中（只有一个厂商提供该模型） */
export function resolveModelEntry(modelId, providerId) {
  const hits = findModelEntries(modelId, providerId);
  return hits.length ? hits[0] : null;
}

/** 把 "1536x1024" 这类尺寸换算成比例 "3:2" */
export function sizeToRatio(size) {
  const m = String(size || "").match(/^(\d+)\s*[x×]\s*(\d+)$/i);
  if (!m) return "";
  const w = Number(m[1]);
  const h = Number(m[2]);
  if (!w || !h) return "";
  const gcd = (a, b) => (b ? gcd(b, a % b) : a);
  const g = gcd(w, h);
  return `${w / g}:${h / g}`;
}
