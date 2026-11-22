/**
 * 提示词组装（与前端保持同一套规则）。
 * 前端负责实时预览，后端以此为准，避免两边拼出不同的 prompt。
 */
export function buildPrompt(parts = {}) {
  const order = ["main", "style", "detail", "light", "cam"];
  const list = order
    .map((k) => String(parts[k] || "").trim())
    .filter(Boolean);
  return list.join("，");
}

/**
 * 负向提示词处理方式：
 *   inline —— 拼接到提示词末尾（前端负责拼，后端不再处理）
 *   field  —— 以独立字段发送（后端放入 ctx.negative）
 *   off    —— 不使用
 */
export function resolveNegative(negative, negativeMode) {
  const neg = String(negative || "").trim();
  if (!neg) return "";
  return negativeMode === "field" ? neg : "";
}
