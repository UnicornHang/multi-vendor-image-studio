/* 适配层冒烟测试：用最小 DOM stub 跑真实脚本，验证各厂商 build/extract */
const fs = require("fs");
const path = require("path");

const html = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
let js = html.match(/<script>([\s\S]*?)<\/script>/)[1];

// 暴露内部符号供断言
js = js.replace(/\n\s*init\(\);\s*\n\}\)\(\);/, "\n  init();\n  global.__T = { PROFILES, resolvePath, buildPrompt, ctxPath };\n})();");

function mkEl() {
  const t = {
    value: "", innerHTML: "", textContent: "", className: "", checked: false,
    options: [], files: [], dataset: {}, style: {},
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    addEventListener() {}, appendChild() {}, insertAdjacentHTML() {},
    remove() {}, click() {}, focus() {}, select() {},
    querySelectorAll() { return []; }, closest() { return null; },
    scrollTop: 0, scrollHeight: 0
  };
  return t;
}
global.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
global.document = {
  getElementById: () => mkEl(),
  querySelectorAll: () => [],
  createElement: () => mkEl(),
  body: { appendChild() {}, removeChild() {}, addEventListener() {} },
  addEventListener() {}
};
global.window = { addEventListener() {} };
global.performance = { now: () => Date.now() };
global.fetch = async () => ({ ok: true, status: 200, text: async () => "{}" });
global.navigator = { clipboard: { writeText: async () => {} } };

eval(js);
const { PROFILES, resolvePath } = global.__T;

let pass = 0, fail = 0;
function eq(name, actual, expected) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}\n       got:      ${a}\n       expected: ${e}`); }
}

console.log("— MiniMax —");
const mm = PROFILES.minimax.modes[0];
const ctx = {
  model: "image-01", prompt: "a girl", negative: "blurry", aspect: "16:9",
  n: 2, quality: "", responseFormat: "url", optimizer: true, seed: "42",
  ref: { type: "character", base64: "BASE64DATA" }
};
eq("build body", mm.build(ctx), {
  model: "image-01", prompt: "a girl", aspect_ratio: "16:9", response_format: "url",
  n: 2, prompt_optimizer: true, seed: 42, negative_prompt: "blurry",
  subject_reference: [{ type: "character", image_file: "BASE64DATA" }]
});
eq("extract image_urls", mm.extract({ data: { image_urls: ["https://x/a.png"] } }), [{ src: "https://x/a.png", type: "url" }]);
eq("extract base64", mm.extract({ data: { images: ["QUJD"] } }), [{ src: "data:image/png;base64,QUJD", type: "base64" }]);

console.log("— OpenAI 兼容 —");
const oa = PROFILES.openai.modes[0];
eq("build body", oa.build({ model: "gpt-image-1", prompt: "cat", aspect: "1024x1024", n: 1, quality: "high", responseFormat: "b64_json", seed: "" }),
  { model: "gpt-image-1", prompt: "cat", n: 1, size: "1024x1024", quality: "high" });
eq("dall-e-3 keeps response_format", oa.build({ model: "dall-e-3", prompt: "cat", aspect: "auto", n: 1, quality: "hd", responseFormat: "url", seed: "7" }).response_format, "url");
eq("extract url", oa.extract({ data: [{ url: "https://x/b.png" }] }), [{ src: "https://x/b.png", type: "url" }]);
eq("extract b64", oa.extract({ data: [{ b64_json: "QUJD" }] }), [{ src: "data:image/png;base64,QUJD", type: "base64" }]);

console.log("— Gemini / Imagen —");
const im = PROFILES.gemini.modes[0];
eq("build body", im.build({ model: "imagen-3.0-generate-002", prompt: "sunset", negative: "text", aspect: "1:1", n: 1 }),
  { instances: [{ prompt: "sunset" }], parameters: { sampleCount: 1, aspectRatio: "1:1", negativePrompt: "text" } });
eq("extract predictions", im.extract({ predictions: [{ mimeType: "image/png", bytesBase64Encoded: "QUJD" }] }),
  [{ src: "data:image/png;base64,QUJD", type: "base64" }]);

console.log("— Gemini 图像模型 —");
const gi = PROFILES.gemini.modes[1];
eq("build body", gi.build({ model: "gemini-2.5-flash-image", prompt: "fox", aspect: "3:2", n: 1 }),
  { contents: [{ role: "user", parts: [{ text: "fox" }] }], generationConfig: { responseModalities: ["IMAGE"], imageConfig: { aspectRatio: "3:2" } } });
eq("extract inlineData", gi.extract({ candidates: [{ content: { parts: [{ inlineData: { mimeType: "image/png", data: "QUJD" } }] } }] }),
  [{ src: "data:image/png;base64,QUJD", type: "base64" }]);

console.log("— 自定义模板 —");
const cs = PROFILES.custom.modes[0];
eq("build body", cs.build({
  model: "m1", prompt: "p1", negative: "n1", aspect: "1:1", n: 3, seed: "",
  quality: "q", bodyTemplate: '{"m":"{{model}}","p":"{{prompt}}","n":{{n}},"neg":"{{negative}}","ref":"{{refBase64}}"}'
}), { m: "m1", p: "p1", n: 3, neg: "n1", ref: "" });
eq("resolvePath a.b", resolvePath({ a: { b: ["x"] } }, "a.b"), [["x"]]);
eq("resolvePath a[].b", resolvePath({ a: [{ b: "x" }, { b: "y" }] }, "a[].b"), ["x", "y"]);
eq("resolvePath a[].b[]", resolvePath({ a: [{ b: ["x"] }] }, "a[].b[]"), ["x"]);
eq("resolvePath a[0].b", resolvePath({ a: [{ b: "x" }, { b: "y" }] }, "a[0].b"), ["x"]);
eq("resolvePath predictions[].bytesBase64Encoded", resolvePath({ predictions: [{ bytesBase64Encoded: "Q" }] }, "predictions[].bytesBase64Encoded"), ["Q"]);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
