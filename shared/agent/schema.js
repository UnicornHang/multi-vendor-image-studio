/**
 * AI Agent 与「基础生图」表单之间的字段契约。
 *
 * 前后端共用：
 *   - 前端用它渲染 Agent 面板的字段说明、校验 Agent 产出
 *   - 后端用它把模型返回的 JSON 归一化成表单能直接吃的值
 *
 * 表单栏目（与 web/src/composables/useStudio.js 的 state.prompt 一一对应）：
 *   main     主体描述：人物 + 动作 + 场景，一句话说清画面主体
 *   style    风格：画风 / 媒材 / 质感
 *   detail   场景与细节：环境元素、道具、氛围小物
 *   light    光影与色调：光源方向、色彩倾向、明暗对比
 *   cam      构图与镜头：景别、机位、视角、镜头焦段
 *   negative 负向提示词：明确不要出现的元素
 */

export const PROMPT_FIELDS = [
  {
    key: "main",
    label: "主体描述",
    required: true,
    hint: "谁 + 在做什么 + 在哪里，画面主体一句话"
  },
  {
    key: "style",
    label: "风格",
    required: false,
    hint: "画风 / 媒材 / 质感"
  },
  {
    key: "detail",
    label: "场景与细节",
    required: false,
    hint: "环境元素、道具、氛围小物"
  },
  {
    key: "light",
    label: "光影与色调",
    required: false,
    hint: "光源方向、色彩倾向、明暗对比"
  },
  {
    key: "cam",
    label: "构图与镜头",
    required: false,
    hint: "景别、机位、视角、焦段"
  },
  {
    key: "negative",
    label: "负向提示词",
    required: false,
    hint: "明确不要出现的元素"
  }
];

/** 空的表单描述 */
export function emptyPrompt() {
  const out = {};
  for (const f of PROMPT_FIELDS) out[f.key] = "";
  return out;
}

/**
 * 比例归一：把 "1024x1536" / "2:3" / "2：3" 统一成 "2:3"。
 * 用于校验模型给的画面比例是否落在当前厂商允许的取值里。
 */
export function normalizeRatio(value) {
  const v = String(value || "").trim().toLowerCase();
  if (!v) return "";
  const colon = v.match(/^(\d+(?:\.\d+)?)\s*[:x×/]\s*(\d+(?:\.\d+)?)$/);
  if (colon) {
    const w = Number(colon[1]);
    const h = Number(colon[2]);
    if (!w || !h) return "";
    return `${simplify(w)}:${simplify(h)}`;
  }
  return "";
}

/** 约分：整数比取最大公约数（1024:1536 → 2:3），小数比保留三位 */
function simplify(n) {
  const r = Math.round(n * 1000) / 1000;
  if (!Number.isInteger(r)) return String(r);
  return String(r);
}

/** 两个比例是否等价（1024x1536 与 2:3 是同一个比例） */
function sameRatio(a, b) {
  const ra = ratioParts(a);
  const rb = ratioParts(b);
  if (!ra || !rb) return false;
  const g = gcd(ra[0], ra[1]);
  const h = gcd(rb[0], rb[1]);
  if (!g || !h) return false;
  return ra[0] / g === rb[0] / h && ra[1] / g === rb[1] / h;
}

function ratioParts(value) {
  const r = normalizeRatio(value).split(":");
  if (r.length !== 2) return null;
  const w = Number(r[0]);
  const h = Number(r[1]);
  if (!w || !h) return null;
  return [w, h];
}

function gcd(a, b) {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y) {
    const t = x % y;
    x = y;
    y = t;
  }
  return x || 1;
}

/**
 * 在允许值里找与目标比例等价的一项。
 * 找不到返回空串（调用方决定兜底策略）。
 */
export function matchRatio(target, allowed = []) {
  if (!normalizeRatio(target)) return "";
  const hit = allowed.find((a) => sameRatio(a, target));
  return hit ? String(hit) : "";
}

/** 从一堆候选里挑第一个非空字符串 */
export function firstNonEmpty(...vals) {
  for (const v of vals) {
    const s = String(v ?? "").trim();
    if (s) return s;
  }
  return "";
}

/**
 * 把任意值收成布尔。
 */
export function toBool(v, fallback = false) {
  if (v === true || v === 1) return true;
  if (v === false || v === 0 || v === null || v === undefined || v === "") return fallback;
  const s = String(v).trim().toLowerCase();
  if (["true", "yes", "1", "on", "是", "需要"].includes(s)) return true;
  if (["false", "no", "0", "off", "否", "不需要"].includes(s)) return false;
  return fallback;
}
