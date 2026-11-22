# Image Studio · 多厂商图像生成工作台

**Vue 3 前端 + Node(Express) 后端**。通过内置的通用适配层对接多家图像生成厂商。

```
multi-vendor-image-studio/
├── shared/                 前后端共用
│   ├── adapters/           厂商 profile（build 请求体 / extract 响应）+ 路径解析
│   └── agent/              Agent 字段契约 / 漫画风格预设 / 提示词模板
├── server/                 Node 后端：协议层 + 适配层 + 厂商转发 + 历史存储
│   ├── src/
│   │   ├── adapters/       复用 shared/ + 模型注册表
│   │   ├── routes/         /v1 协议层 · /api 扩展接口 · 模型列表探测 · /api/agent/*
│   │   ├── services/       生成流程、错误归一化、渠道配置、用量统计、历史落盘
│   │   │                   llm.js（文本模型客户端）· agent.js（漫画助手）· characters.js（角色库）
│   │   ├── app.js          Express 应用（与端口解耦，便于测试）
│   │   └── index.js        启动入口
│   ├── channels.example.json  渠道配置样例
│   └── test/               适配层 + 协议层 + 厂商 + Agent 测试（node --test）
├── web/                    Vue 3 + Vite 前端
│   └── src/
│       ├── components/     面板组件（适配器 / 基础生图 / 生图过程 / 结果 / 历史 / 日志）
│       │   └── agent/      AI 漫画助手（面板 / 分镜 / 角色档案 / 复盘）
│       ├── composables/    useStudio.js —— 全局状态与业务逻辑；useAgent.js —— 助手状态
│       ├── data/           复用 shared/ 的厂商元数据
│       ├── utils/          quickConfig.js —— 配置导入解析器
│       └── styles/         全局样式
│   └── test/               配置解析测试（node --test）
├── scripts/dev.js          一键启动前后端
└── legacy/                 原始单文件版本（仅作对照，已不再维护）
```

## 技术栈

| 层 | 选型 |
| --- | --- |
| 前端 | Vue 3（`<script setup>`）+ Vite 6 + **Element Plus 2.14**（暗色主题，CSS 变量按本站配色覆盖）+ `@element-plus/icons-vue` |
| 后端 | Node 18+ / Express 4（ESM），原生 `fetch` 转发上游，无其他运行时依赖 |
| 存储 | 历史记录与用量统计落在 `server/data/*.json`；前端配置存在浏览器 localStorage |

组件库说明：

- 表单控件全部走 Element Plus（`el-select` / `el-input` / `el-input-number` / `el-checkbox` / `el-upload`），只有**折叠卡片**（`UiCard.vue`）和**日志区**是自研样式 —— 这两处组件库没有对应形态。
- 暗色主题通过 `html.dark` + `element-plus/theme-chalk/dark/css-vars.css` 开启，站点配色（主色 `#7c5cff`、成功 `#21d4a4`、危险 `#ff5c7a`、面板 `#151925`）在 `web/src/styles/main.css` 的 `html.dark` 块里覆盖 Element Plus 的 CSS 变量，不需要改组件库源码。
- 图片放大预览用 `el-image` 的 `preview-src-list`（自研的 Lightbox 组件已删除）。
- 提示用 `ElMessage`，二次确认用 `ElMessageBox`。
- 目前是全量引入 Element Plus（构建产物约 340 KB gzip）。若要瘦身，可改用 `unplugin-vue-components` + `ElementPlusResolver` 按需引入。

## 快速开始

```bash
npm run install:all     # 安装 server / web 依赖
npm run dev             # 同时启动后端(8787) 与前端(5173)
```

打开 <http://localhost:5173>。也可以分开启动：

```bash
npm run dev:server      # Node 后端 → http://127.0.0.1:8787
npm run dev:web         # Vite 前端 → http://localhost:5173（/api 自动代理到后端）
```

生产构建（后端会顺带托管 `web/dist`）：

```bash
npm run build && npm start   # → http://127.0.0.1:8787
```

其它命令：

```bash
npm test                # 适配层测试（原 smoke-test.js 的等价物）
```

## 用法

界面是**三栏**结构：

界面分**两种布局**：

**常规菜单（适配器 / Agent 配置 / 历史记录 / 运行日志）—— 左侧菜单 + 内容区**

