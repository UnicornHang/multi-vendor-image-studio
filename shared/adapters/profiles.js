import { resolvePath } from "./resolvePath.js";

/**
 * 通用适配层：厂商 profile → 模式 mode → 端点 / 鉴权 / 请求体 / 响应取值
 *
 * ⚠ 这是前后端共用的唯一来源：
 *   - 后端 server/src/adapters/profiles.js 直接 re-export
 *   - 前端 web/src/data/profiles.js 也直接 import（用于渲染表单）
 *   所以后端没启动时，前端照样能列出厂商、渲染参数控件。
 *
 * 新增厂商只需在此注册一个 profile：
 *   defaults      —— base/path/auth/model 等默认值
 *   aspectOptions —— 比例选项 [[值, 文案], ...]
 *   supports      —— 决定前端显示哪些参数控件
 *   build(ctx)    —— 返回请求体
 *   extract(json, ctx) —— 返回图片数组 [{ src, type }]
 */

/** 各厂商可用的画面比例 */
export const ASPECTS = {
  minimax: [
    ["1:1", "1:1"], ["16:9", "16:9"], ["4:3", "4:3"], ["3:2", "3:2"],
    ["2:3", "2:3"], ["3:4", "3:4"], ["9:16", "9:16"], ["21:9", "21:9"]
  ],
  openai: [
    ["1:1 · 1024×1024", "1024x1024"], ["横图 3:2 · 1536×1024", "1536x1024"],
    ["竖图 2:3 · 1024×1536", "1024x1536"], ["自动", "auto"]
  ],
  seedream: [
    ["1:1", "1:1"], ["4:3", "4:3"], ["3:4", "3:4"], ["16:9", "16:9"],
    ["9:16", "9:16"], ["3:2", "3:2"], ["2:3", "2:3"], ["21:9", "21:9"]
  ],
  siliconflow: [
    ["1:1 · 1024×1024", "1024x1024"], ["1:1 · 768×768", "768x768"],
    ["1:1 · 512×512", "512x512"], ["横图 · 1024×768", "1024x768"],
    ["竖图 · 768×1024", "768x1024"]
  ],
  cogview: [
    ["1:1 · 1024×1024", "1024x1024"], ["竖图 2:3 · 1024×1792", "1024x1792"],
    ["横图 3:2 · 1792×1024", "1792x1024"]
  ],
  wanx: [
    ["1:1 · 1024×1024", "1024*1024"], ["竖图 2:3 · 1024×1792", "1024*1792"],
    ["横图 3:2 · 1792×1024", "1792*1024"]
  ],
  stability: [
    ["1:1", "1:1"], ["3:2", "3:2"], ["2:3", "2:3"], ["16:9", "16:9"], ["21:9", "21:9"]
  ],
  geminiImagen: [
    ["1:1", "1:1"], ["3:4", "3:4"], ["4:3", "4:3"], ["9:16", "9:16"], ["16:9", "16:9"]
  ],
  geminiImage: [
    ["1:1", "1:1"], ["2:3", "2:3"], ["3:2", "3:2"], ["3:4", "3:4"], ["4:3", "4:3"],
    ["4:5", "4:5"], ["5:4", "5:4"], ["9:16", "9:16"], ["16:9", "16:9"], ["21:9", "21:9"]
  ]
};

/* ---------- 清晰度（分辨率档位） ---------- */

/**
 * 档位 → 长边像素。"1K"→1024、"1.5K"→1536、"2K"→2048
 */
export function tierToLongSide(tier) {
  const m = String(tier || "").match(/^([\d.]+)\s*[kK]$/);
  if (!m) return 0;
  return Math.round(parseFloat(m[1]) * 1024);
}

/**
 * 比例 + 长边 → 宽高。
 * MiniMax 的 width/height 约束：范围 [512, 2048]、必须是 8 的倍数、需成对设置。
 */
export function ratioToSize(ratio, longSide) {
  const m = String(ratio || "").match(/^(\d+)\s*:\s*(\d+)$/);
  if (!m || !longSide) return null;
  const r = Number(m[1]) / Number(m[2]);
  let w = r >= 1 ? longSide : Math.round((longSide * r) / 8) * 8;
  let h = r >= 1 ? Math.round((longSide / r) / 8) * 8 : longSide;
  w = Math.min(2048, Math.max(512, w));
  h = Math.min(2048, Math.max(512, h));
  return { width: w, height: h };
}

