import fs from "node:fs";
import path from "node:path";
import { DATA_DIR } from "../config.js";

/**
 * 用量统计。
 *
 * 按 厂商 / 模型 / 天 累计请求数、图片数、错误数与平均耗时。
 * 落盘在 data/usage.json（尽力而为，失败不影响主流程）。
 */

const FILE = path.join(DATA_DIR, "usage.json");
const MAX_DAYS = 90;

function empty() {
  return {
    total_requests: 0,
    total_images: 0,
    total_errors: 0,
    latency_sum_ms: 0,
    by_model: {},
    by_provider: {},
    by_day: {},
    by_error_type: {}
  };
}

let state = empty();

function load() {
  try {
    const parsed = JSON.parse(fs.readFileSync(FILE, "utf8"));
    state = { ...empty(), ...parsed };
  } catch {
    state = empty();
  }
}

function save() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(state, null, 2), "utf8");
  } catch {
    /* 落盘失败不影响主流程 */
  }
}

function bump(bucket, key, n) {
  bucket[key] = (bucket[key] || 0) + n;
}

/**
 * 记一次生成。
 * @param {{provider:string, model:string, mode:string, images:number, ok:boolean, durationMs:number, errorType?:string}} e
 */
export function recordUsage(e) {
  const day = new Date().toISOString().slice(0, 10);
  const model = e.model || "unknown";
  const provider = e.provider || "unknown";

  state.total_requests += 1;
  state.latency_sum_ms += e.durationMs || 0;
  if (e.ok) {
    state.total_images += e.images || 0;
  } else {
    state.total_errors += 1;
    bump(state.by_error_type, e.errorType || "unknown", 1);
  }

  const m = state.by_model[model] || { requests: 0, images: 0, errors: 0, latency_sum_ms: 0 };
  m.requests += 1;
  m.latency_sum_ms += e.durationMs || 0;
  if (e.ok) m.images += e.images || 0;
  else m.errors += 1;
  state.by_model[model] = m;

  const p = state.by_provider[provider] || { requests: 0, images: 0, errors: 0 };
  p.requests += 1;
  if (e.ok) p.images += e.images || 0;
  else p.errors += 1;
  state.by_provider[provider] = p;

  const d = state.by_day[day] || { requests: 0, images: 0, errors: 0 };
  d.requests += 1;
  if (e.ok) d.images += e.images || 0;
  else d.errors += 1;
  state.by_day[day] = d;

  // 只保留最近 MAX_DAYS 天
  const days = Object.keys(state.by_day).sort();
  while (days.length > MAX_DAYS) {
    delete state.by_day[days.shift()];
  }

  save();
}

/** 汇总视图 */
export function getUsage() {
  const withAvg = (bucket) => {
    const out = {};
    for (const [k, v] of Object.entries(bucket)) {
      out[k] = { ...v, avg_latency_ms: v.requests ? Math.round(v.latency_sum_ms / v.requests) : 0 };
    }
    return out;
  };
  return {
    ...state,
    avg_latency_ms: state.total_requests ? Math.round(state.latency_sum_ms / state.total_requests) : 0,
    by_model: withAvg(state.by_model),
    by_provider: withAvg(state.by_provider),
    by_day: state.by_day
  };
}

export function resetUsage() {
  state = empty();
  save();
  return state;
}

load();
