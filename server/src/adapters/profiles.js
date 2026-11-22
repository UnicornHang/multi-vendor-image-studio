/**
 * 厂商 profile —— 直接复用前后端共享的定义（shared/adapters/profiles.js）
 * 前端也 import 同一份，所以后端没启动时页面照样能列出厂商。
 */
export {
  PROFILES,
  ASPECTS,
  resolvePath
} from "../../../shared/adapters/profiles.js";
