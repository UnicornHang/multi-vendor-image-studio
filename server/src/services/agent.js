import dns from "node:dns/promises";
import net from "node:net";
import { getMode } from "../adapters/index.js";
import { ApiError } from "./errors.js";
import { chatJson } from "./llm.js";
import { resolveAgentConfig } from "../config.js";
import {
  PROMPT_FIELDS,
  emptyPrompt,
  matchRatio,
  normalizeRatio,
  toBool
} from "../../../shared/agent/schema.js";
import { getStyle } from "../../../shared/agent/styles.js";
import {
  FILL_SYSTEM,
  STORYBOARD_SYSTEM,
  CHARACTER_SYSTEM,
  REFINE_SYSTEM,
  renderConstraints,
  buildFillUser,
  buildStoryboardUser,
  buildCharacterUser,
  buildRefineUser
} from "../../../shared/agent/prompts.js";

/**
 * 漫画 Agent。
 *
 * 四项能力：
 *   fillForm        一句描述 → 补全「画面描述」六个栏位 + 生成参数
 *   buildStoryboard 一句描述 → N 格连续分镜
 *   makeCharacters  一句描述 → 可复用的角色设定档案
 *   refineImage     看图复盘 → 改一版的提示词
 *
 * 关键约束：**模型只能填当前厂商真正支持的字段，取值必须落在厂商允许的集合里**。
 * 否则前端下拉框会变成「自定义」，请求发到上游就会报错。
 */

/* ------------------------------------------------------------------ */
/* 厂商能力约束                                                         */
/* ------------------------------------------------------------------ */

/**
 * 把某个 mode 的能力渲染成结构化约束。
 * @param {object} mode  shared/adapters/profiles.js 里的 mode 对象
 * @param {string} model 当前模型名（用于模型级能力覆盖）
 */
export function buildConstraints(mode, model) {
  const caps = (mode.modelCaps && model && mode.modelCaps[model]) || {};
  const supports = mode.supports || {};
  const aspectOptions = caps.aspectOptions || mode.aspectOptions || [];
  const qualities = caps.qualities || mode.qualities || [];
  const unsupported = [];
  if (!supports.quality) unsupported.push("quality");
  if (!supports.seed) unsupported.push("seed");
  if (!supports.optimizer) unsupported.push("optimizer");
  if (!supports.responseFormat) unsupported.push("responseFormat");
  if (!supports.resolution) unsupported.push("resolution");
  return {
    // 下标约定（与 shared/adapters/profiles.js 一致）：
    //   aspectOptions 是 [文案, 取值]；其余选项数组是 [取值, 文案]
    aspect: aspectOptions.map((a) => a[1]),
    quality: qualities.map((q) => q[0]),
    responseFormat: (mode.responseFormats || []).map((r) => r[0]),
    resolution: (mode.resolutions || []).map((r) => r[0]),
    negativeMode: (mode.negativeModes || []).map((n) => n[0]),
    maxN: Math.min(caps.max_n || 9, 9),
    unsupported,
    aspectLabel: mode.aspectLabel || "画面比例"
  };
}

/**
 * 画面比例：优先精确匹配 → 比例等价 → 最接近的一项 → 兜底第一项。
 *
 * 「最接近」很重要：模型要 9:16，而某厂商只有 2:3，
 * 与其回落到 1:1（构图完全跑偏），不如落到 2:3（仍是竖构图）。
 */
function pickAspect(want, allowed) {
  const w = String(want || "").trim();
  if (!w) return "";
  const exact = allowed.find((a) => String(a) === w);
  if (exact) return exact;
  const byRatio = matchRatio(w, allowed);
  if (byRatio) return byRatio;

  const target = ratioValue(w);
  if (target) {
    let best = "";
    let bestDist = Infinity;
    for (const a of allowed) {
      const v = ratioValue(a);
      if (!v) continue;
      const dist = Math.abs(Math.log(v / target));
      if (dist < bestDist) {
        bestDist = dist;
        best = a;
      }
    }
    if (best) return best;
  }
  return "";
}

/** 比例值（宽 / 高）；解析不了返回 0 */
function ratioValue(value) {
  const r = normalizeRatio(value);
  if (!r) return 0;
  const [w, h] = r.split(":").map(Number);
  if (!w || !h) return 0;
  return w / h;
}

