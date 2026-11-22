<script setup>
import { ref } from "vue";
import { MagicStick } from "@element-plus/icons-vue";
import UiCard from "../UiCard.vue";
import { useAgent } from "../../composables/useAgent.js";
import StoryboardView from "./StoryboardView.vue";
import CharacterView from "./CharacterView.vue";
import RefineView from "./RefineView.vue";

const { state, styles, busy, selectedCharacters, saveCfg, fill, fillAndGenerate } = useAgent();

const tab = ref("fill");

/** 跳到左侧菜单的「Agent 配置」页 */
function goConfig() {
  location.hash = "#/agent";
}
</script>

<template>
  <UiCard title="AI 漫画助手" :collapsible="false">
    <template #icon><el-icon><MagicStick /></el-icon></template>
    <template #actions>
      <el-tag size="small" effect="plain" :type="state.configured ? 'success' : 'info'">
        {{ state.configured ? "就绪" : "未配置" }}
      </el-tag>
    </template>

    <div v-if="state.error" class="notice err">{{ state.error }}</div>
    <div v-else-if="state.hint" class="notice info">
      {{ state.hint }}
      <el-button link type="primary" @click="goConfig">去配置 →</el-button>
    </div>

    <!-- ============ 一句话描述（四项能力共用） ============ -->
    <div class="field">
      <label>
        你想画什么？
        <span class="hint">一句话就够，Agent 负责补全</span>
      </label>
      <el-input
        v-model="state.brief"
        type="textarea"
        :rows="2"
        spellcheck="false"
        placeholder="例：一只戴眼镜的猫在暴雨天台上修收音机，天台下面是霓虹街道"
        @input="saveCfg()"
      />
    </div>

    <div class="row c2">
      <div class="field">
        <label>画风</label>
        <el-select v-model="state.styleKey" @change="saveCfg()">
          <el-option v-for="s in styles" :key="s.key" :label="s.label" :value="s.key" />
        </el-select>
      </div>
      <div class="field">
        <label>
          沿用角色
          <span class="hint">保持多张图角色一致</span>
        </label>
        <el-select
          v-model="state.useCharacterIds"
          multiple
          collapse-tags
          collapse-tags-tooltip
          placeholder="不选"
          @change="saveCfg()"
        >
          <el-option
            v-for="c in state.library"
            :key="c.id"
            :label="c.name"
            :value="c.id"
          />
        </el-select>
      </div>
    </div>

    <div v-if="selectedCharacters.length" class="notice info">
      本次会带上 {{ selectedCharacters.length }} 个角色设定：
      {{ selectedCharacters.map((c) => c.name).join("、") }}
    </div>

    <!-- ============ 四项能力 ============ -->
    <el-tabs v-model="tab" class="agent-tabs">
      <!-- ---------- 智能填表 ---------- -->
      <el-tab-pane label="智能填表" name="fill">
        <div class="gen-bar">
          <el-button type="primary" :loading="busy === 'fill'" @click="fill">
            智能填充表单
          </el-button>
          <el-button :loading="busy === 'fill'" @click="fillAndGenerate">
            填表并生成
          </el-button>
        </div>
        <div v-if="state.fill?.notes" class="notice info">
          <strong>Agent 的思路：</strong>{{ state.fill.notes }}
        </div>
        <div class="hint">
          填完可以继续在下方「画面描述」里手工改，改完照旧点「开始生成」。
        </div>
      </el-tab-pane>

      <!-- ---------- 分镜拆解 ---------- -->
      <el-tab-pane label="分镜拆解" name="board">
        <StoryboardView />
      </el-tab-pane>

      <!-- ---------- 角色档案 ---------- -->
      <el-tab-pane label="角色档案" name="char">
        <CharacterView />
      </el-tab-pane>

      <!-- ---------- 出图复盘 ---------- -->
      <el-tab-pane label="出图复盘" name="refine">
        <RefineView />
      </el-tab-pane>
    </el-tabs>

    <!-- ============ 模型配置入口 ============ -->
    <div class="agent-foot">
      <span class="hint">
        Agent 模型：{{ state.cfg.model || "跟随服务端 AGENT_MODEL" }}
      </span>
      <el-button link type="primary" @click="goConfig">模型配置 →</el-button>
    </div>
  </UiCard>
</template>
