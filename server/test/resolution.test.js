/**
 * 清晰度（分辨率档位）测试。
 * 运行：npm test --prefix server
 */
import test from "node:test";
import assert from "node:assert/strict";
import { PROFILES } from "../src/adapters/index.js";
import { tierToLongSide, ratioToSize, seedreamSize } from "../../shared/adapters/profiles.js";

test("档位 → 长边像素", () => {
  assert.equal(tierToLongSide("1K"), 1024);
  assert.equal(tierToLongSide("1.5K"), 1536);
  assert.equal(tierToLongSide("2K"), 2048);
  assert.equal(tierToLongSide(""), 0);
});

test("比例 + 档位 → 宽高（8 的倍数、512–2048）", () => {
  assert.deepEqual(ratioToSize("1:1", 1024), { width: 1024, height: 1024 });
  assert.deepEqual(ratioToSize("16:9", 1024), { width: 1024, height: 576 });
  assert.deepEqual(ratioToSize("4:3", 1536), { width: 1536, height: 1152 });
  assert.deepEqual(ratioToSize("9:16", 2048), { width: 1152, height: 2048 });
  // 21:9 在 2K 时短边取 8 的倍数
  const w = ratioToSize("21:9", 2048);
  assert.equal(w.width, 2048);
  assert.equal(w.height % 8, 0);
  assert.ok(w.height >= 512 && w.height <= 2048);
});

test("MiniMax：默认发 aspect_ratio，选清晰度后改发 width/height", () => {
  const m = PROFILES.minimax.modes[0];
  const base = { model: "image-01", prompt: "cat", aspect: "16:9", n: 1, optimizer: false, responseFormat: "url" };

  const def = m.build({ ...base, resolution: "" });
  assert.equal(def.aspect_ratio, "16:9");
  assert.equal(def.width, undefined);
  assert.equal(def.height, undefined);

  const sized = m.build({ ...base, resolution: "2K" });
  // aspect_ratio 与 width/height 不能同时传（官方文档：aspect_ratio 优先，会覆盖宽高）
  assert.equal(sized.aspect_ratio, undefined);
  assert.equal(sized.width, 2048);
  assert.equal(sized.height, 1152);
});

test("豆包 Seedream：档位 × 比例 → 具体宽高", () => {
  const m = PROFILES.ark.modes[0];
  const base = { model: "doubao-seedream-4-0-250828", prompt: "cat", aspect: "1:1", n: 1, responseFormat: "url" };

  assert.equal(m.build({ ...base, resolution: "" }).size, "2048x2048"); // 厂商默认
  assert.equal(m.build({ ...base, resolution: "1K" }).size, "1024x1024");
  assert.equal(m.build({ ...base, resolution: "4K" }).size, "4096x4096");

  const wide = m.build({ ...base, aspect: "16:9", resolution: "2K" });
  assert.equal(wide.size, "2848x1600");
});

test("Seedream 换算表：比例不在表内时回落到档位字符串", () => {
  assert.equal(seedreamSize("1:1", "2K"), "2048x2048");
  assert.equal(seedreamSize("5:7", "2K"), "2K");
  assert.equal(seedreamSize("1:1", ""), "2048x2048");
});

test("Imagen：清晰度写入 parameters.sampleImageSize", () => {
  const m = PROFILES.gemini.modes[0];
  const base = { model: "imagen-3.0-generate-002", prompt: "cat", aspect: "1:1", n: 1 };
  assert.equal(m.build({ ...base, resolution: "" }).parameters.sampleImageSize, undefined);
  assert.equal(m.build({ ...base, resolution: "2K" }).parameters.sampleImageSize, "2K");
});

test("只有声明了 resolutions 的厂商才暴露清晰度能力", () => {
  const withRes = ["minimax", "ark", "gemini"];
  for (const [id, p] of Object.entries(PROFILES)) {
    const m = p.modes[0];
    const expect = withRes.includes(id);
    assert.equal(!!m.supports?.resolution, expect, `${id} 的清晰度能力标记不对`);
    if (expect) assert.ok((m.resolutions || []).length, `${id} 缺少 resolutions 列表`);
  }
});