/**
 * 把模型返回的参数归一化到「当前厂商真正支持」的范围内。
 * 不支持的字段直接不出现（前端不会去渲染它）。
 */
export function normalizeParams(raw = {}, mode, model, fallback = {}) {
  const constraints = buildConstraints(mode, model);
  const supports = mode.supports || {};
  const out = {};
  /** 模型给了就用模型的，没给就沿用表单里原来的值 */
  const prefer = (modelVal, userVal) => {
    const a = String(modelVal ?? "").trim();
    if (a) return a;
    return String(userVal ?? "").trim();
  };

  if (constraints.aspect.length) {
    const want = prefer(raw.aspect, fallback.aspect);
    out.aspect =
      pickAspect(want, constraints.aspect) ||
      pickAspect(fallback.aspect, constraints.aspect) ||
      constraints.aspect[0];
  }

  if (supports.quality && constraints.quality.length) {
    const want = prefer(raw.quality, fallback.quality);
    out.quality = constraints.quality.includes(want) ? want : constraints.quality[0];
  }

  const rawN = parseInt(raw.n, 10);
  const fallbackN = parseInt(fallback.n, 10);
  let n = Number.isFinite(rawN) ? rawN : Number.isFinite(fallbackN) ? fallbackN : 1;
  out.n = Math.max(1, Math.min(constraints.maxN, n));

  if (constraints.negativeMode.length) {
    const want = prefer(raw.negativeMode, fallback.negativeMode);
    out.negativeMode = constraints.negativeMode.includes(want)
      ? want
      : constraints.negativeMode.includes("inline")
        ? "inline"
        : constraints.negativeMode[0];
  }

  if (supports.responseFormat && constraints.responseFormat.length) {
    const want = prefer(raw.responseFormat, fallback.responseFormat);
    out.responseFormat = constraints.responseFormat.includes(want)
      ? want
      : constraints.responseFormat[0];
  }

  if (supports.resolution && constraints.resolution.length) {
    const want = prefer(raw.resolution, fallback.resolution);
    out.resolution = constraints.resolution.includes(want) ? want : "";
  }

  if (supports.seed) {
    const s = raw.seed ?? fallback.seed ?? "";
    const num = Number(s);
    out.seed = s === "" || s === null || s === undefined || !Number.isFinite(num) ? "" : num;
  }

  if (supports.optimizer) {
    out.optimizer = toBool(raw.optimizer, toBool(fallback.optimizer, false));
  }

  return out;
}

/** 把模型返回的画面描述归一化（补齐缺键、限长） */
export function normalizePrompt(raw = {}) {
  const src = raw && typeof raw === "object" ? raw : {};
  const out = emptyPrompt();
  for (const f of PROMPT_FIELDS) {
    const v = src[f.key];
    out[f.key] = typeof v === "string" ? v.trim().slice(0, 800) : v == null ? "" : String(v).trim().slice(0, 800);
  }
  return out;
}

/** 拼接两段描述（去空，逗号分隔） */
function mergeText(a, b) {
  const x = String(a || "").trim();
  const y = String(b || "").trim();
  if (!x) return y;
  if (!y) return x;
  if (y.includes(x)) return y;
  if (x.includes(y)) return x;
  return x + "，" + y;
}

/** 合并负向词（去重） */
function mergeNegatives(...lists) {
  const seen = new Set();
  const out = [];
  for (const list of lists) {
    for (const raw of String(list || "").split(/[，,、;；\n]/)) {
      const s = raw.trim();
      if (!s || seen.has(s)) continue;
      seen.add(s);
      out.push(s);
    }
  }
  return out.join("，");
}

/** 角色档案 → 可直接拼进提示词的文本 */
export function charactersToText(characters = []) {
  const arr = Array.isArray(characters) ? characters : [];
  return arr
    .map((c) => {
      const frag = String(c?.promptFragment || "").trim();
      const name = String(c?.name || "").trim();
      if (frag) return `${name ? name + "：" : ""}${frag}`;
      const bits = [c?.appearance, c?.outfit, c?.palette].filter(Boolean).join("；");
      return `${name ? name + "：" : ""}${bits}`;
    })
    .filter(Boolean)
    .join("\n");
}

