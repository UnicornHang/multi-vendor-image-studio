import { reactive, computed } from "vue";
import { ElMessage } from "element-plus";
import * as api from "../api.js";
import { profileMeta } from "../data/profiles.js";
import { parseProviderConfig, exportProviderConfig } from "../utils/quickConfig.js";

const LS_CFG = "mm.image.studio.cfg";
const DEFAULT_CFG = { provider: "minimax", apiKey: "", shareKey: true, providers: {} };

/** 全局单例状态（所有组件共享） */
const state = reactive({
  ready: false,
  bootError: "",
  profiles: {},          // 厂商元数据（后端下发）
  provider: "minimax",   // 当前厂商 id
  mode: "",              // 当前模式 id
  settings: {},          // providerId -> 用户配置
  apiKey: "",            // 全局 Key
  shareKey: true,        // 是否所有厂商共用同一个 Key
  prompt: { main: "", style: "", detail: "", light: "", cam: "", negative: "" },
  refType: "character",
  reference: null,       // { base64, dataUrl, name, size }
  history: [],
  logs: [],
  result: null,          // { items, meta, error }
  discovered: [],         // 从厂商拉到的模型列表
  generating: false,
  status: { text: "未配置", kind: "" }
});

let abortCtl = null;

/* ---------------- 派生状态 ---------------- */
const profile = computed(() => state.profiles[state.provider] || null);
const modes = computed(() => profile.value?.modes || []);
const modeObj = computed(() => modes.value.find((m) => m.id === state.mode) || modes.value[0] || null);
const cur = computed(() => state.settings[state.provider] || {});

/* ---------------- 工具 ---------------- */
function log(msg, kind = "info") {
  state.logs.push({
    t: new Date().toLocaleTimeString("zh-CN", { hour12: false }),
    msg: String(msg),
    kind
  });
  if (state.logs.length > 400) state.logs.splice(0, state.logs.length - 400);
}

function setStatus(text, kind = "") {
  state.status = { text, kind };
}

/** 状态灯对应的 el-tag 类型 */
function statusType() {
  if (state.generating) return "warning";
  if (state.status.kind === "err") return "danger";
  if (state.status.kind === "on") return "success";
  return "info";
}

/**
 * 选项列表；若当前值不在列表中，追加一个「自定义」项。
 *
 * valueIndex 用于区分两类选项数组（约定见 shared/adapters/profiles.js）：
 *   0 —— [取值, 文案]，quality / responseFormat / negativeMode 用这种
 *   1 —— [文案, 取值]，aspectOptions 用这种
 */
function optionsWithCustom(list, value, valueIndex = 0) {
  const arr = (list || []).map((item) => ({
    value: item[valueIndex],
    label: item[valueIndex === 0 ? 1 : 0]
  }));
  if (value !== undefined && value !== null && value !== "" && !arr.some((o) => o.value === String(value))) {
    arr.push({ value, label: `${value}（自定义）` });
  }
  return arr;
}

/* ---------------- 配置存取 ---------------- */
function loadCfg() {
  try {
    const raw = localStorage.getItem(LS_CFG);
    if (!raw) return;
    const saved = JSON.parse(raw);
    state.provider = saved.provider || state.provider;
    state.apiKey = saved.apiKey || "";
    state.shareKey = saved.shareKey !== false;
    state.settings = saved.providers || {};
  } catch (e) {
    log("读取本地配置失败：" + e.message, "err");
  }
}

function saveCfg() {
  try {
    localStorage.setItem(
      LS_CFG,
      JSON.stringify({
        provider: state.provider,
        apiKey: state.apiKey,
        shareKey: state.shareKey,
        providers: state.settings
      })
    );
  } catch (e) {
    log("配置保存失败：" + e.message, "err");
  }
}

function resetCfg() {
  localStorage.removeItem(LS_CFG);
  window.location.reload();
}

/** 保证某个厂商有一份设置对象 */
function ensureSettings(providerId) {
  if (!state.settings[providerId]) state.settings[providerId] = {};
  return state.settings[providerId];
}

/** 套用模式默认值（只补齐缺失项） */
function applyModeDefaults(m) {
  if (!m) return;
  const s = ensureSettings(state.provider);
  s.mode = m.id;
  for (const [k, v] of Object.entries(m.defaults || {})) {
    if (s[k] === undefined) s[k] = v;
  }
  if (s.n === undefined || s.n === null || s.n === "") s.n = 1;
  if (!s.aspect && m.aspectOptions?.length) s.aspect = m.aspectOptions[0][1];
  if (!s.negativeMode && m.negativeModes?.length) s.negativeMode = m.negativeModes[0][0];
  if (!s.quality && m.qualities?.length) s.quality = m.qualities[0][0];
  if (!s.responseFormat && m.responseFormats?.length) s.responseFormat = m.responseFormats[0][0];
  // 厂商/模式不支持清晰度时清掉遗留值
  if (!m.supports?.resolution) s.resolution = "";
}

