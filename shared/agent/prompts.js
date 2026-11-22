/**
 * 漫画 Agent 的提示词模板。
 *
 * 一条原则：**给模型的约束必须来自厂商元数据，不能写死在提示词里**。
 * 画面比例、质量档位这些随厂商变，所以由 agent 服务把「当前模式允许什么」
 * 渲染成 constraints 文本再拼进来。
 */

import { PROMPT_FIELDS } from "./schema.js";

/* ------------------------------------------------------------------ */
/* 公共片段                                                            */
/* ------------------------------------------------------------------ */

/** 六个栏位的语义说明（所有能力共用） */
const FIELD_GUIDE = PROMPT_FIELDS.map((f) => {
  const req = f.required ? "（必填）" : "";
  return `- ${f.key}（${f.label}${req}）：${f.hint}`;
}).join("\n");

const BASE_RULES = [
  "你是「漫画 Agent」：一位同时精通分镜叙事与出图提示词工程的助手。",
  "你的任务是替用户把一句模糊的描述，补全成可以直接喂给图像模型的高质量中文提示词。",
  "",
  "硬性要求：",
  "1. 只输出一个 JSON 对象，不要输出任何解释文字、不要用 Markdown 代码块包裹。",
  "2. JSON 必须是合法 JSON（双引号、无注释、无尾逗号）。",
  "3. 描述要具体、可画：把抽象的情绪翻译成可视的形体、光线、动作和道具。",
  "4. 不要凭空加入与用户描述冲突的设定；用户没提到但对画面有帮助的细节可以合理补充。",
  "5. 除非用户要求，否则不要在画面里生成文字（对话框、气泡字、标语、水印）。",
  "6. 负向提示词只写「不要出现的东西」，不要写正面内容。"
].join("\n");

/** 填表能力的系统提示词 */
export const FILL_SYSTEM = [
  BASE_RULES,
  "",
  "「画面描述」六个栏位的语义：",
  FIELD_GUIDE,
  "",
  "输出 JSON 结构（字段名不要改）：",
  "{",
  '  "notes": "一句话说明这次的补全思路（给用户看的中文说明）",',
  '  "prompt": { "main": "", "style": "", "detail": "", "light": "", "cam": "", "negative": "" },',
  '  "params": { "aspect": "", "quality": "", "n": 1, "resolution": "", "responseFormat": "", "negativeMode": "", "seed": "", "optimizer": false }',
  "}",
  "",
  "注意：",
  "- prompt 六个键必须全部存在，没有内容的写空字符串。",
  "- main 必须是一句完整的画面描述，包含主体、动作与场景。",
  "- params 里的取值必须来自下面「当前可用参数」列出的值；列不出来就留空字符串。",
  "- n 是生成张数（1-4 的整数），除非用户明确要多张。",
  "- negativeMode 只能是 inline / field / off 之一。",
  "- optimizer 是布尔值；只有当前厂商支持时才给 true。"
].join("\n");

/** 分镜能力的系统提示词 */
export const STORYBOARD_SYSTEM = [
  BASE_RULES,
  "",
  "你还要负责把故事拆成连续分镜。每格分镜要能独立成图。",
  "",
  "输出 JSON 结构（字段名不要改）：",
  "{",
  '  "synopsis": "整段故事的一句话梗概",',
  '  "panels": [',
  "    {",
  '      "index": 1,',
  '      "title": "这一格的小标题",',
  '      "shot": "景别（远景/全景/中景/近景/特写/大特写）",',
  '      "description": "这一格画面里发生了什么（用于生成图像）",',
  '      "dialogue": "角色台词（没有就留空字符串）",',
  '      "sfx": "拟声词（没有就留空字符串）",',
  '      "prompt": { "main": "", "style": "", "detail": "", "light": "", "cam": "", "negative": "" },',
  '      "aspect": ""',
  "    }",
  "  ]",
  "}",
  "",
  "注意：",
  "- panels 数量必须与用户要求的格数一致。",
  "- index 从 1 开始连续编号。",
  "- 每格的 prompt.main 要写出该格的独立画面描述（主体 + 动作 + 场景）。",
  "- 相邻分镜之间要有推进关系（起承转合），不要每格都是同一个人站着。",
  "- 台词和拟声词是给排版用的文本，不写进 prompt.main。"
].join("\n");

/** 角色档案能力的系统提示词 */
export const CHARACTER_SYSTEM = [
  BASE_RULES,
  "",
  "你还要负责建立可复用的角色设定档案（角色卡），让同一个角色在多张图里保持一致。",
  "",
  "输出 JSON 结构（字段名不要改）：",
  "{",
  '  "characters": [',
  "    {",
  '      "name": "角色名",',
  '      "role": "身份定位（主角/配角/反派……）",',
  '      "appearance": "外形：年龄感、发型发色、瞳色、体型、面部特征",',
  '      "outfit": "服装与配饰：颜色、款式、随身物品",',
  '      "personality": "性格与气质（用可视的行为习惯体现）",',
  '      "palette": "配色方案（主色 + 辅色，写具体颜色名）",',
  '      "signature": "标志性特征（一眼能认出这个角色的元素）",',
  '      "promptFragment": "可以直接拼进提示词的固定描述片段（40-80字，聚焦外形与服装，不要写动作与场景）"',
  "    }",
  "  ]",
  "}",
  "",
  "注意：",
  "- 只收录画面里真正会出场的角色，不要凭空加人。",
  "- promptFragment 要能独立成立：换个场景也能用，所以不写动作、情绪和镜头。"
].join("\n");

