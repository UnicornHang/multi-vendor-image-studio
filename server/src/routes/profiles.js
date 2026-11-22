import { Router } from "express";
import { profileMeta } from "../adapters/index.js";

const router = Router();

/** 厂商 / 模式 / 参数选项元数据（前端据此渲染表单） */
router.get("/profiles", (req, res) => {
  res.json({ providers: profileMeta() });
});

export default router;