/* ---------------- 厂商 / 模式切换 ---------------- */
function selectProvider(providerId) {
  state.provider = providerId;
  state.discovered = [];   // 拉到的模型列表属于上一个厂商，清掉
  ensureSettings(providerId);
  const s = state.settings[providerId];
  state.mode = s.mode && modes.value.some((m) => m.id === s.mode) ? s.mode : modes.value[0]?.id || "";
  applyModeDefaults(modeObj.value);
  saveCfg();
  log("已切换厂商：" + (profile.value?.label || providerId), "info");
}

function selectMode(modeId) {
  const s = ensureSettings(state.provider);
  const keptKey = s.apiKey;
  for (const k of Object.keys(s)) delete s[k];
  s.apiKey = keptKey;
  state.mode = modeId;
  applyModeDefaults(modeObj.value);
  saveCfg();
  log("已切换模式：" + (modeObj.value?.label || modeId), "info");
}

/* ---------------- 提示词 ---------------- */
function buildPrompt() {
  const parts = ["main", "style", "detail", "light", "cam"]
    .map((k) => String(state.prompt[k] || "").trim())
    .filter(Boolean);
  let prompt = parts.join("，");
  const neg = String(state.prompt.negative || "").trim();
  if (neg && cur.value.negativeMode === "inline") {
    prompt = prompt ? prompt + "。避免出现：" + neg : "避免出现：" + neg;
  }
  return prompt;
}

/* ---------------- AI Agent 回填 ---------------- */

/** 表单里允许被 Agent 写入的栏目 */
const PROMPT_KEYS = ["main", "style", "detail", "light", "cam", "negative"];

/**
 * 把 Agent 产出的画面描述与生成参数写回表单。
 *
 * 只覆盖 Agent 真正给了内容的栏位（replace 为 true 时才允许清空），
 * 这样用户手写的补充不会被空字符串抹掉。
 * 参数只写当前厂商真正支持的字段 —— 别的字段写进去也不会被请求带上。
 */
function applyAgentForm({ prompt = null, params = null, replace = false } = {}) {
  if (prompt && typeof prompt === "object") {
    for (const k of PROMPT_KEYS) {
      const v = prompt[k];
      if (v === undefined || v === null) continue;
      const s = String(v).trim();
      if (!s && !replace) continue;
      state.prompt[k] = s;
    }
  }
  if (params && typeof params === "object") {
    const s = ensureSettings(state.provider);
    const m = modeObj.value;
    const supports = m?.supports || {};
    const set = (key, value, ok = true) => {
      if (value === undefined || value === null) return;
      if (!ok) return;
      s[key] = value;
    };
    set("aspect", params.aspect);
    set("quality", params.quality, supports.quality);
    set("n", params.n);
    set("resolution", params.resolution, supports.resolution);
    set("responseFormat", params.responseFormat, supports.responseFormat);
    set(
      "negativeMode",
      params.negativeMode,
      (m?.negativeModes || []).some((n) => n[0] === params.negativeMode)
    );
    // seed 为空表示「随机」，此时保留用户原来的种子
    set("seed", params.seed === "" ? undefined : params.seed, supports.seed);
    set("optimizer", params.optimizer ? true : params.optimizer === false ? false : undefined, supports.optimizer);
    saveCfg();
  }
  log("AI 助手已把内容填入表单，可继续手工修改。", "ok");
  return true;
}

/** 把一段角色描述追加到「场景与细节」栏 */
function appendDetail(text) {
  const s = String(text || "").trim();
  if (!s) return;
  const cur2 = String(state.prompt.detail || "").trim();
  if (cur2.includes(s)) return;
  state.prompt.detail = cur2 ? cur2 + "，" + s : s;
}

/* ---------------- 密钥 ---------------- */
function effectiveKey() {
  const s = cur.value;
  return !state.shareKey && s.apiKey ? s.apiKey : state.apiKey || "";
}

/* ---------------- 生成 ---------------- */
function aspectOf(payload) {
  return payload?.aspect_ratio || payload?.size || payload?.parameters?.aspectRatio || payload?.generationConfig?.imageConfig?.aspectRatio || "";
}

