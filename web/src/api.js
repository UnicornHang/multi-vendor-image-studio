const BASE = import.meta.env.VITE_API_BASE || "";

/** 统一的请求封装：后端错误统一抛 Error(message) */
async function request(path, { method = "GET", body, signal } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    /* 非 JSON */
  }
  if (!res.ok) {
    const msg = data?.error?.message || `HTTP ${res.status}`;
    const err = new Error(msg);
    err.status = res.status;
    err.raw = data;
    throw err;
  }
  return data;
}

export const getProfiles = () => request("/api/profiles");

export const getHealth = () => request("/api/health");

export const generate = (payload, signal) => request("/api/generate", { method: "POST", body: payload, signal });

export const getHistory = () => request("/api/history");

export const addHistory = (items) => request("/api/history", { method: "POST", body: { items } });

export const deleteHistory = (id) => request(`/api/history/${id}`, { method: "DELETE" });

export const clearHistory = () => request("/api/history", { method: "DELETE" });

export const discoverModels = (payload) =>
  request("/api/discover-models", { method: "POST", body: payload });

/* ---------------- AI Agent（漫画助手） ---------------- */

/** 查询 Agent 是否已配置（带上页面里的配置，服务端据此判断覆盖关系） */
export const agentStatus = (params = {}) => {
  const q = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== "")
  ).toString();
  return request("/api/agent/status" + (q ? "?" + q : ""));
};

/** 真发一次最小请求，验证地址 / Key / 模型是否可用 */
export const agentTest = (payload, signal) =>
  request("/api/agent/test", { method: "POST", body: payload, signal });

/** 一句描述 → 补全表单 */
export const agentFill = (payload, signal) =>
  request("/api/agent/fill", { method: "POST", body: payload, signal });

/** 一句描述 → N 格分镜 */
export const agentStoryboard = (payload, signal) =>
  request("/api/agent/storyboard", { method: "POST", body: payload, signal });

/** 一句描述 → 角色设定 */
export const agentGenerateCharacters = (payload, signal) =>
  request("/api/agent/characters/generate", { method: "POST", body: payload, signal });

export const getAgentCharacters = () => request("/api/agent/characters");

export const saveAgentCharacter = (item) =>
  request("/api/agent/characters", { method: "POST", body: item });

export const deleteAgentCharacter = (id) =>
  request(`/api/agent/characters/${encodeURIComponent(id)}`, { method: "DELETE" });

/** 出图后复盘 */
export const agentRefine = (payload, signal) =>
  request("/api/agent/refine", { method: "POST", body: payload, signal });
