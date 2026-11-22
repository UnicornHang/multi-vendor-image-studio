<script setup>
import { ref, computed } from "vue";
import { MagicStick, Check, Delete, Edit, Refresh } from "@element-plus/icons-vue";
import { ElMessageBox } from "element-plus";
import UiCard from "../UiCard.vue";
import { useAgent } from "../../composables/useAgent.js";

const {
  state,
  styles,
  busy,
  checkStatus,
  saveAgentCfg,
  resetAgentCfg,
  testConnection,
  delCharacter,
  saveCharacter,
  useCharacter
} = useAgent();

/* 正在编辑的角色卡（null = 没在编辑） */
const editing = ref(null);
const draft = ref({});

function startEdit(c) {
  editing.value = c.id;
  draft.value = { ...c };
}

function cancelEdit() {
  editing.value = null;
  draft.value = {};
}

async function commitEdit() {
  const res = await saveCharacter(draft.value);
  if (res) cancelEdit();
}

async function remove(c) {
  try {
    await ElMessageBox.confirm(`删除角色「${c.name}」？`, "删除角色卡", {
      type: "warning",
      confirmButtonText: "删除",
      cancelButtonText: "取消"
    });
  } catch {
    return; // 用户取消
  }
  await delCharacter(c.id);
}

/** 配置来源说明（页面优先于服务端） */
const sourceText = computed(() => {
  if (!state.cfgSaved) return "当前使用服务端 .env 里的 AGENT_* 配置";
  const parts = [];
  if (state.cfg.baseUrl) parts.push("地址");
  if (state.cfg.apiKey) parts.push("Key");
  if (state.cfg.model) parts.push("模型");
  if (state.cfg.visionModel) parts.push("视觉模型");
  return parts.length ? `当前由页面配置覆盖：${parts.join("、")}` : "页面配置已保存（当前为空，将回落服务端）";
});
</script>

