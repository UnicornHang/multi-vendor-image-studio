<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from "vue";
import { ElMessage } from "element-plus";
import {
  Connection,
  Files,
  Document,
  EditPen,
  MagicStick
} from "@element-plus/icons-vue";
import { useStudio } from "./composables/useStudio.js";
import { useAgent } from "./composables/useAgent.js";
import AdapterCard from "./components/AdapterCard.vue";
import AgentCard from "./components/agent/AgentCard.vue";
import AgentPanel from "./components/agent/AgentPanel.vue";
import ProcessCard from "./components/ProcessCard.vue";
import ResultCard from "./components/ResultCard.vue";
import BaseGenCard from "./components/BaseGenCard.vue";
import HistoryCard from "./components/HistoryCard.vue";
import LogCard from "./components/LogCard.vue";

const { state, init, generate, saveCfg, statusType } = useStudio();
const { init: initAgent } = useAgent();

/* ---------- 左侧菜单：最后一项「基础生图」在最右 ---------- */
const active = ref("adapter");
const narrow = ref(typeof window !== "undefined" && window.innerWidth < 960);
const menuMode = computed(() => (narrow.value ? "horizontal" : "vertical"));

const menu = [
  { key: "adapter", label: "适配器", icon: Connection, comp: AdapterCard },
  { key: "agent", label: "Agent 配置", icon: MagicStick, comp: AgentCard },
  { key: "history", label: "历史记录", icon: Files, comp: HistoryCard },
  { key: "log", label: "运行日志", icon: Document, comp: LogCard },
  { key: "base", label: "基础生图", icon: EditPen, comp: BaseGenCard }
];

const current = computed(() => menu.find((m) => m.key === active.value) || menu[0]);
const currentTitle = computed(() => current.value.label);
const currentDesc = computed(() => {
  if (active.value === "adapter") return "厂商 · 模式 · 端点 · 鉴权 · 模型";
  if (active.value === "agent") return "Agent 大脑 · 连通性检测 · 角色库 · 画风预设";
  if (active.value === "history") return "服务端留档的生成记录";
  if (active.value === "log") return "请求与响应明细";
  return "生成参数 · 画面描述 · 参考图";
});
/** 只有「基础生图」用三栏（中间操作区 + 右侧描述），其余是常规内容区 */
const isBase = computed(() => active.value === "base");
/** 常规内容区的菜单项（不含基础生图） */
const menuItems = computed(() => menu.filter((m) => m.key !== "base"));

/* 生成完成后自动切到结果区（中间栏常驻，这里只提示） */
watch(
  () => state.result,
  (r) => {
    if (r && r.items && r.items.length) ElMessage.success(`生成完成，共 ${r.items.length} 张`);
  }
);

function onResize() {
  narrow.value = window.innerWidth < 960;
}

/* 用 hash 记住当前分区，刷新后仍停留在同一处 */
function applyHash() {
  const key = (location.hash || "").replace(/^#\/?/, "");
  if (key && menu.some((m) => m.key === key)) active.value = key;
}

watch(active, (k) => {
  if (location.hash !== `#/${k}`) location.hash = `#/${k}`;
});

function onKeydown(e) {
  if (e.ctrlKey && e.key === "Enter") {
    e.preventDefault();
    generate();
  }
}

function onBeforeUnload() {
  saveCfg();
}

onMounted(() => {
  applyHash();
  window.addEventListener("keydown", onKeydown);
  window.addEventListener("resize", onResize);
  window.addEventListener("hashchange", applyHash);
  window.addEventListener("beforeunload", onBeforeUnload);
  init();
  initAgent();
});

onBeforeUnmount(() => {
  window.removeEventListener("keydown", onKeydown);
  window.removeEventListener("resize", onResize);
  window.removeEventListener("hashchange", applyHash);
  window.removeEventListener("beforeunload", onBeforeUnload);
});
</script>

<template>
  <el-container class="shell" :class="{ narrow }">
    <!-- ============ 左：菜单 ============ -->
    <el-aside :width="narrow ? '100%' : '238px'" class="aside">
      <div class="brand">
        <div class="logo">🎨</div>
        <div v-show="!narrow" class="brand-text">
          <div class="brand-title">Image Studio</div>
          <div class="brand-sub">多厂商图像生成工作台</div>
        </div>
      </div>

      <el-menu
        :default-active="active"
        :mode="menuMode"
        :ellipsis="false"
        class="nav"
        @select="(k) => (active = k)"
      >
        <el-menu-item v-for="m in menu" :key="m.key" :index="m.key">
          <el-icon><component :is="m.icon" /></el-icon>
          <template #title>
            <span class="nav-label">{{ m.label }}</span>
            <span v-if="m.key === 'history' && state.history.length" class="nav-count">
              {{ state.history.length }}
            </span>
          </template>
        </el-menu-item>
      </el-menu>

      <div class="aside-foot">
        <el-tag :type="statusType()" effect="dark" round class="status-tag">
          <span class="dot" :class="state.status.kind"></span>
          {{ state.status.text }}
        </el-tag>
        <div class="kv"><span>Ctrl + Enter</span><span>快捷提交</span></div>
      </div>
    </el-aside>

    <!-- ============ 右：工作区 ============ -->
    <el-main class="main">
      <header class="topbar">
        <div>
          <h1>{{ currentTitle }}</h1>
          <p>{{ currentDesc }}</p>
        </div>
      </header>

      <el-alert
        v-if="state.bootError"
        type="error"
        :closable="false"
        show-icon
        :title="state.bootError"
        class="boot-alert"
      />

      <div class="workspace" :class="{ split: isBase }">
        <!-- 常规模式：左菜单 + 内容区 -->
        <div class="col-full" v-show="!isBase">
          <component
            v-for="m in menuItems"
            v-show="m.key === active"
            :is="m.comp"
            :key="m.key"
          />
        </div>

        <!-- 基础生图：左菜单 + 中间操作区 + 右侧描述 -->
        <div class="col-mid" v-show="isBase">
          <ResultCard />
          <ProcessCard />
        </div>
        <div class="col-side" v-show="isBase">
          <AgentPanel />
          <BaseGenCard />
        </div>
      </div>
    </el-main>
  </el-container>
</template>
