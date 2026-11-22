import { reactive, computed } from "vue";
import { ElMessage } from "element-plus";
import * as api from "../api.js";
import { useStudio } from "./useStudio.js";
import { COMIC_STYLES } from "../../../shared/agent/styles.js";

/**
 * AI 漫画助手的前端状态。
 *
 * 四项能力与后端一一对应：
 *   fill      智能填表   → 一句描述补全画面描述六栏 + 生成参数
 *   storyboard 分镜拆解  → 一句描述拆成 N 格
 *   characters 角色档案  → 可复用的角色设定
 *   refine    出图复盘   → 看图挑毛病并给改一版的提示词
 *
 * Agent 的产出统一落到现有表单里（useStudio.applyAgentForm），
 * 所以「填表 → 手工微调 → 生成」的流程完全不变。
 */

const LS_CFG = "mm.image.studio.agent.cfg";

const state = reactive({
  brief: "",
  styleKey: "jp-cel",
  panelCount: 4,
  /** 选中的角色卡 id */
  useCharacterIds: [],
  /** Agent 模型配置（留空则用服务端 .env） */
  cfg: {
    baseUrl: "",
    path: "/v1/chat/completions",
    authHeader: "",
    authPrefix: "",
    apiKey: "",
    model: "",
    visionModel: ""
  },
  /** 页面里是否已经保存过配置（决定鉴权头/前缀是否覆盖服务端） */
  cfgSaved: false,
  configured: false,
  checked: false,
  /** 服务端 .env 里实际生效的模型（页面没覆盖时用它） */
  serverModel: "",
  serverVisionModel: "",
  busy: "",
  error: "",
  hint: "",
  /** 连通性检测结果 */
  test: null,
  /** 填表结果 */
  fill: null,
  /** 分镜结果 */
  board: null,
  /** 刚生成、待确认的角色 */
  drafts: [],
  /** 已保存的角色卡 */
  library: [],
  /** 复盘结果 */
  refine: null
});

const styles = COMIC_STYLES;
const busy = computed(() => state.busy);
const styleObj = computed(() => styles.find((s) => s.key === state.styleKey) || null);
const selectedCharacters = computed(() =>
  state.library.filter((c) => state.useCharacterIds.includes(c.id))
);

/* ---------------- 配置存取 ---------------- */

function loadCfg() {
  try {
    const raw = localStorage.getItem(LS_CFG);
    if (!raw) return;
    const saved = JSON.parse(raw);
    if (saved.cfg) Object.assign(state.cfg, saved.cfg);
    if (saved.styleKey) state.styleKey = saved.styleKey;
    if (saved.panelCount) state.panelCount = saved.panelCount;
    if (Array.isArray(saved.useCharacterIds)) state.useCharacterIds = saved.useCharacterIds;
    state.cfgSaved = !!saved.cfgSaved;
  } catch {
    /* 忽略损坏的本地配置 */
  }
}

function saveCfg() {
  try {
    localStorage.setItem(
      LS_CFG,
      JSON.stringify({
        cfg: state.cfg,
        cfgSaved: state.cfgSaved,
        styleKey: state.styleKey,
        panelCount: state.panelCount,
        useCharacterIds: state.useCharacterIds
      })
    );
  } catch {
    /* ignore */
  }
}

/**
 * 传给后端的 Agent 配置。
 *
 * 普通的值：空 = 不传，交给服务端 .env 兜底。
 * 鉴权头 / 鉴权前缀：只有页面里保存过配置才一并传（哪怕是空串），
 * 否则「不传」和「我就要空前缀」会分不清。
 */
function cfgPayload() {
  const c = state.cfg || {};
  const out = {};
  for (const k of ["baseUrl", "path", "apiKey", "model", "visionModel"]) {
    if (c[k]) out[k] = c[k];
  }
  if (state.cfgSaved) {
    out.authHeader = c.authHeader || "Authorization";
    out.authPrefix = c.authPrefix ?? "";
  }
  return out;
}

/** 保存页面里的 Agent 配置（标记为「页面已配置」，覆盖服务端同名项） */
function saveAgentCfg() {
  state.cfgSaved = true;
  saveCfg();
}

