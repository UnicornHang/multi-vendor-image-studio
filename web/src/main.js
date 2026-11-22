import { createApp } from "vue";
import ElementPlus from "element-plus";
import "element-plus/dist/index.css";
import "element-plus/theme-chalk/dark/css-vars.css";
import App from "./App.vue";
import "./styles/main.css";

/* 全站暗色：Element Plus 通过 html.dark 切换暗色变量 */
document.documentElement.classList.add("dark");

createApp(App).use(ElementPlus).mount("#app");
