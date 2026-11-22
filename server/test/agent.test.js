/**
 * AI Agent（漫画助手）测试：JSON 解析 / 参数归一化 / 四项能力端到端（mock 文本模型）。
 * 运行：npm test --prefix server
 */
import test from "node:test";
import assert from "node:assert/strict";

import { createApp } from "../src/app.js";
import { extractJson, chat } from "../src/services/llm.js";
import { normalizeParams, normalizePrompt, buildConstraints } from "../src/services/agent.js";
import { PROFILES } from "../src/adapters/profiles.js";

/* ---------- 纯函数部分 ---------- */

test("extractJson：剥代码围栏、跳过字符串里的括号", () => {
  assert.deepEqual(extractJson('{"a":1}'), { a: 1 });
  assert.deepEqual(extractJson('```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(extractJson('好的，结果如下：{"a":1} 完毕'), { a: 1 });
  // 字符串里的 } 不应该提前截断
  assert.deepEqual(extractJson('{"a":"含有 } 的文本","b":{"c":2}}'), { a: "含有 } 的文本", b: { c: 2 } });
});

test("normalizePrompt：补齐缺键并去空白", () => {
  const p = normalizePrompt({ main: "  一只猫  " });
  assert.equal(p.main, "一只猫");
  assert.equal(p.style, "");
  assert.equal(p.negative, "");
  assert.deepEqual(Object.keys(p), ["main", "style", "detail", "light", "cam", "negative"]);
});

test("normalizeParams：取值必须落在当前厂商允许的范围里", () => {
  const minimax = PROFILES.minimax.modes[0];

  // 比例命中 → 原样保留
  const a = normalizeParams({ aspect: "9:16", quality: "high", n: 3 }, minimax, "image-01");
  assert.equal(a.aspect, "9:16");
  assert.equal(a.n, 3);
  // MiniMax 不支持 quality → 这个键不应该出现
  assert.equal("quality" in a, false);

  // 比例不在允许集合里 → 取最接近的一项，而不是塞一个上游不认的值
  const openai = PROFILES.openai.modes[0];
  const b = normalizeParams({ aspect: "16:9" }, openai, "gpt-image-1");
  assert.equal(b.aspect, "1536x1024");

  // 尺寸与比例等价时能对上（1024x1536 ≡ 2:3）
  const c = normalizeParams({ aspect: "2:3" }, openai, "gpt-image-1");
  assert.equal(c.aspect, "1024x1536");

  // 没有等价项时取最接近的比例：9:16 落到竖图 1024x1536（2:3），而不是回到 1:1
  const f = normalizeParams({ aspect: "9:16" }, openai, "gpt-image-1");
  assert.equal(f.aspect, "1024x1536");

  // n 越界收敛
  const d = normalizeParams({ n: 99 }, minimax, "image-01");
  assert.equal(d.n, 9);
  const e = normalizeParams({ n: 0 }, minimax, "image-01");
  assert.equal(e.n, 1);

  // 模型没说的东西不该覆盖用户已有的选择
  const g = normalizeParams({}, minimax, "image-01", { aspect: "21:9", n: 4, optimizer: true });
  assert.equal(g.aspect, "21:9");
  assert.equal(g.n, 4);
  assert.equal(g.optimizer, true);

  // 模型给了就以模型为准
  const h = normalizeParams({ aspect: "9:16", n: 1 }, minimax, "image-01", { aspect: "21:9", n: 4 });
  assert.equal(h.aspect, "9:16");
  assert.equal(h.n, 1);
});

test("normalizeParams：模型级能力覆盖（dall-e-3 没有 1536x1024）", () => {
  const openai = PROFILES.openai.modes[0];
  const caps = buildConstraints(openai, "dall-e-3");
  assert.ok(!caps.aspect.includes("1536x1024"));
  assert.ok(caps.aspect.includes("1792x1024"));
});

/* ---------- 端到端（mock 文本模型） ---------- */

/** 起一个服务，并把 fetch 换成假的 chat/completions */
async function withMockAgent(reply, fn) {
  const app = createApp();
  const server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  const base = `http://127.0.0.1:${server.address().port}`;

  const origFetch = globalThis.fetch;
  let seen = null;
  globalThis.fetch = async (url, opts) => {
    if (String(url).includes("/chat/completions")) {
      seen = { url: String(url), body: JSON.parse(opts.body) };
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: typeof reply === "function" ? reply(seen) : reply } }],
          usage: { total_tokens: 42 }
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }
    return origFetch(url, opts);
  };

  try {
    return await fn(base, () => seen);
  } finally {
    globalThis.fetch = origFetch;
    await new Promise((r) => server.close(r));
  }
}

