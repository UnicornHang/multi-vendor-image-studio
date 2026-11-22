import { ALLOW_ANY_UPSTREAM, ALLOWED_HOSTS, STRICT_UPSTREAM } from "../config.js";

/**
 * 校验上游地址。
 * - 只允许 http / https
 * - 白名单：通用代理路由默认校验；适配器请求仅在 STRICT_UPSTREAM=1 时校验
 *   （自定义模式本就要对接任意厂商，默认放行）
 */
export function checkUpstream(raw, { useWhitelist = false } = {}) {
  let u;
  try {
    u = new URL(String(raw || ""));
  } catch {
    return { error: "非法的上游地址" };
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") {
    return { error: "上游地址仅支持 http / https" };
  }
  const enforce = !ALLOW_ANY_UPSTREAM && (useWhitelist || STRICT_UPSTREAM);
  if (enforce && !ALLOWED_HOSTS.has(u.hostname)) {
    return { error: `上游域名 ${u.hostname} 不在白名单内（可在 .env 的 ALLOWED_UPSTREAM_HOSTS 中添加，或设置 ALLOW_ANY_UPSTREAM=1 放开）` };
  }
  return { url: u };
}

/** 转发一次 POST 到上游，返回原始状态码与文本 */
export async function postUpstream({ url, headers, body, signal }) {
  const res = await fetch(url, {
    method: "POST",
    headers,
    body: typeof body === "string" ? body : JSON.stringify(body),
    signal
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* 非 JSON 响应，交给调用方按文本处理 */
  }
  return { status: res.status, ok: res.ok, text, json };
}