/* ------------------------------------------------------------------ */
/* 图片转 data URL（复盘需要把图喂给模型）                                */
/* ------------------------------------------------------------------ */

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_IMAGES = 4;

/** 内网地址不下载，避免 SSRF */
async function isPrivateHost(hostname) {
  const host = String(hostname || "").toLowerCase();
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) return true;
  if (net.isIPv4(host)) {
    const p = host.split(".").map(Number);
    if (p[0] === 127 || p[0] === 10 || p[0] === 0) return true;
    if (p[0] === 192 && p[1] === 168) return true;
    if (p[0] === 172 && p[1] >= 16 && p[1] <= 31) return true;
    if (p[0] === 169 && p[1] === 254) return true;
    return false;
  }
  if (net.isIPv6(host) && (host === "::1" || host.startsWith("fc") || host.startsWith("fd"))) return true;
  try {
    const { address } = await dns.lookup(host);
    return await isPrivateHost(address);
  } catch {
    return true;
  }
}

/** 单张图片 → data URL */
async function toDataUrl(item) {
  const src = String(item?.src || "");
  if (!src) return "";
  if (src.startsWith("data:")) return src;
  if (!/^https?:\/\//i.test(src)) return "";
  let u;
  try {
    u = new URL(src);
  } catch {
    return "";
  }
  if (await isPrivateHost(u.hostname)) {
    throw new ApiError({
      status: 400,
      type: "invalid_request_error",
      message: `图片地址指向内网主机，已跳过：${u.hostname}`
    });
  }
  const res = await fetch(u, { signal: AbortSignal.timeout(20000) });
  if (!res.ok) {
    throw new ApiError({
      status: 502,
      type: "upstream_error",
      message: `下载图片失败（HTTP ${res.status}）：${u.hostname}`
    });
  }
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > MAX_IMAGE_BYTES) {
    throw new ApiError({
      status: 400,
      type: "invalid_request_error",
      message: "图片体积过大，复盘时只处理 8MB 以内的图片。"
    });
  }
  const mime = (res.headers.get("content-type") || "image/png").split(";")[0].trim();
  return `data:${mime};base64,${buf.toString("base64")}`;
}

/* ------------------------------------------------------------------ */
/* 能力实现                                                             */
/* ------------------------------------------------------------------ */

function requireMode(provider, mode) {
  const found = getMode(provider, mode);
  if (!found) {
    throw new ApiError({
      status: 400,
      type: "invalid_request_error",
      message: `未知厂商或模式：${provider}/${mode}`
    });
  }
  return found.mode;
}

/** 填表：一句描述 → 完整表单 */
export async function fillForm({
  brief,
  provider,
  mode,
  model = "",
  style = "",
  styleKey = "",
  characters = [],
  extra = "",
  current = {},
  config = {},
  signal = null
}) {
  const m = requireMode(provider, mode);
  const preset = getStyle(styleKey);
  const styleText = String(style || preset?.style || "").trim();
  const constraints = buildConstraints(m, model);
  const user = buildFillUser({
    brief,
    style: styleText,
    characters: charactersToText(characters),
    constraints: renderConstraints(constraints),
    extra
  });

  const { data, model: usedModel } = await chatJson({
    config: resolveAgentConfig(config),
    system: FILL_SYSTEM,
    user,
    signal
  });

  const prompt = normalizePrompt(data?.prompt);
  if (!prompt.main) {
    throw new ApiError({
      status: 502,
      type: "upstream_error",
      message: "模型没有给出主体描述，请换个说法再试一次。"
    });
  }
  prompt.negative = mergeNegatives(prompt.negative, preset?.negative);

  return {
    notes: String(data?.notes || "").trim(),
    prompt,
    params: normalizeParams(data?.params, m, model, current?.params || {}),
    agentModel: usedModel
  };
}