/** 豆包 Seedream：档位 × 比例 → 具体宽高（官方对照表） */
const SEEDREAM_SIZE = {
  "1K": {
    "1:1": "1024x1024", "4:3": "1152x864", "3:4": "864x1152",
    "16:9": "1280x720", "9:16": "720x1280", "3:2": "1248x832",
    "2:3": "832x1248", "21:9": "1512x648"
  },
  "2K": {
    "1:1": "2048x2048", "4:3": "2304x1728", "3:4": "1728x2304",
    "16:9": "2848x1600", "9:16": "1600x2848", "3:2": "2496x1664",
    "2:3": "1664x2496", "21:9": "3136x1344"
  },
  "4K": {
    "1:1": "4096x4096", "4:3": "4704x3520", "3:4": "3520x4704",
    "16:9": "5504x3040", "9:16": "3040x5504", "3:2": "4992x3328",
    "2:3": "3328x4992", "21:9": "6240x2656"
  }
};

/**
 * Seedream 的 size：档位 × 比例 → 宽高。
 * 比例不在表里时直接回落到档位字符串（Ark 也接受 "2K" 这种写法）。
 */
export function seedreamSize(ratio, tier) {
  const t = tier || "2K"; // Ark 默认 2048x2048
  const table = SEEDREAM_SIZE[t];
  if (!table) return t;
  return table[ratio] || t;
}

/* ---------- OpenAI 兼容协议：多个厂商共用同一套 build / extract ---------- */
function openaiCompatibleBuild(ctx) {
  const b = { model: ctx.model, prompt: ctx.prompt, n: ctx.n };
  if (ctx.aspect && ctx.aspect !== "auto") b.size = ctx.aspect;
  if (ctx.quality) b.quality = ctx.quality;
  // gpt-image-1 只返回 b64_json，不接受 response_format 字段
  if (!/^gpt-image/i.test(ctx.model)) b.response_format = ctx.responseFormat;
  if (ctx.seed !== null && ctx.seed !== undefined && ctx.seed !== "") b.seed = Number(ctx.seed);
  return b;
}

function openaiCompatibleExtract(json) {
  const out = [];
  (json?.data || []).forEach((d) => {
    if (d?.url) out.push({ src: d.url, type: "url" });
    else if (d?.b64_json) out.push({ src: "data:image/png;base64," + d.b64_json, type: "base64" });
  });
  return out;
}

/** OpenAI 兼容模式的公共字段 */
const OPENAI_COMPAT = {
  responseFormats: [["b64_json", "b64_json（内嵌数据）"], ["url", "url（图片直链）"]],
  qualities: [
    ["low", "low"], ["medium", "medium"], ["high", "high"],
    ["standard", "standard（DALL·E 3）"], ["hd", "hd（DALL·E 3）"]
  ],
  negativeModes: [["inline", "拼接到提示词末尾"], ["off", "不使用"]],
  supports: { quality: true, seed: true, optimizer: false, responseFormat: true, reference: false },
  build: openaiCompatibleBuild,
  extract: openaiCompatibleExtract
};