/** 清空页面配置，改回用服务端的 .env */
function resetAgentCfg() {
  Object.assign(state.cfg, {
    baseUrl: "",
    path: "/v1/chat/completions",
    authHeader: "",
    authPrefix: "",
    apiKey: "",
    model: "",
    visionModel: ""
  });
  state.cfgSaved = false;
  state.test = null;
  saveCfg();
  checkStatus();
}

/* ---------------- 状态检查 ---------------- */

/** 问后端 Agent 是否可用（前端配置优先于服务端 .env） */
async function checkStatus() {
  try {
    const res = await api.agentStatus(cfgPayload());
    state.configured = !!res?.configured;
    state.checked = true;
    state.serverModel = res?.model || "";
    state.serverVisionModel = res?.visionModel || "";
    state.hint = state.configured
      ? ""
      : "还没配置 Agent 模型：在下面「模型配置」里填 Base URL / API Key / Model，或在服务端 .env 设置 AGENT_* 。";
    state.error = "";
  } catch (e) {
    state.checked = true;
    state.configured = false;
    state.hint = "";
    state.error = "后端未连接：" + e.message;
  }
  return state.configured;
}

/** 真发一次最小请求，验证地址 / Key / 模型是否真的可用 */
async function testConnection() {
  state.test = null;
  const res = await run("test", () => api.agentTest({ config: cfgPayload() }));
  if (!res) {
    state.test = { ok: false, message: state.error };
    return null;
  }
  state.test = {
    ok: true,
    model: res.model,
    reply: res.reply,
    durationMs: res.durationMs
  };
  ElMessage.success("连接正常");
  return res;
}

/* ---------------- 公共负载 ---------------- */

function basePayload() {
  const studio = useStudio();
  return {
    brief: state.brief,
    provider: studio.state.provider,
    mode: studio.state.mode,
    // cur 是 computed ref，JS 里要取 .value
    model: studio.cur.value?.model || "",
    styleKey: state.styleKey,
    style: styleObj.value?.style || "",
    characters: selectedCharacters.value.map((c) => ({
      name: c.name,
      promptFragment: c.promptFragment,
      appearance: c.appearance,
      outfit: c.outfit,
      palette: c.palette
    }))
  };
}

/** 表单里当前的生成参数（作为 Agent 的兜底，避免覆盖用户已有的选择） */
function currentParams() {
  const cur = useStudio().cur.value || {};
  return {
    aspect: cur.aspect || "",
    quality: cur.quality || "",
    n: cur.n || 1,
    resolution: cur.resolution || "",
    responseFormat: cur.responseFormat || "",
    negativeMode: cur.negativeMode || "",
    seed: cur.seed ?? "",
    optimizer: !!cur.optimizer
  };
}

function needBrief() {
  if (!state.brief.trim()) {
    ElMessage.warning("先写一句你想画的内容。");
    return false;
  }
  return true;
}

async function run(key, fn) {
  if (state.busy) return null;
  state.busy = key;
  state.error = "";
  try {
    const res = await fn();
    return res;
  } catch (e) {
    state.error = e.message || String(e);
    ElMessage.error(state.error);
    return null;
  } finally {
    state.busy = "";
  }
}

/* ---------------- 能力 1：智能填表 ---------------- */

/** 一句描述 → 补全表单 */
async function fill() {
  if (!needBrief()) return null;
  const payload = {
    ...basePayload(),
    current: { params: currentParams() },
    config: cfgPayload()
  };
  const res = await run("fill", () => api.agentFill(payload));
  if (!res) return null;
  state.fill = { notes: res.notes, prompt: res.prompt, params: res.params };
  useStudio().applyAgentForm({ prompt: res.prompt, params: res.params });
  ElMessage.success("已把 Agent 的补全填入表单");
  return res;
}

/** 填表后直接生成 */
async function fillAndGenerate() {
  const res = await fill();
  if (!res) return;
  await useStudio().generate();
}

/* ---------------- 能力 2：分镜拆解 ---------------- */

