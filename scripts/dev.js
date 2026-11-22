#!/usr/bin/env node
/**
 * 一键启动：Node 后端（8787）+ Vite 前端（5173）。
 * 前端已把 /api 代理到后端，直接开 http://localhost:5173 即可。
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function run(name, cwd, cmd, args) {
  const child = spawn(cmd, args, {
    cwd: path.join(root, cwd),
    shell: process.platform === "win32",
    stdio: ["ignore", "pipe", "pipe"],
    env: process.env
  });
  const tag = `[${name}]`;
  child.stdout.on("data", (d) => process.stdout.write(prefix(tag, d)));
  child.stderr.on("data", (d) => process.stderr.write(prefix(tag, d)));
  child.on("exit", (code) => {
    console.log(`${tag} 退出（code ${code}）`);
    process.exit(code ?? 0);
  });
  return child;
}

function prefix(tag, buf) {
  return String(buf)
    .split(/\r?\n/)
    .filter((l) => l.length)
    .map((l) => `${tag} ${l}\n`)
    .join("");
}

run("server", "server", "npm", ["run", "dev"]);
run("web", "web", "npm", ["run", "dev"]);
