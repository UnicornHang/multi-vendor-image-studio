<script setup>
import { ref, computed } from "vue";
import { Connection, Search, DocumentCopy, Upload, Check, RefreshLeft } from "@element-plus/icons-vue";
import { ElMessage, ElMessageBox } from "element-plus";
import UiCard from "./UiCard.vue";
import { useStudio } from "../composables/useStudio.js";

const {
  state, profile, modes, modeObj, cur,
  selectProvider, selectMode,
  applyQuickConfig, exportCurrentConfig, discoverModels, clearDiscovered,
  saveCfg, resetCfg,
  log
} = useStudio();

const discovering = ref(false);

const providerOptions = computed(() =>
  Object.entries(state.profiles).map(([id, p]) => ({ value: id, label: p.label }))
);
const modeOptions = computed(() => modes.value.map((m) => ({ value: m.id, label: m.label })));
const modelOptions = computed(() => {
  // 从厂商拉到的列表优先，直接替换预设列表（预设只是默认值，可能过时）
  if (state.discovered.length) {
    return state.discovered.map((id) => ({ value: id, label: id }));
  }
  return (modeObj.value?.models || []).map((m) => ({ value: m, label: m }));
});
const adapterNote = computed(() => profile.value?.note || "");
const keyScopeHint = computed(() =>
  state.shareKey ? "全厂商共用" : "当前厂商专用（上方为全局 Key）"
);

function readFileText(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result || ""));
    r.onerror = () => reject(new Error("读取文件失败"));
    r.readAsText(file);
  });
}

/** 导入配置文件：解析后直接填进上面的表单，界面上不展示 JSON */
async function onImport(uploadFile) {
  const f = uploadFile?.raw;
  if (!f) return;
  try {
    const text = await readFileText(f);
    const parsed = applyQuickConfig(text);
    ElMessage.success(`已导入：${state.profiles[parsed.provider]?.label || parsed.provider}`);
    parsed.warnings.forEach((w) => log(w, "warn"));
  } catch (e) {
    ElMessage.error("导入失败：" + e.message);
  }
}

async function onDiscover() {
  if (state.bootError) {
    ElMessage.warning("后端未连接，无法获取模型列表");
    return;
  }
  discovering.value = true;
  try {
    const { models, endpoint } = await discoverModels();
    if (!models.length) {
      ElMessage.warning("未获取到模型");
      return;
    }
    ElMessage.success(`获取到 ${models.length} 个模型`);
    log(`模型列表来源：${endpoint}`, "ok");
  } catch (e) {
    ElMessage.error("获取模型列表失败：" + e.message);
  } finally {
    discovering.value = false;
  }
}

async function onExport() {
  const text = exportCurrentConfig();
  try {
    await navigator.clipboard.writeText(text);
    ElMessage.success("当前配置已复制");
  } catch {
    ElMessage.warning("复制失败，请手动复制控制台内容");
    log(text, "info");
  }
}

function onSave() {
  saveCfg();
  ElMessage.success("配置已保存到本地");
}

async function onReset() {
  try {
    await ElMessageBox.confirm(
      "确定重置所有配置吗？（历史记录保留在服务端，如需清空请在历史记录页操作）",
      "确认重置",
      { confirmButtonText: "重置", cancelButtonText: "取消", type: "warning" }
    );
  } catch {
    return;
  }
  resetCfg();
}
</script>

<template>
  <UiCard title="厂商 · 模式 · 连接">
    <template #icon><el-icon><Connection /></el-icon></template>
    <template #actions>
      <el-button size="small" :icon="Check" @click="onSave">保存配置</el-button>
      <el-button size="small" :icon="RefreshLeft" @click="onReset">重置</el-button>
    </template>

    <!-- ============ 基础配置 ============ -->
    <div class="row c2">
      <div class="field">
        <label>厂商 Provider</label>
        <el-select v-model="state.provider" @change="selectProvider">
          <el-option v-for="p in providerOptions" :key="p.value" :label="p.label" :value="p.value" />
        </el-select>
      </div>
      <div class="field" :class="{ hidden: modeOptions.length < 2 }">
        <label>模式 Mode</label>
        <el-select v-model="state.mode" @change="selectMode">
          <el-option v-for="m in modeOptions" :key="m.value" :label="m.label" :value="m.value" />
        </el-select>
      </div>
    </div>

    <div class="field">
      <label>请求地址 Base URL</label>
      <el-input v-model="cur.baseUrl" placeholder="https://api.minimaxi.com" spellcheck="false" />
    </div>

    <div class="field">
      <label>
        API Key
        <span class="hint">{{ keyScopeHint }}</span>
      </label>
      <el-input
        v-model="state.apiKey"
        type="password"
        show-password
        placeholder="sk-..."
        autocomplete="off"
      />
      <span class="hint">留空则使用服务端 .env 中配置的该厂商密钥。</span>
    </div>

    <div class="field">
      <label>
        模型 Model
        <span class="hint" v-if="state.discovered.length">来自厂商，共 {{ state.discovered.length }} 个</span>
        <span class="spacer-flex"></span>
        <el-button v-if="state.discovered.length" link size="small" @click="clearDiscovered">清除</el-button>
      </label>
      <el-select
        v-model="cur.model"
        filterable
        allow-create
        default-first-option
        clearable
        placeholder="选择或直接输入模型名"
      >
        <el-option v-for="m in modelOptions" :key="m.value" :label="m.label" :value="m.value" />
      </el-select>
    </div>

    <div class="inline wrap">
      <el-button :icon="Search" :loading="discovering" @click="onDiscover">获取模型列表</el-button>
      <el-upload :auto-upload="false" :show-file-list="false" accept=".json,application/json" :on-change="onImport">
        <el-button :icon="Upload">导入配置文件</el-button>
      </el-upload>
      <el-button :icon="DocumentCopy" @click="onExport">复制配置</el-button>
    </div>

    <!-- ============ 高级选项 ============ -->
    <el-collapse>
      <el-collapse-item name="advanced">
        <template #title><span class="panel-title">高级选项</span></template>

        <div class="field">
          <label>请求路径 Path <span class="hint">支持 <code>{model}</code> 占位符</span></label>
          <el-input v-model="cur.path" placeholder="/v1/image_generation" spellcheck="false" />
        </div>

        <div class="row c2">
          <div class="field">
            <label>鉴权头 Header</label>
            <el-input v-model="cur.authHeader" placeholder="Authorization" spellcheck="false" />
          </div>
          <div class="field">
            <label>鉴权前缀 Prefix</label>
            <el-input v-model="cur.authPrefix" placeholder="Bearer " spellcheck="false" />
          </div>
        </div>

        <div class="field">
          <el-checkbox v-model="state.shareKey">所有厂商共用同一个 Key</el-checkbox>
          <div v-show="!state.shareKey">
            <el-input
              v-model="cur.apiKey"
              type="password"
              show-password
              placeholder="仅当前厂商的 Key（覆盖全局）"
              autocomplete="off"
            />
          </div>
        </div>

        <div class="notice" v-html="adapterNote"></div>
      </el-collapse-item>
    </el-collapse>
  </UiCard>
</template>