```
┌──────────┬────────────────────────────────┐
│ 菜单      │ 内容区（当前菜单的内容）           │
│ 适配器    │  · 适配器：只有模型适配相关内容     │
│ Agent配置 │  · Agent 配置：Agent 大脑与角色库  │
│ 历史记录  │  · 历史记录 / 运行日志             │
│ 运行日志  │                                │
│ 基础生图  │                                │
└──────────┴────────────────────────────────┘
```

**「基础生图」—— 左侧菜单 + 中间操作区 + 右侧描述**

```
┌──────────┬───────────────────────────────┬──────────────────┐
│ 菜单      │ 中：生图过程                    │ 右：描述补充        │
│ 适配器    │  · 生图过程（提示词 + 开始生成）   │  基础生图          │
│ 历史记录  │  · 请求概览                      │   生成参数         │
│ 运行日志  │  · 生成结果                     │   画面描述         │
│ 基础生图  │                                │   参考图           │
└──────────┴───────────────────────────────┴──────────────────┘
```

- 只有「基础生图」是三栏，因为只有它需要「一边描述一边生成」的并排工作区。
- 「适配器」菜单里**只有模型适配相关的内容**（厂商 / 模式 / Base URL / 请求路径 / 鉴权头 / API Key / 模型），不放任何无关的东西。
- 「基础生图」把「生成参数 / 画面描述 / 参考图」三块合并成一个可折叠面板（参考图仅在当前厂商支持时出现）。
- 菜单用 URL hash 记录当前位置（`#/base` 等），刷新不丢分区。

操作顺序：