const CFG = { baseUrl: "https://mock.local", apiKey: "sk-test", model: "test-model" };

test("/api/agent/fill：把一句描述补全成表单", async () => {
  const reply = JSON.stringify({
    notes: "补了雨夜霓虹的背景",
    prompt: {
      main: "一只戴眼镜的猫在暴雨天台上修收音机",
      style: "赛博朋克漫画风",
      detail: "积水、霓虹倒影",
      light: "冷蓝主调",
      cam: "低机位仰拍",
      negative: "文字水印"
    },
    params: { aspect: "9:16", quality: "high", n: 2, seed: 123, optimizer: true }
  });

  await withMockAgent(reply, async (base) => {
    const res = await fetch(base + "/api/agent/fill", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        brief: "猫修收音机",
        provider: "minimax",
        mode: "image_generation",
        model: "image-01",
        styleKey: "cyber-comic",
        config: CFG
      })
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.ok, true);
    assert.equal(data.prompt.main, "一只戴眼镜的猫在暴雨天台上修收音机");
    assert.equal(data.prompt.style, "赛博朋克漫画风");
    // 预设画风的负向词会并进负向提示词
    assert.ok(data.prompt.negative.includes("文字水印"));
    assert.ok(data.prompt.negative.includes("田园"));
    // 参数被收敛到 MiniMax 支持的范围
    assert.equal(data.params.aspect, "9:16");
    assert.equal(data.params.n, 2);
    assert.equal(data.params.seed, 123);
    assert.equal(data.params.optimizer, true);
    assert.equal("quality" in data.params, false);
  });
});

test("/api/agent/storyboard：拆成分镜并归一化比例", async () => {
  const reply = JSON.stringify({
    synopsis: "猫在雨夜修收音机",
    panels: [
      {
        index: 1,
        title: "开场",
        shot: "远景",
        description: "雨夜天台全景",
        dialogue: "这台收音机还能修好吗",
        sfx: "哗哗",
        prompt: { main: "雨夜天台上的猫", style: "", detail: "", light: "", cam: "", negative: "" },
        aspect: "16:9"
      },
      {
        index: 2,
        title: "特写",
        shot: "特写",
        description: "猫拧螺丝的特写",
        prompt: { main: "", style: "", detail: "", light: "", cam: "", negative: "" },
        aspect: "9:16"
      }
    ]
  });

  await withMockAgent(reply, async (base) => {
    const res = await fetch(base + "/api/agent/storyboard", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        brief: "猫修收音机",
        provider: "minimax",
        mode: "image_generation",
        model: "image-01",
        panelCount: 2,
        config: CFG
      })
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.panels.length, 2);
    assert.equal(data.panels[0].shot, "远景");
    assert.equal(data.panels[0].dialogue, "这台收音机还能修好吗");
    // 第二格没给 main，用 description 兜底
    assert.equal(data.panels[1].prompt.main, "猫拧螺丝的特写");
    assert.equal(data.panels[1].aspect, "9:16");
  });
});

test("/api/agent/characters/generate + 角色库增删查", async () => {
  const reply = JSON.stringify({
    characters: [
      {
        name: "灰灰",
        role: "主角",
        appearance: "灰色短毛、绿眼睛",
        outfit: "黄色雨衣、圆框眼镜",
        palette: "灰 + 亮黄",
        signature: "总是戴着圆框眼镜",
        promptFragment: "灰色短毛的猫，绿色眼睛，戴圆框眼镜，穿明黄色雨衣"
      }
    ]
  });

  await withMockAgent(reply, async (base) => {
    const gen = await fetch(base + "/api/agent/characters/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ brief: "一只猫", styleKey: "jp-cel", config: CFG })
    });
    assert.equal(gen.status, 200);
    const g = await gen.json();
    assert.equal(g.characters.length, 1);
    assert.equal(g.characters[0].name, "灰灰");

    // 存入角色库（角色库是落盘的，断言用相对数量，不依赖已有数据）
    const before = await (await fetch(base + "/api/agent/characters")).json();
    const saved = await fetch(base + "/api/agent/characters", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(g.characters[0])
    });
    const s = await saved.json();
    assert.equal(s.ok, true);
    const id = s.item.id;

    const list = await fetch(base + "/api/agent/characters");
    const l = await list.json();
    assert.equal(l.items.length, before.items.length + 1);
    assert.ok(l.items.some((c) => c.id === id));

    const del = await fetch(base + "/api/agent/characters/" + id, { method: "DELETE" });
    const d = await del.json();
    assert.equal(d.items.length, before.items.length);
  });
});

