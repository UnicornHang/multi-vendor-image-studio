/**
 * 新增厂商预设的请求体 / 响应取值测试。
 * 运行：npm test --prefix server
 */
import test from "node:test";
import assert from "node:assert/strict";
import { PROFILES } from "../src/adapters/index.js";

test("OpenAI 同构厂商：SiliconFlow / 智谱 请求体一致", () => {
  for (const id of ["siliconflow", "zhipu"]) {
    const m = PROFILES[id].modes[0];
    const body = m.build({
      model: PROFILES[id].modes[0].defaults.model,
      prompt: "a cat", aspect: "1024x1024", n: 1, quality: "", responseFormat: "url", seed: ""
    });
    assert.equal(body.model, PROFILES[id].modes[0].defaults.model);
    assert.equal(body.prompt, "a cat");
    assert.equal(body.size, "1024x1024");
    assert.equal(body.n, 1);
    assert.deepEqual(m.extract({ data: [{ url: "https://x/a.png" }] }), [{ src: "https://x/a.png", type: "url" }]);
    assert.deepEqual(m.extract({ data: [{ b64_json: "QUJD" }] }), [{ src: "data:image/png;base64,QUJD", type: "base64" }]);
  }
});

test("火山方舟：响应取值同 OpenAI，但尺寸走 Seedream 规则", () => {
  const m = PROFILES.ark.modes[0];
  const body = m.build({
    model: "doubao-seedream-4-0-250828", prompt: "a cat", aspect: "1:1",
    n: 1, quality: "", responseFormat: "url", seed: ""
  });
  assert.equal(body.size, "2048x2048");   // 未选清晰度时用厂商默认 2K
  assert.equal(body.size.includes("1024x1024"), false);
  assert.deepEqual(m.extract({ data: [{ url: "https://x/a.png" }] }), [{ src: "https://x/a.png", type: "url" }]);
});

test("火山方舟：默认地址指向 Ark 开放平台", () => {
  const d = PROFILES.ark.modes[0].defaults;
  assert.equal(d.baseUrl, "https://ark.cn-beijing.volces.com/api/v3");
  assert.equal(d.path, "/images/generations");
});

test("阿里百炼：input/parameters 结构 + output.results 取图", () => {
  const m = PROFILES.dashscope.modes[0];
  const body = m.build({
    model: "wanx-v1", prompt: "山", negative: "水", aspect: "1024*1024", n: 2, seed: ""
  });
  assert.deepEqual(body, {
    model: "wanx-v1",
    input: { prompt: "山" },
    parameters: { size: "1024*1024", n: 2, negative_prompt: "水" }
  });
  assert.deepEqual(
    m.extract({ output: { results: [{ url: "https://x/wanx.png" }] } }),
    [{ src: "https://x/wanx.png", type: "url" }]
  );
});

test("Stability AI：aspect_ratio + image 字段 base64", () => {
  const m = PROFILES.stability.modes[0];
  const body = m.build({
    model: "stable-image-core", prompt: "cat", negative: "dog", aspect: "16:9", n: 1, seed: "7"
  });
  assert.deepEqual(body, {
    prompt: "cat", aspect_ratio: "16:9", output_format: "png", seed: 7, negative_prompt: "dog"
  });
  assert.deepEqual(
    m.extract({ image: "QUJD", output_format: "png" }),
    [{ src: "data:image/png;base64,QUJD", type: "base64" }]
  );
});

test("厂商目录：已注册的厂商与默认地址", () => {
  const expected = {
    minimax: "https://api.minimaxi.com",
    openai: "https://api.openai.com",
    ark: "https://ark.cn-beijing.volces.com/api/v3",
    siliconflow: "https://api.siliconflow.cn/v1",
    zhipu: "https://open.bigmodel.cn/api/paas/v4",
    dashscope: "https://dashscope.aliyuncs.com/api/v1",
    stability: "https://api.stability.ai",
    gemini: "https://generativelanguage.googleapis.com",
    custom: "https://api.example.com"
  };
  for (const [id, baseUrl] of Object.entries(expected)) {
    assert.ok(PROFILES[id], `缺少厂商 ${id}`);
    assert.equal(PROFILES[id].modes[0].defaults.baseUrl, baseUrl);
    assert.ok(PROFILES[id].label, `厂商 ${id} 缺少标题`);
  }
  // 每个厂商都必须有可用的 build / extract
  for (const [id, p] of Object.entries(PROFILES)) {
    for (const m of p.modes) {
      assert.equal(typeof m.build, "function", `${id}/${m.id} 缺少 build`);
      assert.equal(typeof m.extract, "function", `${id}/${m.id} 缺少 extract`);
    }
  }
});
