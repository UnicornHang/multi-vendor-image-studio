/**
 * OpenAI 兼容协议层测试：模型注册表 / 错误归一化 / /v1/images/generations 端到端。
 * 运行：npm test --prefix server
 */
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { listModelEntries, findModelEntries, sizeToRatio, modeCapabilities } from "../src/adapters/registry.js";
import { normalizeError } from "../src/services/errors.js";
import { PROFILES } from "../src/adapters/profiles.js";

/* ---------- 纯函数部分 ---------- */
test("模型注册表：跨厂商聚合 + 能力矩阵", () => {
  const all = listModelEntries();
  const ids = all.map((e) => e.id);
  assert.ok(ids.includes("gpt-image-1"));
  assert.ok(ids.includes("image-01"));
  assert.ok(ids.includes("gemini-2.5-flash-image"));

  const gpt = all.find((e) => e.id === "gpt-image-1");
  assert.equal(gpt.provider, "openai");
  assert.equal(gpt.mode, "images_generations");
  assert.equal(gpt.object, "model");
  assert.ok(gpt.capabilities.aspect.includes("1024x1024"));
  assert.equal(gpt.capabilities.seed, true);
  assert.equal(gpt.capabilities.reference, false);

  // 模型级能力覆盖：dall-e-3 只有 1792×1024，没有 1536×1024
  const dalle = all.find((e) => e.id === "dall-e-3");
  assert.ok(dalle.capabilities.aspect.includes("1792x1024"));
  assert.ok(!dalle.capabilities.aspect.includes("1536x1024"));

  // 同一模式下模型能力可覆盖
  const caps = modeCapabilities(PROFILES.openai.modes[0], "dall-e-3");
  assert.ok(caps.aspect.includes("1024x1792"));

  assert.equal(findModelEntries("image-01").length, 1);
  assert.equal(findModelEntries("不存在的模型").length, 0);
});

test("尺寸换算：WxH → 比例", () => {
  assert.equal(sizeToRatio("1024x1024"), "1:1");
  assert.equal(sizeToRatio("1536x1024"), "3:2");
  assert.equal(sizeToRatio("1024x1536"), "2:3");
  assert.equal(sizeToRatio("1792x1024"), "7:4");
  assert.equal(sizeToRatio("不是尺寸"), "");
});

test("错误归一化", () => {
  const auth = normalizeError(401, { error: { message: "bad key" } }, "");
  assert.equal(auth.type, "authentication_error");
  assert.equal(auth.retryable, false);

  const rl = normalizeError(429, { error: { message: "slow down" } }, "");
  assert.equal(rl.type, "rate_limit_error");
  assert.equal(rl.retryable, true);

  const policy = normalizeError(400, { error: { message: "blocked by safety policy" } }, "");
  assert.equal(policy.type, "content_policy_violation");

  // MiniMax：HTTP 200 但 body 里带错误
  const mm = normalizeError(200, { base_resp: { status_code: 1004, status_msg: "insufficient balance" } }, "");
  assert.equal(mm.type, "quota_exceeded");
  assert.equal(mm.code, "1004");

  const upstream = normalizeError(503, {}, "bad gateway");
  assert.equal(upstream.type, "upstream_error");
  assert.equal(upstream.retryable, true);
});

/* ---------- 端到端：/v1/images/generations ---------- */
test("/v1/images/generations 端到端（mock 厂商）", async () => {
  // mock 厂商
  let seen = null;
  const mock = http.createServer((req, res) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      seen = { url: req.url, headers: req.headers, body: Buffer.concat(chunks).toString() };
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ data: [{ url: "https://cdn.example.com/a.png" }] }));
    });
  });
  await new Promise((r) => mock.listen(0, "127.0.0.1", r));
  const mockPort = mock.address().port;

  // 渠道配置：把 openai 渠道指向 mock
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "studio-v1-"));
  const channelsFile = path.join(tmp, "channels.json");
  fs.writeFileSync(
    channelsFile,
    JSON.stringify({
      channels: [
        {
          id: "openai-mock",
          provider: "openai",
          mode: "images_generations",
          enabled: true,
          priority: 1,
          baseUrl: `http://127.0.0.1:${mockPort}`,
          path: "/v1/images/generations",
          authHeader: "Authorization",
          authPrefix: "Bearer ",
          model: "gpt-image-1",
          apiKey: "sk-test-key"
        }
      ]
    })
  );
  process.env.CHANNELS_FILE = channelsFile;
  process.env.DATA_DIR = path.join(tmp, "data");

  // 延迟导入，确保上面两个环境变量先生效
  const { createApp } = await import("../src/app.js");
  const app = createApp();
  const server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  const base = `http://127.0.0.1:${server.address().port}`;

  const post = async (body) => {
    const res = await fetch(`${base}/v1/images/generations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    return { status: res.status, body: await res.json() };
  };

  try {
    // 1) 正常生成
    const ok = await post({ model: "gpt-image-1", prompt: "a cat", size: "1024x1024", n: 1 });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.data.length, 1);
    assert.equal(ok.body.data[0].url, "https://cdn.example.com/a.png");
    assert.ok(ok.body.created > 0);
    assert.equal(ok.body.usage.images, 1);
    // 上游确实收到了请求，密钥来自渠道配置
    assert.equal(seen.url, "/v1/images/generations");
    assert.equal(seen.headers["authorization"], "Bearer sk-test-key");
    assert.equal(JSON.parse(seen.body).size, "1024x1024");

    // 2) 未知模型
    const noModel = await post({ model: "does-not-exist", prompt: "x" });
    assert.equal(noModel.status, 404);
    assert.equal(noModel.body.error.type, "invalid_request_error");
    assert.equal(noModel.body.error.code, "model_not_found");

    // 3) 缺少 model
    const noName = await post({ prompt: "x" });
    assert.equal(noName.status, 400);
    assert.equal(noName.body.error.code, "missing_model");

    // 4) 能力校验：dall-e-3 不支持 1536x1024
    const badSize = await post({ model: "dall-e-3", prompt: "x", size: "1536x1024" });
    assert.equal(badSize.status, 400);
    assert.equal(badSize.body.error.code, "unsupported_size");

    // 5) 能力校验：quality 不支持
    const badQuality = await post({ model: "gemini-2.5-flash-image", prompt: "x", quality: "hd" });
    assert.equal(badQuality.status, 400);
    assert.equal(badQuality.body.error.code, "unsupported_quality");

    // 6) 模型注册表
    const models = await (await fetch(`${base}/v1/models`)).json();
    assert.equal(models.object, "list");
    assert.ok(models.data.some((m) => m.id === "gpt-image-1"));

    // 7) 渠道列表（不含密钥明文）
    const providers = await (await fetch(`${base}/v1/providers`)).json();
    assert.ok(providers.data.length >= 1);
    assert.equal(providers.data[0].has_key, true);
    assert.ok(!("apiKey" in providers.data[0]));

    // 8) 用量统计
    const usage = await (await fetch(`${base}/v1/usage`)).json();
    assert.ok(usage.total_requests >= 1);
    assert.ok(usage.by_model["gpt-image-1"].images >= 1);
  } finally {
    server.close();
    mock.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