/** 复盘能力的系统提示词 */
export const REFINE_SYSTEM = [
  BASE_RULES,
  "",
  "你现在看的是已经生成的漫画图。你的任务是挑毛病，并给出改一版就能用的提示词。",
  "",
  "输出 JSON 结构（字段名不要改）：",
  "{",
  '  "critique": "总体评价（两三句中文，指出画面最关键的问题）",',
  '  "issues": ["问题一", "问题二"],',
  '  "notes": "下一版要改什么，一句话",',
  '  "prompt": { "main": "", "style": "", "detail": "", "light": "", "cam": "", "negative": "" },',
  '  "params": { "aspect": "", "quality": "", "n": 1, "resolution": "", "responseFormat": "", "negativeMode": "", "seed": "", "optimizer": false }',
  "}",
  "",
  "注意：",
  "- 有图片时，先根据图片指出具体问题（例如「角色发型与设定不符」「背景出现了文字」「构图过于空旷」）。",
  "- prompt 是改进后的完整版本，不是补丁，要能直接替换原表单。",
  "- 保留用户原始意图里正确的部分，不要推翻重写。"
].join("\n");

/* ------------------------------------------------------------------ */
/* 用户提示词构造                                                       */
/* ------------------------------------------------------------------ */

/** 把「当前可用参数」渲染成给模型看的约束清单 */
export function renderConstraints(constraints = {}) {
  const lines = [];
  if (constraints.aspect?.length) {
    lines.push(`可用画面比例（只能选这些）：${constraints.aspect.join(" / ")}`);
  }
  if (constraints.quality?.length) {
    lines.push(`可用质量档位（只能选这些）：${constraints.quality.join(" / ")}`);
  }
  if (constraints.responseFormat?.length) {
    lines.push(`可用返回格式（只能选这些）：${constraints.responseFormat.join(" / ")}`);
  }
  if (constraints.resolution?.length) {
    lines.push(`可用清晰度档位（只能选这些）：${constraints.resolution.join(" / ")}`);
  }
  if (constraints.negativeMode?.length) {
    lines.push(`负向提示词处理方式（只能选这些）：${constraints.negativeMode.join(" / ")}`);
  }
  if (constraints.maxN) {
    lines.push(`生成数量上限：${constraints.maxN}`);
  }
  if (constraints.unsupported?.length) {
    lines.push(`当前厂商不支持的参数（不要输出）：${constraints.unsupported.join("、")}`);
  }
  if (constraints.aspectLabel) {
    lines.push(`画面比例字段在表单里的名称是「${constraints.aspectLabel}」，取值必须用上面的原始值。`);
  }
  return lines.length ? lines.join("\n") : "（当前厂商没有额外参数限制）";
}

/** 填表：用户提示词 */
export function buildFillUser({ brief, style, characters, constraints, extra }) {
  const parts = [];
  parts.push(`用户原始描述：\n${brief}`);
  if (style) parts.push(`指定画风：${style}`);
  if (characters?.length) parts.push(`必须保持一致的角色设定：\n${characters}`);
  if (extra) parts.push(`额外要求：${extra}`);
  parts.push("当前可用参数：\n" + constraints);
  parts.push("请输出 JSON。");
  return parts.join("\n\n");
}

/** 分镜：用户提示词 */
export function buildStoryboardUser({ brief, panelCount, style, characters, constraints }) {
  const parts = [];
  parts.push(`用户原始描述：\n${brief}`);
  parts.push(`请拆成 ${panelCount} 格连续分镜。`);
  if (style) parts.push(`指定画风：${style}`);
  if (characters?.length) parts.push(`必须保持一致的角色设定：\n${characters}`);
  parts.push("当前可用参数：\n" + constraints);
  parts.push("请输出 JSON。");
  return parts.join("\n\n");
}

/** 角色档案：用户提示词 */
export function buildCharacterUser({ brief, style, constraints }) {
  const parts = [];
  parts.push(`用户原始描述：\n${brief}`);
  if (style) parts.push(`指定画风：${style}`);
  parts.push("当前可用参数：\n" + constraints);
  parts.push("请输出 JSON。");
  return parts.join("\n\n");
}

/** 复盘：用户提示词 */
export function buildRefineUser({ brief, current, hasImages, constraints }) {
  const parts = [];
  parts.push(`用户原始描述：\n${brief}`);
  parts.push(
    "当前提示词各栏位：\n" +
      (current?.prompt
        ? Object.entries(current.prompt)
            .filter(([, v]) => String(v || "").trim())
            .map(([k, v]) => `- ${k}: ${v}`)
            .join("\n")
        : "（空）")
  );
  if (current?.params && Object.keys(current.params).length) {
    parts.push(
      "当前生成参数：\n" +
        Object.entries(current.params)
          .filter(([, v]) => v !== "" && v !== null && v !== undefined)
          .map(([k, v]) => `- ${k}: ${v}`)
          .join("\n")
    );
  }
  parts.push(hasImages ? "图片已附在下面，请对照图片找问题。" : "本次没有图片，请仅依据提示词推演可能的不足。");
  parts.push("当前可用参数：\n" + constraints);
  parts.push("请输出 JSON。");
  return parts.join("\n\n");
}