async function generate() {
  if (state.generating) return;
  const m = modeObj.value;
  if (!m) return;

  const prompt = buildPrompt();
  if (!effectiveKey()) {
    log("请先填写 API Key（或在服务端 .env 中配置该厂商密钥）。", "err");
    setStatus("缺少 API Key", "err");
    return;
  }
  if (!prompt) {
    log("请填写主体描述。", "err");
    return;
  }

  const s = cur.value;
  const config = {
    baseUrl: s.baseUrl || "",
    path: s.path || "",
    authHeader: s.authHeader || "",
    authPrefix: s.authPrefix || "",
    model: s.model || "",
    apiKey: effectiveKey(),
    aspect: s.aspect || "",
    resolution: s.resolution || "",
    n: Math.min(9, Math.max(1, parseInt(s.n, 10) || 1)),
    seed: s.seed ?? "",
    responseFormat: s.responseFormat || "",
    quality: s.quality || "",
    optimizer: !!s.optimizer,
    extraJson: s.extraJson || "",
    bodyTemplate: s.bodyTemplate || "",
    respPath: s.respPath || ""
  };

  const body = {
    provider: state.provider,
    mode: m.id,
    config,
    prompt,
    negative: state.prompt.negative || "",
    negativeMode: s.negativeMode || "off",
    ref:
      state.reference && m.supports?.reference
        ? { type: state.refType || "character", base64: state.reference.base64 }
        : null
  };

  state.generating = true;
  state.result = { items: [], meta: "正在生成，请稍候…" };
  setStatus("生成中…", "busy");
  log(`POST ${config.baseUrl}${config.path} · ${m.label}`);

  abortCtl = new AbortController();
  try {
    const res = await api.generate(body, abortCtl.signal);
    const items = res.items || [];
    state.result = {
      items,
      meta: `${items.length} 张 · ${res.duration}s · ${res.payload?.model || config.model} · ${aspectOf(res.payload)}`
    };
    if (!items.length) log("接口返回成功但没解析到图片。", "warn");
    log(`生成成功，${items.length} 张，用时 ${res.duration}s`, "ok");
    setStatus("就绪", "on");
    await pushHistory(items, res.payload || {});
  } catch (err) {
    const aborted = err.name === "AbortError";
    log(aborted ? "请求已取消。" : "生成失败：" + err.message, aborted ? "warn" : "err");
    setStatus(aborted ? "已取消" : "失败", aborted ? "" : "err");
    state.result = {
      items: [],
      meta: aborted ? "已取消本次生成。" : "生成失败：" + err.message,
      error: true
    };
  } finally {
    state.generating = false;
    abortCtl = null;
  }
}

function cancel() {
  if (abortCtl) {
    abortCtl.abort();
    log("已请求取消。", "warn");
  }
}

/** 清空从厂商拉到的模型列表（回到预设列表） */
function clearDiscovered() {
  state.discovered = [];
}

/* ---------------- 历史记录 ---------------- */
async function loadHistory() {
  try {
    const res = await api.getHistory();
    state.history = res.items || [];
  } catch (e) {
    log("读取历史记录失败：" + e.message, "warn");
  }
}

async function pushHistory(items, payload) {
  if (!items.length) return;
  const prompt =
    payload.prompt ||
    payload.instances?.[0]?.prompt ||
    payload.contents?.[0]?.parts?.[0]?.text ||
    "";
  const entries = items.map((it) => ({
    src: it.src,
    type: it.type,
    prompt,
    model: payload.model || cur.value.model || "",
    provider: state.provider
  }));
  try {
    const res = await api.addHistory(entries);
    state.history = res.items || [];
  } catch (e) {
    log("历史记录写入失败：" + e.message, "warn");
  }
}

async function removeHistory(id) {
  try {
    const res = await api.deleteHistory(id);
    state.history = res.items || [];
  } catch (e) {
    log("删除历史记录失败：" + e.message, "warn");
  }
}

async function clearHistory() {
  try {
    const res = await api.clearHistory();
    state.history = res.items || [];
  } catch (e) {
    log("清空历史记录失败：" + e.message, "warn");
  }
}

/* ---------------- 快速配置（粘贴 JSON 一键配好） ---------------- */

/**
 * 解析并应用一段 JSON 配置。
 * 自动识别厂商（Claude Code 的 ANTHROPIC_* / CC Switch / 本项目格式都认），
 * 填好 Base URL / 路径 / 鉴权头 / Key / 模型。
 */
function applyQuickConfig(text) {
  const parsed = parseProviderConfig(text);
  if (parsed.provider && parsed.provider !== state.provider) {
    selectProvider(parsed.provider);
  }
  const s = cur.value;
  if (parsed.baseUrl) s.baseUrl = parsed.baseUrl;
  if (parsed.path) s.path = parsed.path;
  if (parsed.authHeader) s.authHeader = parsed.authHeader;
  if (parsed.authPrefix !== undefined) s.authPrefix = parsed.authPrefix;
  if (parsed.apiKey) {
    s.apiKey = parsed.apiKey;
    state.apiKey = parsed.apiKey;
  }
  if (parsed.model) s.model = parsed.model;
  saveCfg();
  return parsed;
}

