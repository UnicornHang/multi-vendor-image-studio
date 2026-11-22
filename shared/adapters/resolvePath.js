/**
 * 响应路径解析（自定义模式用）
 *
 * 支持：a.b / a[].b / a[0].b / a.b[]
 */
export function resolvePath(obj, path) {
  let cur = [obj];
  for (const segRaw of String(path || "").split(".").filter(Boolean)) {
    const next = [];
    const idxMatch = segRaw.match(/^(.+)\[(\d+)\]$/);
    if (idxMatch) {
      const key = idxMatch[1];
      const idx = Number(idxMatch[2]);
      for (const o of cur) {
        const v = o?.[key];
        if (Array.isArray(v) && v[idx] !== undefined) next.push(v[idx]);
      }
    } else {
      const flatten = segRaw.endsWith("[]");
      const seg = segRaw.replace(/\[\]$/, "");
      for (const o of cur) {
        if (o == null) continue;
        const v = o[seg];
        if (v === undefined) continue;
        if (flatten && Array.isArray(v)) next.push(...v);
        else next.push(v);
      }
    }
    cur = next;
  }
  return cur;
}
