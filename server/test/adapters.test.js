/**
 * 适配层测试（原 smoke-test.js 的等价物，迁到 Node 原生 test runner）。
 * 运行：npm test --prefix server
 */
import test from "node:test";
import assert from "node:assert/strict";
import { PROFILES, resolvePath } from "../src/adapters/index.js";

test("MiniMax：请求体与图片取值", () => {
  const mm = PROFILES.minimax.modes[0];
  const ctx = {
    model: "image-01", prompt: "a girl", negative: "blurry", aspect: "16:9",
    n: 2, quality: "", responseFormat: "url", optimizer: true, seed: "42",
    ref: { type: "character", base64: "BASE64DATA" }
  };
  assert.deepEqual(mm.build(ctx), {
    model: "image-01", prompt: "a girl", aspect_ratio: "16:9", response_format: "url",
    n: 2, prompt_optimizer: true, seed: 42, negative_prompt: "blurry",
    subject_reference: [{ type: "character", image_file: "BASE64DATA" }]
  });
  assert.deepEqual(mm.extract({ data: { image_urls: ["https://x/a.png"] } }), [{ src: "https://x/a.png", type: "url" }]);
  assert.deepEqual(mm.extract({ data: { images: ["QUJD"] } }), [{ src: "data:image/png;base64,QUJD", type: "base64" }]);
});

test("OpenAI 兼容：gpt-image-1 剔除 response_format", () => {
  const oa = PROFILES.openai.modes[0];
  assert.deepEqual(
    oa.build({ model: "gpt-image-1", prompt: "cat", aspect: "1024x1024", n: 1, quality: "high", responseFormat: "b64_json", seed: "" }),
    { model: "gpt-image-1", prompt: "cat", n: 1, size: "1024x1024", quality: "high" }
  );
  assert.equal(
    oa.build({ model: "dall-e-3", prompt: "cat", aspect: "auto", n: 1, quality: "hd", responseFormat: "url", seed: "7" }).response_format,
    "url"
  );
  assert.deepEqual(oa.extract({ data: [{ url: "https://x/b.png" }] }), [{ src: "https://x/b.png", type: "url" }]);
  assert.deepEqual(oa.extract({ data: [{ b64_json: "QUJD" }] }), [{ src: "data:image/png;base64,QUJD", type: "base64" }]);
});

test("Gemini / Imagen：请求体与图片取值", () => {
  const im = PROFILES.gemini.modes[0];
  assert.deepEqual(
    im.build({ model: "imagen-3.0-generate-002", prompt: "sunset", negative: "text", aspect: "1:1", n: 1 }),
    { instances: [{ prompt: "sunset" }], parameters: { sampleCount: 1, aspectRatio: "1:1", negativePrompt: "text" } }
  );
  assert.deepEqual(
    im.extract({ predictions: [{ mimeType: "image/png", bytesBase64Encoded: "QUJD" }] }),
    [{ src: "data:image/png;base64,QUJD", type: "base64" }]
  );
});

test("Gemini 图像模型：请求体与图片取值", () => {
  const gi = PROFILES.gemini.modes[1];
  assert.deepEqual(
    gi.build({ model: "gemini-2.5-flash-image", prompt: "fox", aspect: "3:2", n: 1 }),
    {
      contents: [{ role: "user", parts: [{ text: "fox" }] }],
      generationConfig: { responseModalities: ["IMAGE"], imageConfig: { aspectRatio: "3:2" } }
    }
  );
  assert.deepEqual(
    gi.extract({ candidates: [{ content: { parts: [{ inlineData: { mimeType: "image/png", data: "QUJD" } }] } }] }),
    [{ src: "data:image/png;base64,QUJD", type: "base64" }]
  );
});

test("自定义模板：占位符替换", () => {
  const cs = PROFILES.custom.modes[0];
  const body = cs.build({
    model: "m1", prompt: "p1", negative: "n1", aspect: "1:1", n: 3, seed: "",
    quality: "q",
    bodyTemplate: '{"m":"{{model}}","p":"{{prompt}}","n":{{n}},"neg":"{{negative}}","ref":"{{refBase64}}"}'
  });
  assert.deepEqual(body, { m: "m1", p: "p1", n: 3, neg: "n1", ref: "" });
});

test("响应路径解析", () => {
  assert.deepEqual(resolvePath({ a: { b: ["x"] } }, "a.b"), [["x"]]);
  assert.deepEqual(resolvePath({ a: [{ b: "x" }, { b: "y" }] }, "a[].b"), ["x", "y"]);
  assert.deepEqual(resolvePath({ a: [{ b: ["x"] }] }, "a[].b[]"), ["x"]);
  assert.deepEqual(resolvePath({ a: [{ b: "x" }, { b: "y" }] }, "a[0].b"), ["x"]);
  assert.deepEqual(resolvePath({ predictions: [{ bytesBase64Encoded: "Q" }] }, "predictions[].bytesBase64Encoded"), ["Q"]);
});