/** 把当前厂商的配置导出成 JSON */
function exportCurrentConfig() {
  return exportProviderConfig({
    provider: state.provider,
    ...cur.value
  });
}

/** 从厂商拉模型列表 */
async function discoverModels() {
  const s = cur.value;
  const res = await api.discoverModels({
    baseUrl: s.baseUrl || "",
    apiKey: effectiveKey(),
    authHeader: s.authHeader || "Authorization",
    authPrefix: s.authPrefix ?? "Bearer "
  });
  state.discovered = (res.models || []).map((m) => m.id);
  return { models: state.discovered, endpoint: res.endpoint };
}

/* ---------------- 下载 / 复制 / 放大 ---------------- */
async function download(src) {
  try {
    let blob;
    let name;
    if (src.startsWith("data:")) {
      blob = await (await fetch(src)).blob();
      name = "image-" + Date.now() + ".png";
    } else {
      const res = await fetch(src);
      if (!res.ok) throw new Error("HTTP " + res.status);
      blob = await res.blob();
      const ext = (src.match(/\.(png|jpe?g|webp)(?:\?|$)/i) || [, "png"])[1].toLowerCase();
      name = "image-" + Date.now() + "." + (ext === "jpg" ? "jpeg" : ext);
    }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    log("已下载：" + name, "ok");
    ElMessage.success("已下载：" + name);
  } catch (e) {
    log("下载失败：" + e.message + "（跨域资源可能无法直接下载，可复制链接后手动获取）", "err");
    ElMessage.error("下载失败：" + e.message);
  }
}

async function copy(src) {
  try {
    await navigator.clipboard.writeText(src);
    log("已复制到剪贴板。", "ok");
    ElMessage.success("已复制到剪贴板");
  } catch {
    const ta = document.createElement("textarea");
    ta.value = src;
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand("copy");
      log("已复制到剪贴板。", "ok");
      ElMessage.success("已复制到剪贴板");
    } catch {
      log("复制失败。", "err");
      ElMessage.error("复制失败");
    }
    ta.remove();
  }
}

/* ---------------- 参考图 ---------------- */
function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(new Error("读取文件失败"));
    r.readAsDataURL(file);
  });
}

async function pickReference(file) {
  if (!file) return;
  if (file.size > 20 * 1024 * 1024) {
    log("参考图过大（>20MB），请压缩后再上传。", "err");
    return;
  }
  try {
    const dataUrl = await readFileAsDataURL(file);
    state.reference = {
      base64: dataUrl.replace(/^data:[^;]+;base64,/, ""),
      dataUrl,
      name: file.name,
      size: file.size
    };
    log("参考图已载入。", "ok");
  } catch (err) {
    log(err.message, "err");
  }
}

function clearReference() {
  state.reference = null;
}

/* ---------------- 启动 ---------------- */
async function init() {
  // 厂商元数据用本地那份（与后端同源），后端没起来也能正常渲染表单
  state.profiles = profileMeta();

  // 后端在线时以服务端为准（渠道/元数据可能更新过）
  try {
    const data = await api.getProfiles();
    if (data?.providers && Object.keys(data.providers).length) {
      state.profiles = data.providers;
    }
  } catch (e) {
    state.bootError =
      "后端未连接：" + e.message + "（生成 / 历史 / 模型列表不可用，配置表单仍可正常使用；请启动 Node 服务：npm run dev:server）";
    log(state.bootError, "err");
  }

  loadCfg();
  for (const id of Object.keys(state.profiles)) ensureSettings(id);
  if (!state.profiles[state.provider]) {
    state.provider = Object.keys(state.profiles)[0] || "minimax";
    ensureSettings(state.provider);
  }
  const s = state.settings[state.provider];
  state.mode = s.mode && modes.value.some((m) => m.id === s.mode) ? s.mode : modes.value[0]?.id || "";
  applyModeDefaults(modeObj.value);
  saveCfg();

  await loadHistory();

  state.ready = true;
  if (!state.bootError) {
    setStatus(effectiveKey() ? "已配置 API Key" : "未配置", effectiveKey() ? "on" : "");
  }
  log(`适配器就绪：${profile.value?.label} / ${modeObj.value?.label}`, "info");
}

export function useStudio() {
  return {
    state,
    profile,
    modes,
    modeObj,
    cur,
    optionsWithCustom,
    log,
    setStatus,
    statusType,
    init,
    saveCfg,
    resetCfg,
    selectProvider,
    selectMode,
    applyQuickConfig,
    exportCurrentConfig,
    discoverModels,
    clearDiscovered,
    buildPrompt,
    applyAgentForm,
    appendDetail,
    effectiveKey,
    generate,
    cancel,
    loadHistory,
    removeHistory,
    clearHistory,
    download,
    copy,
    pickReference,
    clearReference
  };
}
