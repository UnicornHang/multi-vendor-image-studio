import { Router } from "express";
import { runGeneration } from "../services/generate.js";
import { ApiError, internalErrorBody } from "../services/errors.js";
import { buildPrompt } from "../services/prompt.js";

const router = Router();

/**
 * 页面用的扩展端点（保留全部厂商特有能力：参考图、负向提示词策略、附加参数……）。
 * 想用统一协议请走 POST /v1/images/generations。
 */
router.post("/generate", async (req, res) => {
  const body = req.body || {};
  const ac = new AbortController();
  res.on("close", () => {
    if (!res.writableEnded) ac.abort();
  });

  try {
    const result = await runGeneration({
      provider: String(body.provider || ""),
      mode: String(body.mode || ""),
      config: body.config || {},
      prompt: body.prompt !== undefined && body.prompt !== null ? body.prompt : buildPrompt(body.parts || {}),
      negative: body.negative || "",
      negativeMode: String(body.negativeMode || "off"),
      ref: body.ref || null,
      signal: ac.signal
    });

    if (!result.items.length) {
      console.warn("[generate] 接口返回成功但没解析到图片。");
    }
    return res.json({
      ok: true,
      provider: result.provider,
      mode: result.mode,
      profile: result.profile,
      items: result.items,
      duration: result.duration,
      url: result.url,
      payload: result.payload
    });
  } catch (err) {
    const e =
      err instanceof ApiError
        ? err
        : new ApiError({ status: 500, type: "server_error", message: err.message });
    if (e.status !== 499) console.error("[generate] 失败:", e.message);
    return res.status(e.status).json(internalErrorBody(e));
  }
});

export default router;
