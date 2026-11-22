import { Router } from "express";
import { ApiError, internalErrorBody } from "../services/errors.js";
import { resolveAgentConfig, AGENT } from "../config.js";
import { chat } from "../services/llm.js";
import {
  fillForm,
  buildStoryboard,
  makeCharacters,
  refineImage
} from "../services/agent.js";
import {
  getCharacters,
  saveCharacter,
  removeCharacter
} from "../services/characters.js";

const router = Router();

/** 请求被客户端断开时中止上游调用 */
function abortOnClose(req, res) {
  const ac = new AbortController();
  res.on("close", () => {
    if (!res.writableEnded) ac.abort();
  });
  return ac;
}

/** 统一的错误处理：归一化成前端能读的信封 */
function handle(res, err) {
  const e =
    err instanceof ApiError
      ? err
      : new ApiError({ status: 500, type: "server_error", message: err.message });
  if (e.status !== 499) console.error("[agent] 失败:", e.message);
  return res.status(e.status).json(internalErrorBody(e));
}

/* ---------------- 状态 ---------------- */

/** Agent 是否已配置（前端用它决定要不要提示去填模型配置） */
router.get("/agent/status", (req, res) => {
  const cfg = resolveAgentConfig(req.query || {});
  res.json({
    configured: !!(cfg.baseUrl && cfg.apiKey && cfg.model),
    baseUrl: cfg.baseUrl,
    model: cfg.model,
    visionModel: cfg.visionModel,
    source: {
      baseUrl: req.query?.baseUrl ? "page" : AGENT.baseUrl ? "server" : "",
      apiKey: req.query?.apiKey ? "page" : AGENT.apiKey ? "server" : "",
      model: req.query?.model ? "page" : AGENT.model ? "server" : ""
    }
  });
});

/* ---------------- 连通性检测 ---------------- */

/**
 * 真正发一次最小请求，验证地址 / Key / 模型名是否可用。
 * 「配置页面」里的「保存并检测」用的就是它 —— 只检查配置项存在是不够的，
 * 地址写错、Key 过期、模型名拼错都只有真调一次才知道。
 */
router.post("/agent/test", async (req, res) => {
  const body = req.body || {};
  const ac = abortOnClose(req, res);
  const started = Date.now();
  try {
    const cfg = resolveAgentConfig(body.config || {});
    const out = await chat({
      config: cfg,
      system: "你是一个连通性测试助手。",
      user: "只回复两个字：正常",
      signal: ac.signal
    });
    return res.json({
      ok: true,
      model: out.model,
      reply: String(out.text || "").trim().slice(0, 120),
      durationMs: Date.now() - started
    });
  } catch (err) {
    return handle(res, err);
  }
});

/* ---------------- 能力 1：智能填表 ---------------- */

router.post("/agent/fill", async (req, res) => {
  const body = req.body || {};
  const ac = abortOnClose(req, res);
  try {
    const result = await fillForm({
      brief: String(body.brief || "").trim(),
      provider: String(body.provider || ""),
      mode: String(body.mode || ""),
      model: String(body.model || ""),
      style: String(body.style || ""),
      styleKey: String(body.styleKey || ""),
      characters: body.characters || [],
      extra: String(body.extra || ""),
      current: body.current || {},
      config: body.config || {},
      signal: ac.signal
    });
    return res.json({ ok: true, ...result });
  } catch (err) {
    return handle(res, err);
  }
});

/* ---------------- 能力 2：分镜拆解 ---------------- */

router.post("/agent/storyboard", async (req, res) => {
  const body = req.body || {};
  const ac = abortOnClose(req, res);
  try {
    const result = await buildStoryboard({
      brief: String(body.brief || "").trim(),
      provider: String(body.provider || ""),
      mode: String(body.mode || ""),
      model: String(body.model || ""),
      panelCount: body.panelCount,
      style: String(body.style || ""),
      styleKey: String(body.styleKey || ""),
      characters: body.characters || [],
      config: body.config || {},
      signal: ac.signal
    });
    return res.json({ ok: true, ...result });
  } catch (err) {
    return handle(res, err);
  }
});

/* ---------------- 能力 3：角色档案 ---------------- */

/** 根据描述生成角色设定（不落盘，用户确认后再存） */
router.post("/agent/characters/generate", async (req, res) => {
  const body = req.body || {};
  const ac = abortOnClose(req, res);
  try {
    const result = await makeCharacters({
      brief: String(body.brief || "").trim(),
      style: String(body.style || ""),
      styleKey: String(body.styleKey || ""),
      config: body.config || {},
      signal: ac.signal
    });
    return res.json({ ok: true, ...result });
  } catch (err) {
    return handle(res, err);
  }
});

/** 已保存的角色卡 */
router.get("/agent/characters", (req, res) => {
  res.json({ items: getCharacters() });
});

/** 保存 / 更新一个角色卡 */
router.post("/agent/characters", (req, res) => {
  const body = req.body || {};
  const record = saveCharacter(body);
  res.json({ ok: true, item: record, items: getCharacters() });
});

/** 删除角色卡 */
router.delete("/agent/characters/:id", (req, res) => {
  const items = removeCharacter(String(req.params.id || ""));
  res.json({ ok: true, items });
});

/* ---------------- 能力 4：出图后复盘 ---------------- */

router.post("/agent/refine", async (req, res) => {
  const body = req.body || {};
  const ac = abortOnClose(req, res);
  try {
    const result = await refineImage({
      brief: String(body.brief || "").trim(),
      current: body.current || {},
      images: body.images || [],
      provider: String(body.provider || ""),
      mode: String(body.mode || ""),
      model: String(body.model || ""),
      config: body.config || {},
      signal: ac.signal
    });
    return res.json({ ok: true, ...result });
  } catch (err) {
    return handle(res, err);
  }
});

export default router;
