#!/usr/bin/env node
/**
 * 后端开发守护进程。
 *
 * 为什么不直接用 `node --watch`：
 *   1. `--watch` 的子进程一旦非零退出就进入「等待文件变更」状态，必须再改一次代码才会重新起来；
 *   2. 重启时旧进程可能还没释放 8787，新进程直接 EADDRINUSE 崩掉。
 *
 * 这里自己管这件事：
 *   - 监听 server/src、shared/ 与 server/.env 的变更 → 自动重启；
 *   - 子进程意外退出（崩溃 / 被外部 kill）→ 自动拉起；
 *   - 每次拉起前先确认端口已释放，避免 EADDRINUSE。
 */
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const SERVER_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REPO_ROOT = path.resolve(SERVER_ROOT, "..");

const HOST = process.env.HOST || "127.0.0.1";
const PORT = Number(process.env.PORT || 8787);

/** 变更后多久重启（等编辑器写完文件） */
const DEBOUNCE_MS = 300;
/** 子进程意外退出后的拉起间隔（连续失败会退避，最大 5 秒） */
const RESTART_DELAY_MS = 1000;
const MAX_BACKOFF_MS = 5000;
/** 子进程稳定运行多久算「启动成功」（用于重置退避） */
const STABLE_MS = 3000;

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

let child = null;
let intentionalStop = false;
let shuttingDown = false;
let restarting = false;
let pendingRestart = false;
let restartTimer = null;
/** 连续失败次数，用于退避 */
let failStreak = 0;

/** 端口是否空闲（能自己 bind 就算空闲） */
function isPortFree() {
  return new Promise((resolve) => {
    const probe = net.createServer();
    probe.once("error", (err) => resolve(err.code !== "EADDRINUSE"));
    probe.once("listening", () => probe.close(() => resolve(true)));
    probe.listen(PORT, HOST);
  });
}

/** 等端口释放；返回是否成功等到 */
async function waitPortFree(timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isPortFree()) return true;
    await delay(150);
  }
  return false;
}

/** 停掉当前子进程并等它真正退出 */
function stopChild() {
  return new Promise((resolve) => {
    if (!child) return resolve();
    const target = child;
    child = null;
    const done = () => resolve();
    target.once("exit", done);
    try {
      target.kill("SIGTERM");
    } catch {
      return resolve();
    }
    // 兜底：2 秒还没退就强杀
    setTimeout(() => {
      try {
        target.kill("SIGKILL");
      } catch {
        /* 已退出 */
      }
      resolve();
    }, 2000);
  });
}

/** 启动一个后端子进程 */
async function start() {
  if (shuttingDown) return;
  if (child) return;

  if (!(await waitPortFree())) {
    console.log(`[dev] 端口 ${HOST}:${PORT} 仍被占用，1 秒后再试`);
    scheduleStart(RESTART_DELAY_MS);
    return;
  }

  console.log(`[dev] 启动后端：node src/index.js  →  http://${HOST}:${PORT}`);
  const startedAt = Date.now();
  child = spawn(process.execPath, ["src/index.js"], {
    cwd: SERVER_ROOT,
    stdio: "inherit",
    env: process.env
  });

  child.on("exit", (code, signal) => {
    child = null;
    if (intentionalStop) return;
    // 存活超过 STABLE_MS 才算启动成功，失败计数清零
    if (Date.now() - startedAt > STABLE_MS) failStreak = 0;
    failStreak += 1;
    const wait = Math.min(RESTART_DELAY_MS * failStreak, MAX_BACKOFF_MS);
    console.log(`[dev] 后端已退出（code=${code} signal=${signal ?? "-"}），${wait / 1000} 秒后自动拉起`);
    scheduleStart(wait);
  });

  child.on("error", (err) => {
    console.error("[dev] 子进程启动失败：", err.message);
  });
}

function scheduleStart(delayMs) {
  if (shuttingDown) return;
  if (restartTimer) clearTimeout(restartTimer);
  restartTimer = setTimeout(() => {
    restartTimer = null;
    start();
  }, delayMs);
}

/** 重启：先停旧的，等端口释放，再起新的 */
async function restart(reason) {
  if (restarting) {
    pendingRestart = true;
    return;
  }
  restarting = true;
  console.log(`[dev] ${reason}，正在重启后端…`);
  intentionalStop = true;
  await stopChild();
  intentionalStop = false;
  failStreak = 0;
  await start();
  restarting = false;
  if (pendingRestart) {
    pendingRestart = false;
    setTimeout(() => restart("代码再次变更"), 300);
  }
}

/** 监听源码目录变化 */
function watch(target, label) {
  if (!fs.existsSync(target)) return;
  try {
    fs.watch(target, { recursive: true }, (_event, filename) => {
      if (filename && /(^|[\\/])(\.|node_modules)/.test(String(filename))) return;
      if (restartTimer) {
        clearTimeout(restartTimer);
        restartTimer = null;
      }
      setTimeout(() => restart(`检测到 ${label} 变更`), DEBOUNCE_MS);
    });
    console.log(`[dev] 监听中：${label} → ${target}`);
  } catch (err) {
    console.warn(`[dev] 无法监听 ${label}：${err.message}`);
  }
}

watch(path.join(SERVER_ROOT, "src"), "server/src");
watch(path.join(REPO_ROOT, "shared"), "shared/");
watch(path.join(SERVER_ROOT, ".env"), "server/.env");

process.on("SIGINT", async () => {
  shuttingDown = true;
  intentionalStop = true;
  await stopChild();
  process.exit(0);
});
process.on("SIGTERM", async () => {
  shuttingDown = true;
  intentionalStop = true;
  await stopChild();
  process.exit(0);
});

await start();