1. 「适配器」里选**厂商**和**模式**，填 **Base URL**、**请求路径**、**鉴权头**、**API Key**、**模型**。
2. 「基础生图」→ 画面描述按栏目填写 → 自动拼成一条 prompt（主体 → 风格 → 场景细节 → 光影色调 → 构图镜头）。
   - 懒得逐栏填？用右栏顶部的 **AI 漫画助手**：写一句「一只猫在暴雨天台修收音机」，点「智能填充表单」，Agent 会把六个栏位和生成参数一次补全（详见 [AI 漫画助手](#ai-漫画助手agent)）。
3. 「基础生图」→ 生成参数按厂商能力自动显隐（比例、quality、seed、prompt_optimizer、response_format、负向提示词策略）。
4. 中间点「开始生成」（或 `Ctrl + Enter`）。结果支持下载 / 复制 / 放大，历史记录由服务端落盘保存。

### 清晰度（分辨率档位）

「生成参数」里有一个**清晰度 resolution** 下拉，只在厂商支持时出现。档位会按各家的规则换算成实际尺寸：

| 厂商 | 档位 | 换算方式 |
| --- | --- | --- |
| MiniMax image-01 | 1K / 1.5K / 2K | 按「比例 + 长边」算出 `width`/`height`（范围 512–2048、8 的倍数）；**选了清晰度就不再发 `aspect_ratio`**（官方文档：两者同时传时 `aspect_ratio` 优先，会覆盖宽高） |
| 火山方舟（豆包 Seedream） | 1K / 2K / 4K | 按官方「档位 × 比例」对照表换算成具体宽高（`size` 字段，档位与宽高不能混用） |
| Google Imagen | 1K / 2K | 写入 `parameters.sampleImageSize` |
| 其他厂商 | — | 不显示（尺寸由「画面比例」决定） |

> MiniMax 的 `width`/`height` 只有 `image-01` 生效，`image-01-live` 会忽略宽高设置。

### 适配器配置

「适配器」页是一张**表单**，按 CC Switch 的思路分成基础与高级两层：

**基础配置**（默认展开）

| 字段 | 说明 |
| --- | --- |
| 厂商 Provider | 选厂商，切换后自动套用该厂商的默认端点与模型 |
| 模式 Mode | 厂商有多个端点时才出现（如 Gemini 的 Imagen / 图像模型） |
| 请求地址 Base URL | 厂商 API 根地址 |
| API Key | 密码输入，可切换明文；留空则用服务端 `.env` 里的密钥 |
| 模型 Model | 下拉可选内置模型，也可「获取模型列表」从厂商拉取，或直接输入 |

**高级选项**（折叠）

| 字段 | 说明 |
| --- | --- |
| 请求路径 Path | 相对 Base URL 的路径，支持 `{model}` 占位符 |
| 鉴权头 / 鉴权前缀 | 如 `Authorization` + `Bearer `，或 `x-api-key` + 无前缀 |
| 所有厂商共用同一个 Key | 关闭后可给当前厂商单独配 Key |
| 端点说明 | 该厂商的请求格式与响应取值路径 |

三个快捷操作：

- **获取模型列表** —— 后端依次尝试 `/v1/models`、`/v1beta/models`、`/models`（带路径前缀和不带前缀各试一遍），把拉到的模型填进「模型」下拉框。
- **导入配置文件** —— 选择一个 JSON 配置文件，解析后**直接填进表单**（界面上一律是表单，不展示 JSON）。认得 Claude Code 的 `settings.json`（`env` 段与 `ANTHROPIC_*` 字段）、CC Switch 与本项目的扁平格式。
- **复制配置** —— 把当前表单内容复制成 JSON，方便备份或贴到别处。

> 导入 Claude Code 的 `settings.json` 时注意：它的 `ANTHROPIC_BASE_URL` 通常指向**对话**端点，而本项目做图像生成。解析器会识别并提示，请在「高级选项」里把请求路径改成对应厂商的图像接口（如 MiniMax 的 `/v1/image_generation`）。

每个厂商的设置**独立保存**，切换厂商不丢配置；也可以勾选「所有厂商共用同一个 Key」。菜单切换不会丢失已填内容（各分区常驻，只做显示切换）。窗口宽度小于 960px 时菜单自动转为顶部横向条，小于 1280px 时右栏落到中栏下方。

## AI 漫画助手（Agent）

「基础生图」右栏顶部有一张 **AI 漫画助手** 卡片：**你只写一句大概的描述，Agent 把它补全成可以直接出图的提示词**，然后照旧走原来的生成流程。

四项能力共用同一句描述和一个「画风」选择：

| 能力 | 做什么 | 产出落到哪 |
| --- | --- | --- |
| **智能填表** | 把「主体 / 风格 / 场景细节 / 光影色调 / 构图镜头 / 负向词」六个栏位一次补全，顺带选好比例、quality、n、seed 等参数 | 直接写进右侧表单，可继续手工改 |
| **分镜拆解** | 把一段描述拆成 N 格连续分镜（每格含画面、景别、台词、拟声词） | 逐格「填入表单」或「填入并生成」 |
| **角色档案** | 从描述里抽出角色卡（外形 / 服装 / 配色 / 标志性特征），存进角色库 | 角色库长期复用，多张图保持同一角色；勾选后会自动带进提示词 |
| **出图复盘** | 把刚生成的图连同提示词一起交给 Agent，指出问题（角色不对 / 构图太空 / 出现文字…） | 「应用修改建议」写回表单，形成 refine 循环 |

### 配置 Agent 的「大脑」

Agent 用的是一个 **OpenAI 兼容的 chat/completions 端点**（DeepSeek / 通义 / 智谱 / OpenAI / 各类聚合网关都能直接用）。配置入口在左侧菜单的 **「Agent 配置」** 页，四块内容：

| 区块 | 内容 |
| --- | --- |
| **Agent 状态** | 是否就绪、配置来源（页面 / 服务端）、当前模型与视觉模型；「**测试连接**」会真发一次最小请求，回显模型回复与耗时 |
| **模型配置** | Base URL、请求路径、API Key、Model、鉴权头、鉴权前缀、视觉模型；「保存配置」后覆盖服务端同名项，「清空页面配置」改回服务端 |
| **角色库** | 已存角色卡的编辑 / 删除 / 「用于当前画面」 |
| **画风预设** | 12 种漫画画风一览（Agent 会按选中的画风补全「风格」栏并合并对应的排除项） |

两种配置方式：

- **服务端**（推荐，Key 不落浏览器）：在 `server/.env` 里设 `AGENT_BASE_URL` / `AGENT_API_KEY` / `AGENT_MODEL`；
- **页面里**：在「Agent 配置」页填（存浏览器 localStorage），会覆盖服务端的同名配置。

「基础生图」页的助手卡片底部有「模型配置 →」直达这个菜单页；未配置时卡片上也会给出同样入口。

`AGENT_VISION_MODEL`（或在配置页填「视觉模型」）可以单独指定一个**支持视觉输入**的模型给「出图复盘」用（留空则复用 `AGENT_MODEL`）。不支持读图的模型只能做文字复盘。

### Agent 不会乱填参数

模型返回的取值会被**强制收敛到当前厂商真正支持的范围内**：

- 比例必须落在该厂商（及该模型）的比例集合里；模型要 `9:16` 而厂商只有 `2:3` 时，会落到最接近的竖图，而不是乱填或退回 1:1；
- 厂商不支持的字段（quality / seed / prompt_optimizer / 清晰度 / 返回格式）**根本不会出现在表单里**；
- `n` 会被夹到厂商允许的上限内，负向词策略只会是 `inline` / `field` / `off`。

这样 Agent 填完的表单就是**可以直接点「开始生成」**的状态，不会因为参数非法被上游拒绝。

### 目录与接口

```
├── shared/agent/            前后端共用：字段契约 / 风格预设 / 提示词模板
├── server/src/services/
│   ├── llm.js               OpenAI 兼容 chat 客户端（含 JSON 解析容错）
│   ├── agent.js             四项能力的编排 + 参数归一化
│   └── characters.js        角色卡落盘（server/data/characters.json）
├── server/src/routes/agent.js
└── web/src/components/agent/ 助手面板 / 分镜 / 角色档案 / 复盘
```

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/agent/status` | Agent 是否已配置 |
| POST | `/api/agent/test` | 连通性检测（真发一次最小请求） |
| POST | `/api/agent/fill` | 一句描述 → 完整表单 |
| POST | `/api/agent/storyboard` | 一句描述 → N 格分镜 |
| POST | `/api/agent/characters/generate` | 一句描述 → 角色设定 |
| GET / POST | `/api/agent/characters` | 角色卡列表 / 保存 |
| DELETE | `/api/agent/characters/:id` | 删除角色卡 |
| POST | `/api/agent/refine` | 看图复盘 → 改一版的提示词 |

## 与单文件版的主要差异

| | 原单文件版 | 现在 |
| --- | --- | --- |
| 请求发起方 | 浏览器直连厂商（被 CORS 拦截，靠 `proxy.js` 兜底） | 浏览器 → Node 后端 → 厂商，**不再有 CORS 问题** |
| 「代理前缀」 | 页面上要手填 `http://127.0.0.1:8787` | 不需要，后端自带转发 |
| 适配层位置 | 前端 `index.html` 内联 JS | 后端 `server/src/adapters/profiles.js` |
| API Key | 存浏览器 localStorage | 仍可存浏览器；也可只存在服务端 `.env` / `channels.json`（前端留空即可） |
| 历史记录 | 浏览器 localStorage | 服务端 `server/data/history.json`，跨浏览器共享 |
| 提示词预览 | 前端拼 | 前端拼（预览）+ 后端拼（真正发出的那份） |
| 对外协议 | 只有页面内部调用 | **OpenAI 兼容端点** `/v1/images/generations`，任何 OpenAI SDK 可直接调用 |

## 协议层（OpenAI 兼容）

后端同时提供两套入口，**共享同一份适配层与生成流程**：

| 端点 | 用途 |
| --- | --- |
| `POST /v1/images/generations` | OpenAI 兼容的图像生成（对外统一协议） |
| `GET /v1/models` | 跨厂商模型注册表（带能力矩阵） |
| `GET /v1/providers` | 渠道列表与健康状态（不含密钥明文） |
| `GET /v1/usage` | 用量统计（按模型 / 厂商 / 天） |
| `POST /api/generate` | 页面用的扩展端点（参考图、负向提示词策略、附加参数…） |

### 调用示例

```bash
curl http://127.0.0.1:8787/v1/images/generations \
  -H "Content-Type: application/json" \
  -d '{"model":"gpt-image-1","prompt":"a cat in the rain","size":"1024x1024","n":1}'
```

```json
{
  "created": 1735689600,
  "data": [{ "url": "https://..." }],
  "model": "gpt-image-1",
  "provider": "openai",
  "usage": { "images": 1, "requests": 1, "latency_ms": 2140 }
}
```

也能直接用 OpenAI SDK：

```js
import OpenAI from "openai";
const client = new OpenAI({ baseURL: "http://127.0.0.1:8787/v1", apiKey: "unused" });
const { data } = await client.images.generate({ model: "gpt-image-1", prompt: "a cat" });
```

### 参数映射

| 字段 | 说明 |
| --- | --- |
| `model` | 跨厂商模型名，后端按注册表解析到厂商+模式；也可显式传 `provider` / `mode` 覆盖 |
| `prompt` | 字符串，或多模态数组 `[{ type: "text", text: "..." }]` |
| `size` | `1024x1024` 等尺寸；模型不支持该尺寸时按比例换算（`1536x1024` → `3:2`），仍不支持则报 `unsupported_size` |
| `quality` | 按模型能力校验，不支持则报 `unsupported_quality` |
| `response_format` | `url` / `b64_json`；厂商只给直链时，服务端代为转成 base64 |
| `n` / `seed` | 按模型能力上限截断 |
| `reference_image` | 扩展字段：参考图（data URL / base64 / http URL） |
| `reference_type` | 扩展字段：`character` / `general` |
| `negative_prompt` / `negative_mode` | 扩展字段：负向提示词及其处理方式 |
| `extra_body` | 扩展字段：合并进请求体的自定义 JSON |

### 模型注册表与能力矩阵

`GET /v1/models` 聚合所有厂商的模型，每个条目带一份能力矩阵：

```json
{
  "id": "dall-e-3",
  "object": "model",
  "owned_by": "openai",
  "provider": "openai",
  "mode": "images_generations",
  "capabilities": {
    "aspect": ["1024x1024", "1792x1024", "1024x1792", "auto"],
    "quality": ["standard", "hd"],
    "response_format": ["b64_json", "url"],
    "seed": true, "optimizer": false, "reference": false,
    "max_n": 9
  }
}
```

能力是**模型级**的：`dall-e-3` 只支持 `1792×1024` 与 `standard/hd`，`gpt-image-1` 只支持 `1536×1024` 与 `low/medium/high`。页面的下拉框也会随当前模型自动切换选项。

### 错误归一化

上游各家的错误结构统一成 OpenAI 信封，并额外给出 `retryable`，供上层决定重试还是换渠道：

```json
{
  "error": {
    "message": "size \"9999x9999\" 不被该模型支持，可用值：1024x1024, 1536x1024, 1024x1536, auto",
    "type": "invalid_request_error",
    "param": null,
    "code": "unsupported_size"
  }
}
```

| type | 触发条件 | retryable |
| --- | --- | --- |
| `authentication_error` | 401、缺 Key | 否 |
| `permission_error` | 403 | 否 |
| `rate_limit_error` | 429 | 是 |
| `quota_exceeded` | 402、余额/额度不足 | 否 |
| `invalid_request_error` | 400、参数不支持 | 否 |
| `content_policy_violation` | 内容审核拦截 | 否 |
| `timeout` | 504、生成超时 | 是 |
| `upstream_error` | 5xx、上游网络错误 | 是 |
| `cancelled` | 客户端断开 | 否 |

### 渠道配置（channels.json）

统一端点按「模型 → 厂商/模式 → 渠道」解析实际要调用的接口与密钥。把 `server/channels.example.json` 复制成 `server/channels.json` 即可：

```json
{
  "channels": [
    {
      "id": "openai-main",
      "provider": "openai",
      "mode": "images_generations",
      "enabled": true,
      "priority": 10,
      "baseUrl": "https://api.openai.com",
      "path": "/v1/images/generations",
      "authHeader": "Authorization",
      "authPrefix": "Bearer ",
      "model": "gpt-image-1",
      "apiKeyEnv": "OPENAI_API_KEY"
    }
  ]
}
```

密钥取值顺序：`channels.json` 的 `apiKey` → `apiKeyEnv` 指定的环境变量 → `.env` 里的厂商密钥。没有 `channels.json` 时退回 profile 自带的默认值。

同一个模型被多个厂商提供时，按 `priority` 选渠道（数值小的优先），`enabled: false` 的渠道不参与。

## 已注册的厂商

厂商定义放在 `shared/adapters/profiles.js`，**前后端共用同一份**：

- 后端 `server/src/adapters/profiles.js` 直接 re-export，用它拼请求、解析响应；
- 前端 `web/src/data/profiles.js` 也 import 同一份，用它渲染厂商/模式/比例/参数控件。

好处是**后端没启动时，页面照样能列出厂商、正常填配置**（只有生成/历史/模型列表不可用，页面顶部会给出提示）。

| 厂商 | 模式 | 端点 | 鉴权头 | 响应取值 |
| --- | --- | --- | --- | --- |
| MiniMax | `image-01` / `image-01-live` | `POST {base}/v1/image_generation` | `Authorization: Bearer` | `data.image_urls[]` / `data.images[]` |
| OpenAI 兼容 | `gpt-image-1` / `dall-e-3` / 各类聚合网关 | `POST {base}/v1/images/generations` | `Authorization: Bearer` | `data[].url` / `data[].b64_json` |
| 火山方舟（豆包 Seedream） | `doubao-seedream-*` | `POST {base}/images/generations` | `Authorization: Bearer` | `data[].url` |
| SiliconFlow 硅基流动 | `Kolors` / `FLUX.1` 等 | `POST {base}/images/generations` | `Authorization: Bearer` | `data[].url` |
| 智谱 CogView | `cogview-3-flash` / `cogview-4` | `POST {base}/images/generations` | `Authorization: Bearer` | `data[].url` |
| 阿里百炼（通义万相） | `wanx-v1` / `wanx2.1-*` | `POST {base}/services/aigc/text2image/image-synthesis` | `Authorization: Bearer` | `output.results[].url` |
| Stability AI | `stable-image-core` / `ultra` / `sd3.5` | `POST {base}/v2beta/stable-image/generate/{model}` | `Authorization: Bearer` | `image`（base64） |
| Google Gemini | Imagen `:predict` | `POST {base}/v1beta/models/{model}:predict` | `x-goog-api-key` | `predictions[].bytesBase64Encoded` |
| Google Gemini | 图像模型 `:generateContent` | `POST {base}/v1beta/models/{model}:generateContent` | `x-goog-api-key` | `candidates[].content.parts[].inlineData` |
| 自定义 | 模板 | 任意 | 任意 | 任意（响应路径表达式） |

> 各厂商的模型名更新比较频繁，列表里给的是常见值；下拉框支持直接输入，填错了也不影响。

### 厂商差异的处理

- **比例**：MiniMax 用 `aspect_ratio`；OpenAI 用 `size`（`1024x1024` / `1536x1024` / `1024x1536`）；Gemini 用 `aspectRatio`。
- **负向提示词**：Imagen 原生支持 `parameters.negativePrompt`；MiniMax 可选 `negative_prompt` 字段（部分版本）或拼进 prompt；OpenAI 只能拼进 prompt。「负向提示词处理方式」下拉按厂商给出可选策略。
- **response_format**：`gpt-image-1` 只返回 `b64_json` 且不接受该字段，适配器会自动剔除。
- **参考图**：仅 MiniMax（`subject_reference`）和自定义模式支持，其余厂商自动隐藏该面板。

## 扩展到新厂商

两种方式，都不用改 UI：

**A. 加一个内置 profile** —— 在 `server/src/adapters/profiles.js` 的 `PROFILES` 里加一项，声明 `defaults`（base/path/auth/model）、`aspectOptions`、`supports`（决定哪些参数控件显示）、`build(ctx)`（返回请求体）、`extract(json, ctx)`（返回图片数组）。前端会自动从 `GET /api/profiles` 拿到新厂商的表单结构。

**B. 用「自定义」模式** —— 不改代码，在页面上填：
- 请求路径：`/v1/images/generations`（支持 `{model}` 占位符）
- 请求体模板（JSON 文本），占位符：`{{model}} {{prompt}} {{negative}} {{aspect}} {{n}} {{seed}} {{quality}} {{refBase64}}`
- 响应取值路径：`data.image_urls` / `data[].url` / `predictions[].bytesBase64Encoded` / `data[0].b64_json`

## 后端接口

### 协议层

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/v1/images/generations` | OpenAI 兼容的图像生成 |
| GET | `/v1/models` | 跨厂商模型注册表 + 能力矩阵 |
| GET | `/v1/providers` | 渠道列表（不含密钥） |
| GET | `/v1/usage` | 用量统计 |

### 扩展接口

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/health` | 健康检查 |
| GET | `/api/profiles` | 厂商 / 模式 / 参数选项元数据 |
| POST | `/api/generate` | 页面用生成入口（适配层拼请求 → 转发 → 解析图片） |
| GET / POST / DELETE | `/api/history` | 历史记录读取 / 新增 / 清空 |
| DELETE | `/api/history/:id` | 删除单条历史 |
| POST | `/api/proxy/*` | 通用转发（原 `proxy.js` 的等价物），需带 `x-upstream-base` 头 |
| POST | `/api/discover-models` | 拉取厂商模型列表（`{ baseUrl, apiKey, authHeader, authPrefix }`） |
| GET | `/api/agent/status` | AI Agent 是否已配置 |
| POST | `/api/agent/fill` | 智能填表：一句描述 → 画面描述六栏 + 生成参数 |
| POST | `/api/agent/storyboard` | 分镜拆解：一句描述 → N 格分镜 |
| POST | `/api/agent/characters/generate` | 角色档案：一句描述 → 角色设定 |
| GET / POST / DELETE | `/api/agent/characters` | 角色卡列表 / 保存 / 删除 |

`POST /api/generate` 请求体：

```jsonc
{
  "provider": "minimax",
  "mode": "image_generation",
  "config": {
    "baseUrl": "https://api.minimaxi.com", "path": "/v1/image_generation",
    "authHeader": "Authorization", "authPrefix": "Bearer ",
    "model": "image-01", "apiKey": "sk-xxx",
    "aspect": "1:1", "n": 1, "seed": "", "quality": "",
    "responseFormat": "url", "optimizer": true,
    "extraJson": "", "bodyTemplate": "", "respPath": ""
  },
  "prompt": "最终提示词",
  "negative": "负向提示词原文",
  "negativeMode": "inline | field | off",
  "ref": { "type": "character", "base64": "..." }
}
```

响应：`{ ok, provider, mode, profile, items: [{ src, type }], duration, url, payload }`。

## 服务端配置（`server/.env`）

复制 `server/.env.example` 为 `server/.env`：

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `HOST` / `PORT` | `127.0.0.1` / `8787` | 监听地址 |
| `CORS_ORIGIN` | `*` | 允许的前端来源 |
| `MINIMAX_API_KEY` 等 | 空 | 服务端托管的 Key，前端留空时使用 |
| `STUDIO_API_KEYS` | 空 | JSON，一次写全：`{"minimax":"sk-xxx"}` |
| `GENERATE_TIMEOUT_MS` | `180000` | 单次生成超时 |
| `ALLOWED_UPSTREAM_HOSTS` | 内置列表 | 通用代理的上游白名单 |
| `ALLOW_ANY_UPSTREAM` | `0` | 置 `1` 放开代理白名单 |
| `STRICT_UPSTREAM` | `0` | 置 `1` 时，适配器请求也必须命中白名单 |
| `CHANNELS_FILE` | `channels.json` | 渠道配置文件路径 |
| `DATA_DIR` | `data` | 历史记录与用量统计的落盘目录 |
| `AGENT_BASE_URL` / `AGENT_PATH` | 空 / `/v1/chat/completions` | AI Agent 的 chat 接口（OpenAI 兼容） |
| `AGENT_API_KEY` / `AGENT_MODEL` | 空 | Agent 的 Key 与模型名 |
| `AGENT_VISION_MODEL` | 空 | 复盘用的视觉模型，留空则复用 `AGENT_MODEL` |
| `AGENT_TEMPERATURE` / `AGENT_MAX_TOKENS` | `0.8` / `4096` | Agent 采样温度与单次输出上限 |
| `AGENT_TIMEOUT_MS` | `120000` | Agent 单次请求超时 |

## 安全注意

- 默认只监听 `127.0.0.1`。**不要**把带 Key 的实例直接暴露到公网。
- 页面上填的 Key 会存在浏览器 localStorage（明文）；若不希望如此，把 Key 放进服务端 `.env`，前端留空即可。
- 参考图会以 base64 整张上传，注意体积（>20MB 会被前端拒绝）。
- 字段名以各厂商官方文档为准；接口升级时改对应 profile 的 `build` / `extract` 一处即可。

## legacy/

`legacy/` 里是改造前的 `index.html`、`proxy.js`、`smoke-test.js`，仅作对照保留，不再维护。