async function storyboard() {
  if (!needBrief()) return null;
  const payload = { ...basePayload(), panelCount: state.panelCount, config: cfgPayload() };
  const res = await run("board", () => api.agentStoryboard(payload));
  if (!res) return null;
  state.board = { synopsis: res.synopsis, panels: res.panels || [] };
  ElMessage.success(`已拆出 ${state.board.panels.length} 格分镜`);
  return res;
}

/** 把某一格分镜填进表单（可选填完直接生成） */
function applyPanel(panel, andGenerate = false) {
  if (!panel) return;
  const s = useStudio();
  s.applyAgentForm({
    prompt: panel.prompt,
    params: panel.aspect ? { aspect: panel.aspect } : null
  });
  if (panel.dialogue || panel.sfx) {
    const notes = [panel.dialogue && `台词：${panel.dialogue}`, panel.sfx && `拟声词：${panel.sfx}`]
      .filter(Boolean)
      .join("；");
    s.appendDetail(notes);
  }
  if (andGenerate) s.generate();
}

/* ---------------- 能力 3：角色档案 ---------------- */

/** 根据描述生成角色设定（先不入库） */
async function genCharacters() {
  if (!needBrief()) return null;
  const payload = { ...basePayload(), config: cfgPayload() };
  const res = await run("chars", () => api.agentGenerateCharacters(payload));
  if (!res) return null;
  state.drafts = res.characters || [];
  ElMessage.success(`生成了 ${state.drafts.length} 个角色设定`);
  return res;
}

/** 把角色存入角色库 */
async function saveCharacter(c) {
  const res = await run("save-char", () => api.saveAgentCharacter(c));
  if (!res) return null;
  state.library = res.items || [];
  state.drafts = state.drafts.filter((d) => d.name !== c.name);
  ElMessage.success("已保存到角色库");
  return res;
}

/** 删除角色 */
async function delCharacter(id) {
  const res = await run("del-char", () => api.deleteAgentCharacter(id));
  if (!res) return null;
  state.library = res.items || [];
  state.useCharacterIds = state.useCharacterIds.filter((x) => x !== id);
  return res;
}

/** 读取角色库 */
async function loadCharacters() {
  try {
    const res = await api.getAgentCharacters();
    state.library = res.items || [];
  } catch (e) {
    state.error = "读取角色库失败：" + e.message;
  }
}

/** 把某个角色的固定描述追加到「场景与细节」栏 */
function useCharacter(c) {
  if (!c) return;
  const frag = c.promptFragment || [c.appearance, c.outfit, c.palette].filter(Boolean).join("；");
  useStudio().appendDetail(`${c.name}：${frag}`);
  ElMessage.success(`已把「${c.name}」的外形描述加入表单`);
}

/* ---------------- 能力 4：出图复盘 ---------------- */

/** 看当前结果找问题，给一版改好的提示词 */
async function refine() {
  const studio = useStudio();
  const items = studio.state.result?.items || [];
  const payload = {
    brief: state.brief || studio.state.prompt.main || "",
    current: {
      prompt: { ...studio.state.prompt },
      params: currentParams()
    },
    images: items.map((it) => ({ src: it.src, type: it.type })),
    provider: studio.state.provider,
    mode: studio.state.mode,
    model: studio.cur.value?.model || "",
    config: cfgPayload()
  };
  const res = await run("refine", () => api.agentRefine(payload));
  if (!res) return null;
  state.refine = res;
  return res;
}

/** 应用复盘建议 */
function applyRefine() {
  if (!state.refine) return;
  useStudio().applyAgentForm({ prompt: state.refine.prompt, params: state.refine.params });
  ElMessage.success("已应用修改建议");
}

/* ---------------- 启动 ---------------- */

function init() {
  loadCfg();
  checkStatus();
  loadCharacters();
}

export function useAgent() {
  return {
    state,
    styles,
    busy,
    styleObj,
    selectedCharacters,
    init,
    checkStatus,
    saveCfg,
    saveAgentCfg,
    resetAgentCfg,
    testConnection,
    fill,
    fillAndGenerate,
    storyboard,
    applyPanel,
    genCharacters,
    saveCharacter,
    delCharacter,
    loadCharacters,
    useCharacter,
    refine,
    applyRefine
  };
}
