/**
 * 前端侧的厂商元数据 —— 与后端共用同一份定义（shared/adapters/profiles.js）。
 *
 * 这样即使 Node 后端没启动，页面也能正常列出厂商、渲染参数控件，
 * 只是「生成」会失败而已。
 */
import { PROFILES, ASPECTS } from "../../../shared/adapters/profiles.js";

export { PROFILES, ASPECTS };

/**
 * 剥离函数，返回可 JSON 序列化的 profile 元数据。
 * 前端用它渲染厂商/模式/比例/参数控件。
 */
export function profileMeta() {
  const out = {};
  for (const [id, p] of Object.entries(PROFILES)) {
    out[id] = {
      id,
      label: p.label,
      note: p.note,
      modes: p.modes.map((m) => ({
        id: m.id,
        label: m.label,
        defaults: m.defaults || {},
        models: m.models || [],
        aspectOptions: m.aspectOptions || [],
        modelCaps: m.modelCaps || {},
        resolutions: m.resolutions || [],
        resolutionNote: m.resolutionNote || "",
        aspectLabel: m.aspectLabel || "画面比例",
        responseFormats: m.responseFormats || [],
        qualities: m.qualities || [],
        negativeModes: m.negativeModes || [],
        supports: m.supports || {}
      }))
    };
  }
  return out;
}