export const PROFILES = {
  minimax: {
    label: "MiniMax",
    note: "端点 <code>POST {base}/v1/image_generation</code>；响应图片位于 <code>data.image_urls[]</code>（base64 模式下为 <code>data.images[]</code>）。",
    modes: [{
      id: "image_generation",
      label: "image-01 / image-01-live",
      defaults: {
        baseUrl: "https://api.minimaxi.com", path: "/v1/image_generation",
        authHeader: "Authorization", authPrefix: "Bearer ", model: "image-01",
        aspect: "1:1", responseFormat: "url", optimizer: true
      },
      models: ["image-01", "image-01-live"],
      aspectOptions: ASPECTS.minimax,
      aspectLabel: "画面比例 aspect_ratio",
      /* 清晰度档位：换算成 width/height（image-01 支持，宽高范围 512–2048 且为 8 的倍数） */
      resolutions: [["1K", "1K"], ["1.5K", "1.5K"], ["2K", "2K"]],
      resolutionNote: "换算为 width/height（512–2048、8 的倍数）；image-01-live 忽略宽高",
      responseFormats: [["url", "url（图片直链）"], ["base64", "base64（内嵌数据）"]],
      qualities: [],
      negativeModes: [
        ["inline", "拼接到提示词末尾（兼容性最好）"],
        ["field", "以 negative_prompt 字段发送"],
        ["off", "不使用"]
      ],
      supports: { quality: false, seed: true, optimizer: true, responseFormat: true, reference: true, refType: "minimax", resolution: true },
      build(ctx) {
        const b = {
          model: ctx.model,
          prompt: ctx.prompt,
          response_format: ctx.responseFormat,
          n: ctx.n,
          prompt_optimizer: !!ctx.optimizer
        };
        // width/height 与 aspect_ratio 不能同时传：官方文档说明 aspect_ratio 优先级更高，会覆盖宽高
        const wh = ctx.resolution ? ratioToSize(ctx.aspect, tierToLongSide(ctx.resolution)) : null;
        if (wh) {
          b.width = wh.width;
          b.height = wh.height;
        } else {
          b.aspect_ratio = ctx.aspect;
        }
        if (ctx.seed !== null && ctx.seed !== undefined && ctx.seed !== "") b.seed = Number(ctx.seed);
        if (ctx.negative) b.negative_prompt = ctx.negative;
        if (ctx.ref) b.subject_reference = [{ type: ctx.ref.type, image_file: ctx.ref.base64 }];
        return b;
      },
      extract(json) {
        const out = [];
        const urls = json?.data?.image_urls || [];
        urls.forEach((u) => out.push({ src: u, type: "url" }));
        const b64 = json?.data?.images || [];
        b64.forEach((b) => out.push({
          src: String(b).startsWith("data:") ? b : "data:image/png;base64," + b,
          type: "base64"
        }));
        return out;
      }
    }]
  },

  openai: {
    label: "OpenAI 兼容",
    note: "端点 <code>POST {base}/v1/images/generations</code>，兼容 gpt-image-1 / DALL·E 3 及各类聚合网关；响应位于 <code>data[].url</code> 或 <code>data[].b64_json</code>。",
    modes: [{
      id: "images_generations",
      label: "/v1/images/generations",
      defaults: {
        baseUrl: "https://api.openai.com", path: "/v1/images/generations",
        authHeader: "Authorization", authPrefix: "Bearer ", model: "gpt-image-1",
        aspect: "1024x1024", responseFormat: "b64_json", optimizer: false
      },
      models: ["gpt-image-1", "dall-e-3", "dall-e-2"],
      aspectOptions: ASPECTS.openai,
      aspectLabel: "画面尺寸 size",
      responseFormats: OPENAI_COMPAT.responseFormats,
      qualities: OPENAI_COMPAT.qualities,
      negativeModes: OPENAI_COMPAT.negativeModes,
      supports: OPENAI_COMPAT.supports,
      /* 模型级能力：同一厂商下不同模型支持的尺寸/质量并不一样 */
      modelCaps: {
        "gpt-image-1": {
          qualities: [["low", "low"], ["medium", "medium"], ["high", "high"]]
        },
        "dall-e-3": {
          qualities: [["standard", "standard"], ["hd", "hd"]],
          aspectOptions: [
            ["1:1 · 1024×1024", "1024x1024"],
            ["横图 3:2 · 1792×1024", "1792x1024"],
            ["竖图 2:3 · 1024×1792", "1024x1792"],
            ["自动", "auto"]
          ]
        },
        "dall-e-2": {
          aspectOptions: [
            ["1:1 · 1024×1024", "1024x1024"],
            ["横图 3:2 · 1792×1024", "1792x1024"],
            ["竖图 2:3 · 1024×1792", "1024x1792"]
          ]
        }
      },
      build: OPENAI_COMPAT.build,
      extract: OPENAI_COMPAT.extract
    }]
  },

  ark: {
    label: "火山方舟（豆包 Seedream）",
    note: "端点 <code>POST {base}/images/generations</code>，与 OpenAI 图像接口同构；响应位于 <code>data[].url</code>。模型名形如 <code>doubao-seedream-3-0-t2i-250415</code>。",
    modes: [{
      id: "images_generations",
      label: "/api/v3/images/generations",
      defaults: {
        baseUrl: "https://ark.cn-beijing.volces.com/api/v3", path: "/images/generations",
        authHeader: "Authorization", authPrefix: "Bearer ", model: "doubao-seedream-3-0-t2i-250415",
        aspect: "1024x1024", responseFormat: "url", optimizer: false
      },
      models: ["doubao-seedream-3-0-t2i-250415", "doubao-seedream-4-0-250828"],
      aspectOptions: ASPECTS.seedream,
      aspectLabel: "画面比例",
      /* Seedream 的 size 支持分辨率档位（1K/2K/4K），或直接给宽高 */
      resolutions: [["1K", "1K"], ["2K", "2K"], ["4K", "4K"]],
      resolutionNote: "按「档位 × 比例」换算成具体宽高",
      responseFormats: OPENAI_COMPAT.responseFormats,
      qualities: OPENAI_COMPAT.qualities,
      negativeModes: OPENAI_COMPAT.negativeModes,
      supports: { ...OPENAI_COMPAT.supports, resolution: true },
      build(ctx) {
        const b = { model: ctx.model, prompt: ctx.prompt, n: ctx.n, response_format: ctx.responseFormat };
        // size 传具体宽高（档位 × 比例换算），两者不能混用
        b.size = ctx.resolution ? seedreamSize(ctx.aspect, ctx.resolution) : seedreamSize(ctx.aspect, "2K");
        if (ctx.quality) b.quality = ctx.quality;
        if (ctx.seed !== null && ctx.seed !== undefined && ctx.seed !== "") b.seed = Number(ctx.seed);
        return b;
      },
      extract: OPENAI_COMPAT.extract
    }]
  },

  siliconflow: {
    label: "SiliconFlow 硅基流动",
    note: "端点 <code>POST {base}/images/generations</code>，OpenAI 同构；模型如 <code>Kwai-Kolors/Kolors</code>、<code>black-forest-labs/FLUX.1-schnell</code>。",
    modes: [{
      id: "images_generations",
      label: "/v1/images/generations",
      defaults: {
        baseUrl: "https://api.siliconflow.cn/v1", path: "/images/generations",
        authHeader: "Authorization", authPrefix: "Bearer ", model: "Kwai-Kolors/Kolors",
        aspect: "1024x1024", responseFormat: "url", optimizer: false
      },
      models: ["Kwai-Kolors/Kolors", "black-forest-labs/FLUX.1-schnell"],
      aspectOptions: ASPECTS.siliconflow,
      aspectLabel: "画面尺寸 size",
      responseFormats: OPENAI_COMPAT.responseFormats,
      qualities: OPENAI_COMPAT.qualities,
      negativeModes: OPENAI_COMPAT.negativeModes,
      supports: OPENAI_COMPAT.supports,
      build: OPENAI_COMPAT.build,
      extract: OPENAI_COMPAT.extract
    }]
  },

  zhipu: {
    label: "智谱 CogView",
    note: "端点 <code>POST {base}/images/generations</code>，OpenAI 同构；模型如 <code>cogview-3-flash</code>、<code>cogview-4</code>。",
    modes: [{
      id: "images_generations",
      label: "/api/paas/v4/images/generations",
      defaults: {
        baseUrl: "https://open.bigmodel.cn/api/paas/v4", path: "/images/generations",
        authHeader: "Authorization", authPrefix: "Bearer ", model: "cogview-3-flash",
        aspect: "1024x1024", responseFormat: "url", optimizer: false
      },
      models: ["cogview-3-flash", "cogview-4"],
      aspectOptions: ASPECTS.cogview,
      aspectLabel: "画面尺寸 size",
      responseFormats: OPENAI_COMPAT.responseFormats,
      qualities: OPENAI_COMPAT.qualities,
      negativeModes: OPENAI_COMPAT.negativeModes,
      supports: OPENAI_COMPAT.supports,
      build: OPENAI_COMPAT.build,
      extract: OPENAI_COMPAT.extract
    }]
  },

  dashscope: {
    label: "阿里百炼（通义万相）",
    note: "端点 <code>POST {base}/services/aigc/text2image/image-synthesis</code>；尺寸形如 <code>1024*1024</code>，负向提示词走 <code>parameters.negative_prompt</code>；响应位于 <code>output.results[].url</code>。",
    modes: [{
      id: "image_synthesis",
      label: "image-synthesis",
      defaults: {
        baseUrl: "https://dashscope.aliyuncs.com/api/v1", path: "/services/aigc/text2image/image-synthesis",
        authHeader: "Authorization", authPrefix: "Bearer ", model: "wanx-v1",
        aspect: "1024*1024", responseFormat: "url", optimizer: false
      },
      models: ["wanx-v1", "wanx2.1-t2i-turbo", "wanx2.1-t2i-plus"],
      aspectOptions: ASPECTS.wanx,
      aspectLabel: "画面尺寸 size",
      responseFormats: [["url", "url（图片直链）"]],
      qualities: [],
      negativeModes: [
        ["field", "写入 parameters.negative_prompt（原生支持）"],
        ["inline", "拼接到提示词末尾"],
        ["off", "不使用"]
      ],
      supports: { quality: false, seed: true, optimizer: false, responseFormat: false, reference: false },
      build(ctx) {
        const params = { size: ctx.aspect, n: ctx.n };
        if (ctx.seed !== null && ctx.seed !== undefined && ctx.seed !== "") params.seed = Number(ctx.seed);
        if (ctx.negative) params.negative_prompt = ctx.negative;
        return { model: ctx.model, input: { prompt: ctx.prompt }, parameters: params };
      },
      extract(json) {
        const out = [];
        (json?.output?.results || []).forEach((r) => {
          if (r?.url) out.push({ src: r.url, type: "url" });
        });
        return out;
      }
    }]
  },

  stability: {
    label: "Stability AI",
    note: "端点 <code>POST {base}/v2beta/stable-image/generate/{engine}</code>（<code>{model}</code> 填引擎名，如 <code>stable-image-core</code>）；比例用 <code>aspect_ratio</code>；图片为 base64，放在 <code>image</code> 字段。",
    modes: [{
      id: "stable_image",
      label: "stable-image / sd3.5",
      defaults: {
        baseUrl: "https://api.stability.ai", path: "/v2beta/stable-image/generate/{model}",
        authHeader: "Authorization", authPrefix: "Bearer ", model: "stable-image-core",
        aspect: "1:1", responseFormat: "base64", optimizer: false
      },
      models: ["stable-image-core", "stable-image-ultra", "sd3.5-large"],
      aspectOptions: ASPECTS.stability,
      aspectLabel: "画面比例 aspect_ratio",
      responseFormats: [["base64", "base64（内嵌数据）"]],
      qualities: [],
      negativeModes: [
        ["field", "写入 negative_prompt（原生支持）"],
        ["inline", "拼接到提示词末尾"],
        ["off", "不使用"]
      ],
      supports: { quality: false, seed: true, optimizer: false, responseFormat: false, reference: false },
      build(ctx) {
        const b = { prompt: ctx.prompt, aspect_ratio: ctx.aspect, output_format: "png" };
        if (ctx.seed !== null && ctx.seed !== undefined && ctx.seed !== "") b.seed = Number(ctx.seed);
        if (ctx.negative) b.negative_prompt = ctx.negative;
        return b;
      },
      extract(json) {
        const out = [];
        if (json?.image) {
          const mime = json.output_format === "jpeg" ? "image/jpeg" : "image/png";
          out.push({ src: `data:${mime};base64,${json.image}`, type: "base64" });
        }
        return out;
      }
    }]
  },

  gemini: {
    label: "Google Gemini / Imagen",
    note: "鉴权走 <code>x-goog-api-key</code> 头。Imagen 走 <code>:predict</code>，Gemini 图像模型走 <code>:generateContent</code>。",
    modes: [{
      id: "imagen",
      label: "Imagen（:predict）",
      defaults: {
        baseUrl: "https://generativelanguage.googleapis.com",
        path: "/v1beta/models/{model}:predict",
        authHeader: "x-goog-api-key", authPrefix: "",
        model: "imagen-3.0-generate-002", aspect: "1:1", responseFormat: "", optimizer: false
      },
      models: ["imagen-3.0-generate-002", "imagen-3.0-capability-001"],
      aspectOptions: ASPECTS.geminiImagen,
      aspectLabel: "画面比例 aspectRatio",
      /* Imagen 3 支持 1K / 2K 两档 */
      resolutions: [["1K", "1K"], ["2K", "2K"]],
      resolutionNote: "写入 parameters.sampleImageSize",
      responseFormats: [],
      qualities: [],
      negativeModes: [
        ["field", "parameters.negativePrompt（原生支持）"],
        ["inline", "拼接到提示词末尾"],
        ["off", "不使用"]
      ],
      supports: { quality: false, seed: false, optimizer: false, responseFormat: false, reference: false, resolution: true },
      build(ctx) {
        const p = { sampleCount: ctx.n, aspectRatio: ctx.aspect };
        if (ctx.resolution) p.sampleImageSize = ctx.resolution;
        if (ctx.negative) p.negativePrompt = ctx.negative;
        return { instances: [{ prompt: ctx.prompt }], parameters: p };
      },
      extract(json) {
        const out = [];
        (json?.predictions || []).forEach((p) => {
          if (p?.bytesBase64Encoded) {
            out.push({ src: `data:${p.mimeType || "image/png"};base64,${p.bytesBase64Encoded}`, type: "base64" });
          } else if (p?.url) {
            out.push({ src: p.url, type: "url" });
          }
        });
        return out;
      }
    }, {
      id: "gemini-image",
      label: "Gemini 图像模型（:generateContent）",
      defaults: {
        baseUrl: "https://generativelanguage.googleapis.com",
        path: "/v1beta/models/{model}:generateContent",
        authHeader: "x-goog-api-key", authPrefix: "",
        model: "gemini-2.5-flash-image", aspect: "1:1", responseFormat: "", optimizer: false
      },
      models: ["gemini-2.5-flash-image", "gemini-3-pro-image-preview"],
      aspectOptions: ASPECTS.geminiImage,
      aspectLabel: "画面比例 aspectRatio",
      responseFormats: [],
      qualities: [],
      negativeModes: [["inline", "拼接到提示词末尾"], ["off", "不使用"]],
      supports: { quality: false, seed: false, optimizer: false, responseFormat: false, reference: false },
      build(ctx) {
        const gc = { responseModalities: ["IMAGE"] };
        if (ctx.aspect) gc.imageConfig = { aspectRatio: ctx.aspect };
        return { contents: [{ role: "user", parts: [{ text: ctx.prompt }] }], generationConfig: gc };
      },
      extract(json) {
        const out = [];
        (json?.candidates || []).forEach((c) => (c?.content?.parts || []).forEach((p) => {
          if (p?.inlineData?.data) {
            out.push({
              src: `data:${p.inlineData.mimeType || "image/png"};base64,${p.inlineData.data}`,
              type: "base64"
            });
          }
        }));
        return out;
      }
    }]
  },

  custom: {
    label: "自定义（模板）",
    note: "用模板对接任意厂商。请求体占位符：<code>{{model}} {{prompt}} {{negative}} {{aspect}} {{n}} {{seed}} {{quality}} {{refBase64}}</code>；响应路径支持 <code>a.b[]</code> 与 <code>a[].b</code>。",
    modes: [{
      id: "custom",
      label: "自定义模板",
      defaults: {
        baseUrl: "https://api.example.com", path: "/v1/images/generations",
        authHeader: "Authorization", authPrefix: "Bearer ",
        model: "", aspect: "1:1", responseFormat: "", optimizer: false,
        bodyTemplate: '{\n  "model": "{{model}}",\n  "prompt": "{{prompt}}",\n  "size": "{{aspect}}",\n  "n": {{n}}\n}',
        respPath: "data[].url"
      },
      models: [],
      aspectOptions: ASPECTS.minimax,
      aspectLabel: "比例（写入 {{aspect}}）",
      responseFormats: [],
      qualities: [],
      negativeModes: [
        ["field", "写入 {{negative}}"],
        ["inline", "拼接到提示词末尾"],
        ["off", "不使用"]
      ],
      supports: { quality: true, seed: true, optimizer: true, responseFormat: true, reference: true, refType: "custom" },
      build(ctx) {
        const vars = {
          model: ctx.model,
          prompt: ctx.prompt,
          negative: ctx.negative || "",
          aspect: ctx.aspect,
          n: ctx.n,
          seed: ctx.seed === null || ctx.seed === undefined || ctx.seed === "" ? "" : ctx.seed,
          quality: ctx.quality || "",
          refBase64: ctx.ref ? ctx.ref.base64 : ""
        };
        let tpl = ctx.bodyTemplate || "{}";
        for (const [k, v] of Object.entries(vars)) {
          tpl = tpl.split(`{{${k}}}`).join(String(v));
        }
        try {
          return JSON.parse(tpl);
        } catch (e) {
          throw new Error("请求体模板解析失败：" + e.message);
        }
      },
      extract(json, ctx) {
        const vals = resolvePath(json, ctx?.respPath || "data[].url");
        const out = [];
        vals.forEach((v) => {
          if (typeof v === "string") {
            out.push(v.startsWith("data:") ? { src: v, type: "base64" } : { src: v, type: "url" });
          } else if (v && typeof v === "object") {
            if (v.url) out.push({ src: v.url, type: "url" });
            else if (v.b64_json) out.push({ src: "data:image/png;base64," + v.b64_json, type: "base64" });
            else if (v.bytesBase64Encoded) {
              out.push({ src: `data:${v.mimeType || "image/png"};base64,${v.bytesBase64Encoded}`, type: "base64" });
            } else if (v.image_url?.url) out.push({ src: v.image_url.url, type: "url" });
          }
        });
        return out;
      }
    }]
  }
};

export { resolvePath };
