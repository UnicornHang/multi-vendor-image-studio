/**
 * 快速配置解析器测试（node --test）
 */
import test from "node:test";
import assert from "node:assert/strict";
import { parseProviderConfig, detectProvider } from "../src/utils/quickConfig.js";

test("Claude Code settings.json：识别 env 段与 ANTHROPIC_* 字段", () => {
  const text = JSON.stringify({
    effortLevel: "high",
    enabledPlugins: { "figma@claude-plugins-official": true },
    env: {
      ANTHROPIC_AUTH_TOKEN: "sk-token-123",
      ANTHROPIC_BASE_URL: "https://api.minimaxi.com/anthropic",
      ANTHROPIC_MODEL: "MiniMax-M3.1-Flash",
      ANTHROPIC_DEFAULT_SONNET_MODEL: "MiniMax-M3.1-Flash",
      API_TIMEOUT_MS: "3000000"
    },
    tui: "fullscreen"
  });
  const p = parseProviderConfig(text);
  assert.equal(p.provider, "minimax");
  assert.equal(p.baseUrl, "https://api.minimaxi.com");
  assert.equal(p.path, "/anthropic");
  assert.equal(p.authHeader, "Authorization");
  assert.equal(p.authPrefix, "Bearer ");
  assert.equal(p.apiKey, "sk-token-123");
  assert.equal(p.model, "MiniMax-M3.1-Flash");
  // Anthropic 是对话端点，应给出图像接口的提示
  assert.ok(p.warnings.some((w) => w.includes("Anthropic")));
});

test("ANTHROPIC_API_KEY 走 x-api-key 且无前缀", () => {
  const p = parseProviderConfig(JSON.stringify({
    env: { ANTHROPIC_API_KEY: "sk-ant-xxx", ANTHROPIC_BASE_URL: "https://api.anthropic.com" }
  }));
  assert.equal(p.authHeader, "x-api-key");
  assert.equal(p.authPrefix, "");
  assert.equal(p.apiKey, "sk-ant-xxx");
});

test("OpenAI 兼容：完整 URL 拆成 base + path", () => {
  const p = parseProviderConfig(JSON.stringify({
    baseUrl: "https://api.openai.com/v1/images/generations",
    apiKey: "sk-openai",
    model: "gpt-image-1"
  }));
  assert.equal(p.provider, "openai");
  assert.equal(p.baseUrl, "https://api.openai.com");
  assert.equal(p.path, "/v1/images/generations");
  assert.equal(p.model, "gpt-image-1");
});

test("本项目扁平配置：显式 path / authHeader 优先", () => {
  const p = parseProviderConfig(JSON.stringify({
    provider: "custom",
    baseUrl: "https://gateway.example.com",
    path: "/v1/images/generations",
    authHeader: "X-Api-Key",
    authPrefix: "",
    apiKey: "abc",
    model: "m1"
  }));
  assert.equal(p.provider, "custom");
  assert.equal(p.baseUrl, "https://gateway.example.com");
  assert.equal(p.path, "/v1/images/generations");
  assert.equal(p.authHeader, "X-Api-Key");
  assert.equal(p.authPrefix, "");
  assert.equal(p.model, "m1");
});

test("Gemini 域名识别", () => {
  assert.equal(detectProvider("https://generativelanguage.googleapis.com/v1beta"), "gemini");
  const p = parseProviderConfig(JSON.stringify({
    baseUrl: "https://generativelanguage.googleapis.com",
    apiKey: "k"
  }));
  assert.equal(p.provider, "gemini");
});

test("缺字段时给出告警，非法 JSON 抛错", () => {
  const p = parseProviderConfig("{}");
  assert.ok(p.warnings.some((w) => w.includes("Base URL")));
  assert.ok(p.warnings.some((w) => w.includes("API Key")));
  assert.throws(() => parseProviderConfig("{ 不是 json"), /JSON 解析失败/);
  assert.throws(() => parseProviderConfig("[1,2]"), /必须是一个 JSON 对象/);
});
