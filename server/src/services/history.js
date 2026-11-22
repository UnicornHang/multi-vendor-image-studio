import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { DATA_DIR } from "../config.js";

const FILE = path.join(DATA_DIR, "history.json");
const MAX_ENTRIES = 24;
/** 单条 base64 超过这个大小就不落盘，避免历史文件膨胀 */
const MAX_PERSIST_BASE64 = 3 * 1024 * 1024;

let cache = [];

function ensureDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function load() {
  try {
    const raw = fs.readFileSync(FILE, "utf8");
    const parsed = JSON.parse(raw);
    cache = Array.isArray(parsed) ? parsed : [];
  } catch {
    cache = [];
  }
  return cache;
}

function isBigBase64(item) {
  return item?.type === "base64" && typeof item.src === "string" && item.src.length > MAX_PERSIST_BASE64;
}

/** 落盘；写不下时逐步丢弃体积过大的 base64 条目 */
function persist() {
  ensureDir();
  let list = cache.slice();
  let dropped = 0;
  while (list.length > 0) {
    try {
      fs.writeFileSync(FILE, JSON.stringify(list, null, 2), "utf8");
      return { dropped };
    } catch (e) {
      const idx = list.findIndex(isBigBase64);
      if (idx === -1) {
        // 不是体积问题（权限 / 磁盘），退一步只保留链接类条目
        try {
          fs.writeFileSync(FILE, JSON.stringify(list.filter((x) => x.type !== "base64"), null, 2), "utf8");
        } catch {
          /* 放弃落盘，内存里仍然保留 */
        }
        return { dropped: list.length };
      }
      list.splice(idx, 1);
      dropped++;
    }
  }
  try {
    fs.writeFileSync(FILE, "[]", "utf8");
  } catch {
    /* ignore */
  }
  return { dropped };
}

export function getHistory() {
  if (!cache.length) load();
  return cache;
}

export function addHistory(items = []) {
  const now = new Date().toISOString();
  const entries = items
    .filter((it) => it && it.src)
    .map((it) => ({
      id: crypto.randomUUID(),
      src: it.src,
      type: it.type || "url",
      prompt: it.prompt || "",
      model: it.model || "",
      provider: it.provider || "",
      time: now
    }));
  cache = entries.concat(getHistory()).slice(0, MAX_ENTRIES);
  const { dropped } = persist();
  if (dropped) {
    console.warn(`[history] ${dropped} 条过大的图片未能落盘，仅保留在内存中。`);
  }
  return cache;
}

export function removeHistory(id) {
  cache = getHistory().filter((it) => it.id !== id);
  persist();
  return cache;
}

export function clearHistory() {
  cache = [];
  ensureDir();
  try {
    fs.writeFileSync(FILE, "[]", "utf8");
  } catch {
    /* ignore */
  }
  return cache;
}

load();
