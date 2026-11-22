import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { DATA_DIR } from "../config.js";

/**
 * 角色设定档案（角色卡）落盘。
 *
 * 一次对话里描述出来的角色，后面每一张图都要能复用同一份外形描述，
 * 否则「同一个人」在每张图里长得都不一样。
 */

const FILE = path.join(DATA_DIR, "characters.json");
const MAX_ENTRIES = 60;

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

function persist() {
  ensureDir();
  try {
    fs.writeFileSync(FILE, JSON.stringify(cache, null, 2), "utf8");
  } catch (e) {
    console.warn("[characters] 落盘失败：", e.message);
  }
}

/** 全部角色卡 */
export function getCharacters() {
  if (!cache.length) load();
  return cache;
}

/** 新建或更新一个角色卡；带 id 就是更新 */
export function saveCharacter(input = {}) {
  const list = getCharacters();
  const id = String(input.id || "").trim() || crypto.randomUUID();
  const now = new Date().toISOString();
  const record = {
    id,
    name: String(input.name || "").trim() || "未命名角色",
    role: String(input.role || "").trim(),
    appearance: String(input.appearance || "").trim(),
    outfit: String(input.outfit || "").trim(),
    personality: String(input.personality || "").trim(),
    palette: String(input.palette || "").trim(),
    signature: String(input.signature || "").trim(),
    promptFragment: String(input.promptFragment || "").trim(),
    createdAt: now,
    updatedAt: now
  };
  const idx = list.findIndex((c) => c.id === id);
  if (idx >= 0) {
    record.createdAt = list[idx].createdAt || now;
    cache = list.slice();
    cache[idx] = record;
  } else {
    cache = [record, ...list].slice(0, MAX_ENTRIES);
  }
  persist();
  return record;
}

/** 删除角色卡 */
export function removeCharacter(id) {
  cache = getCharacters().filter((c) => c.id !== id);
  persist();
  return cache;
}

load();