/** 分镜：一句描述 → N 格连续分镜 */
export async function buildStoryboard({
  brief,
  provider,
  mode,
  model = "",
  panelCount = 4,
  style = "",
  styleKey = "",
  characters = [],
  config = {},
  signal = null
}) {
  const m = requireMode(provider, mode);
  const preset = getStyle(styleKey);
  const styleText = String(style || preset?.style || "").trim();
  const count = Math.max(1, Math.min(12, parseInt(panelCount, 10) || 4));
  const constraints = buildConstraints(m, model);
  const user = buildStoryboardUser({
    brief,
    panelCount: count,
    style: styleText,
    characters: charactersToText(characters),
    constraints: renderConstraints(constraints)
  });

  const { data, model: usedModel } = await chatJson({
    config: resolveAgentConfig(config),
    system: STORYBOARD_SYSTEM,
    user,
    signal
  });

  const rawPanels = Array.isArray(data?.panels) ? data.panels : [];
  const panels = rawPanels.slice(0, count).map((p, i) => {
    const prompt = normalizePrompt(p?.prompt);
    // 分镜里的 prompt 常常缺 main，用 description 兜底
    if (!prompt.main) prompt.main = String(p?.description || "").trim();
    prompt.style = mergeText(styleText, prompt.style);
    prompt.negative = mergeNegatives(prompt.negative, preset?.negative);
    return {
      index: parseInt(p?.index, 10) || i + 1,
      title: String(p?.title || "").trim(),
      shot: String(p?.shot || "").trim(),
      description: String(p?.description || "").trim(),
      dialogue: String(p?.dialogue || "").trim(),
      sfx: String(p?.sfx || "").trim(),
      prompt,
      aspect: pickAspect(p?.aspect, constraints.aspect) || constraints.aspect[0] || ""
    };
  });

  if (!panels.length) {
    throw new ApiError({
      status: 502,
      type: "upstream_error",
      message: "模型没有拆出分镜，请重试。"
    });
  }

  return {
    synopsis: String(data?.synopsis || "").trim(),
    panels,
    agentModel: usedModel
  };
}

/** 角色档案：一句描述 → 可复用的角色设定 */
export async function makeCharacters({
  brief,
  style = "",
  styleKey = "",
  config = {},
  signal = null
}) {
  const preset = getStyle(styleKey);
  const styleText = String(style || preset?.style || "").trim();
  const user = buildCharacterUser({
    brief,
    style: styleText,
    constraints: renderConstraints({})
  });

  const { data, model: usedModel } = await chatJson({
    config: resolveAgentConfig(config),
    system: CHARACTER_SYSTEM,
    user,
    signal
  });

  const raw = Array.isArray(data?.characters) ? data.characters : [];
  const characters = raw.map((c) => ({
    name: String(c?.name || "").trim(),
    role: String(c?.role || "").trim(),
    appearance: String(c?.appearance || "").trim(),
    outfit: String(c?.outfit || "").trim(),
    personality: String(c?.personality || "").trim(),
    palette: String(c?.palette || "").trim(),
    signature: String(c?.signature || "").trim(),
    promptFragment: String(c?.promptFragment || "").trim()
  }));
  if (!characters.length) {
    throw new ApiError({
      status: 502,
      type: "upstream_error",
      message: "模型没有给出角色设定，请重试。"
    });
  }
  return { characters, agentModel: usedModel };
}

/** 复盘：看图挑毛病 → 改一版的提示词 */
export async function refineImage({
  brief,
  current = {},
  images = [],
  provider,
  mode,
  model = "",
  config = {},
  signal = null
}) {
  const m = requireMode(provider, mode);
  const constraints = buildConstraints(m, model);
  const list = (Array.isArray(images) ? images : []).slice(0, MAX_IMAGES);
  const dataUrls = [];
  for (const it of list) {
    const u = await toDataUrl(it);
    if (u) dataUrls.push(u);
  }

  const user = buildRefineUser({
    brief,
    current,
    hasImages: dataUrls.length > 0,
    constraints: renderConstraints(constraints)
  });

  const { data, model: usedModel } = await chatJson({
    config: resolveAgentConfig(config),
    system: REFINE_SYSTEM,
    user,
    images: dataUrls,
    useVision: dataUrls.length > 0,
    signal
  });

  const prompt = normalizePrompt(data?.prompt);
  if (!prompt.main) prompt.main = normalizePrompt(current?.prompt).main;

  return {
    critique: String(data?.critique || "").trim(),
    issues: (Array.isArray(data?.issues) ? data.issues : [])
      .map((s) => String(s || "").trim())
      .filter(Boolean),
    notes: String(data?.notes || "").trim(),
    prompt,
    params: normalizeParams(data?.params, m, model),
    usedImages: dataUrls.length,
    agentModel: usedModel
  };
}
