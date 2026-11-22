import { Router } from "express";
import { getHistory, addHistory, removeHistory, clearHistory } from "../services/history.js";

const router = Router();

router.get("/history", (req, res) => {
  res.json({ items: getHistory() });
});

router.post("/history", (req, res) => {
  const items = Array.isArray(req.body?.items) ? req.body.items : [];
  res.json({ items: addHistory(items) });
});

router.delete("/history/:id", (req, res) => {
  res.json({ items: removeHistory(req.params.id) });
});

router.delete("/history", (req, res) => {
  res.json({ items: clearHistory() });
});

export default router;