<template>
  <div class="agent-config-page">
    <!-- ============ 状态 ============ -->
    <UiCard title="Agent 状态" :collapsible="false">
      <template #icon><el-icon><MagicStick /></el-icon></template>
      <template #actions>
        <el-tag size="small" effect="plain" :type="state.configured ? 'success' : 'info'">
          {{ state.configured ? "已就绪" : "未配置" }}
        </el-tag>
      </template>

      <div class="kv">
        <span>配置来源</span>
        <span>{{ sourceText }}</span>
      </div>
      <div class="kv">
        <span>当前模型</span>
        <span>
          {{ state.cfg.model || state.serverModel || "（未指定）" }}
          <span v-if="!state.cfg.model && state.serverModel" class="hint">← 来自服务端</span>
        </span>
      </div>
      <div class="kv">
        <span>视觉模型</span>
        <span>
          {{ state.cfg.visionModel || state.serverVisionModel || state.serverModel || "（未指定）" }}
          <span v-if="!state.cfg.visionModel" class="hint">← 与主模型相同</span>
        </span>
      </div>

      <div v-if="state.error" class="notice err">{{ state.error }}</div>
      <div v-else-if="state.hint" class="notice info">{{ state.hint }}</div>

      <div v-if="state.test" class="notice" :class="state.test.ok ? 'info' : 'err'">
        <template v-if="state.test.ok">
          连接正常 · 模型 <code>{{ state.test.model }}</code> · {{ state.test.durationMs }}ms ·
          回复「{{ state.test.reply }}」
        </template>
        <template v-else>{{ state.test.message }}</template>
      </div>

      <div class="gen-bar">
        <el-button :loading="busy === 'test'" @click="testConnection()">
          <el-icon><Check /></el-icon>&nbsp;测试连接
        </el-button>
        <el-button :icon="Refresh" @click="checkStatus()">重新读取状态</el-button>
      </div>
    </UiCard>

    <!-- ============ 模型配置 ============ -->
    <UiCard title="模型配置" :collapsible="false">
      <template #icon><el-icon><MagicStick /></el-icon></template>

      <div class="notice info">
        Agent 用一个 <strong>OpenAI 兼容的 chat/completions 端点</strong>：DeepSeek / 通义 / 智谱 /
        OpenAI / 各类聚合网关都能直接用。留空则使用服务端 <code>server/.env</code> 里的
        <code>AGENT_BASE_URL</code> / <code>AGENT_API_KEY</code> / <code>AGENT_MODEL</code>。
      </div>

      <div class="row c2">
        <div class="field">
          <label>Base URL <span class="hint">如 https://api.deepseek.com</span></label>
          <el-input v-model="state.cfg.baseUrl" placeholder="https://api.deepseek.com" @change="saveAgentCfg()" />
        </div>
        <div class="field">
          <label>请求路径 <span class="hint">相对 Base URL</span></label>
          <el-input v-model="state.cfg.path" placeholder="/v1/chat/completions" @change="saveAgentCfg()" />
        </div>
      </div>

      <div class="row c2">
        <div class="field">
          <label>API Key</label>
          <el-input
            v-model="state.cfg.apiKey"
            type="password"
            show-password
            placeholder="sk-xxx"
            @change="saveAgentCfg()"
          />
        </div>
        <div class="field">
          <label>Model <span class="hint">文本模型名</span></label>
          <el-input v-model="state.cfg.model" placeholder="deepseek-chat" @change="saveAgentCfg()" />
        </div>
      </div>

      <div class="row c2">
        <div class="field">
          <label>鉴权头 <span class="hint">留空 = Authorization</span></label>
          <el-input v-model="state.cfg.authHeader" placeholder="Authorization" @change="saveAgentCfg()" />
        </div>
        <div class="field">
          <label>鉴权前缀 <span class="hint">留空 = 不带前缀</span></label>
          <el-input v-model="state.cfg.authPrefix" placeholder="Bearer " @change="saveAgentCfg()" />
        </div>
      </div>

      <div class="field">
        <label>
          视觉模型
          <span class="hint">「出图复盘」要把图喂给模型，需要支持视觉输入；留空则复用上面的模型</span>
        </label>
        <el-input
          v-model="state.cfg.visionModel"
          placeholder="留空 = 与 Model 相同"
          @change="saveAgentCfg()"
        />
      </div>

      <div class="gen-bar">
        <el-button type="primary" :loading="busy === 'test'" @click="saveAgentCfg(); checkStatus()">
          保存配置
        </el-button>
        <el-button @click="resetAgentCfg()">清空页面配置（改用服务端）</el-button>
      </div>
      <div class="hint">
        配置只存在这台电脑的浏览器里（localStorage），不会随项目分发；
        团队共用时把它放进服务端 <code>server/.env</code> 更合适。
      </div>
    </UiCard>

    <!-- ============ 角色库 ============ -->
    <UiCard title="角色库" :collapsible="false">
      <template #icon><el-icon><Edit /></el-icon></template>
      <template #actions>
        <el-tag size="small" effect="plain">{{ state.library.length }} 个角色</el-tag>
      </template>

      <div class="notice info">
        角色卡是 Agent 的长期记忆：存进来的角色可以在「基础生图」里勾选复用，
        多张图保持同一个人的外形一致。
      </div>

      <div v-if="!state.library.length" class="empty">
        <div class="big">🗂</div>
        还没有角色。到「基础生图 → AI 漫画助手 → 角色档案」里生成并存库。
      </div>

      <div v-for="c in state.library" :key="c.id" class="char-card">
        <div class="char-head">
          <span class="char-name">{{ c.name }}</span>
          <el-tag v-if="c.role" size="small" effect="plain">{{ c.role }}</el-tag>
          <span class="spacer-flex"></span>
          <span class="char-time">{{ (c.updatedAt || "").slice(0, 10) }}</span>
        </div>

        <template v-if="editing === c.id">
          <div class="row c2">
            <div class="field">
              <label>角色名</label>
              <el-input v-model="draft.name" />
            </div>
            <div class="field">
              <label>身份</label>
              <el-input v-model="draft.role" />
            </div>
          </div>
          <div class="field">
            <label>提示词片段 <span class="hint">会直接拼进「场景与细节」栏</span></label>
            <el-input v-model="draft.promptFragment" type="textarea" :rows="3" />
          </div>
          <div class="gen-bar">
            <el-button type="primary" size="small" @click="commitEdit()">保存</el-button>
            <el-button size="small" @click="cancelEdit()">取消</el-button>
          </div>
        </template>

        <template v-else>
          <div v-if="c.appearance" class="char-line"><b>外形</b>{{ c.appearance }}</div>
          <div v-if="c.outfit" class="char-line"><b>服装</b>{{ c.outfit }}</div>
          <div v-if="c.promptFragment" class="char-frag">{{ c.promptFragment }}</div>
          <div class="char-actions">
            <el-button size="small" type="primary" plain @click="useCharacter(c)">用于当前画面</el-button>
            <el-button size="small" :icon="Edit" @click="startEdit(c)">编辑</el-button>
            <el-button size="small" type="danger" plain :icon="Delete" @click="remove(c)">删除</el-button>
          </div>
        </template>
      </div>
    </UiCard>

    <!-- ============ 画风预设 ============ -->
    <UiCard title="画风预设" :collapsible="false">
      <template #icon><el-icon><MagicStick /></el-icon></template>

      <div class="notice info">
        「基础生图」的助手面板里可以挑一个画风。Agent 会把它写进提示词的「风格」栏，
        并把对应的排除项合并进「负向提示词」。
      </div>

      <div class="style-grid">
        <div v-for="s in styles" :key="s.key" class="style-card">
          <div class="style-name">{{ s.label }}</div>
          <div class="style-desc">{{ s.style }}</div>
          <div class="style-neg">排除：{{ s.negative }}</div>
        </div>
      </div>
    </UiCard>
  </div>
</template>