test("/api/agent/refine：带图复盘并给出改一版提示词", async () => {
  const reply = JSON.stringify({
    critique: "角色发型和设定对不上",
    issues: ["猫没有戴眼镜", "背景出现了文字"],
    notes: "补上眼镜并清掉文字",
    prompt: {
      main: "戴圆框眼镜的猫在雨夜天台修收音机",
      style: "赛博朋克漫画风",
      detail: "",
      light: "",
      cam: "",
      negative: "文字，水印"
    },
    params: { aspect: "9:16", n: 1 }
  });

  await withMockAgent(reply, async (base) => {
    const res = await fetch(base + "/api/agent/refine", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        brief: "猫修收音机",
        provider: "minimax",
        mode: "image_generation",
        model: "image-01",
        current: { prompt: { main: "猫在雨夜天台" }, params: { aspect: "1:1" } },
        images: [{ src: "data:image/png;base64,AAAA", type: "base64" }],
        config: CFG
      })
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.issues.length, 2);
    assert.equal(data.usedImages, 1);
    assert.equal(data.prompt.main, "戴圆框眼镜的猫在雨夜天台修收音机");
    assert.equal(data.params.aspect, "9:16");
  });
});

test("/api/agent/status：如实报告配置状态", async () => {
  await withMockAgent("{}", async (base) => {
    const res = await fetch(base + "/api/agent/status");
    assert.equal(res.status, 200);
    const data = await res.json();
    // configured 取决于本机 .env，这里只校验它是个布尔值
    assert.equal(typeof data.configured, "boolean");
    assert.equal(typeof data.source, "object");
  });
});

test("/api/agent/test：连通性检测打通并回显模型回复", async () => {
  await withMockAgent("正常", async (base) => {
    const res = await fetch(base + "/api/agent/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ config: CFG })
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.ok, true);
    assert.equal(data.model, "test-model");
    assert.equal(data.reply, "正常");
  });
});

test("/api/agent/test：上游报错时如实返回错误", async () => {
  const app = createApp();
  const server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const origFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ error: { message: "invalid api key" } }), {
      status: 401,
      headers: { "Content-Type": "application/json" }
    });
  try {
    const res = await fetch(base + "/api/agent/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ config: CFG })
    });
    assert.equal(res.status, 401);
    const data = await res.json();
    assert.ok(data.error.message.includes("invalid api key"));
  } finally {
    globalThis.fetch = origFetch;
    await new Promise((r) => server.close(r));
  }
});

test("chat：没配置 Agent 模型时给出可读提示", async () => {
  // 直接测客户端，避免依赖本机 .env 里有没有配 AGENT_*
  await assert.rejects(
    () => chat({ config: { baseUrl: "", apiKey: "", model: "" }, system: "s", user: "u" }),
    (err) => err.status === 400 && /未配置/.test(err.message)
  );
  await assert.rejects(
    () => chat({ config: { baseUrl: "https://x.local", apiKey: "", model: "m" }, system: "s", user: "u" }),
    (err) => err.status === 401 && /API Key/.test(err.message)
  );
});

test("/api/agent/fill：模型没返回 JSON 时给出可读错误", async () => {
  await withMockAgent("我不是 JSON", async (base) => {
    const res = await fetch(base + "/api/agent/fill", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        brief: "猫",
        provider: "minimax",
        mode: "image_generation",
        config: CFG
      })
    });
    assert.equal(res.status, 502);
    const data = await res.json();
    assert.ok(data.error.message.includes("JSON"));
  });
});
