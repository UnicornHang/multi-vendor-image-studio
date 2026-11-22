<script setup>
import { useAgent } from "../../composables/useAgent.js";

const { state, busy, genCharacters, saveCharacter, useCharacter } = useAgent();

/** 跳到左侧菜单的「Agent 配置」页管理角色库 */
function goLibrary() {
  location.hash = "#/agent";
}
</script>

<template>
  <el-button
    type="primary"
    :loading="busy === 'chars'"
    :disabled="!state.brief.trim()"
    @click="genCharacters()"
  >
    从描述生成角色设定
  </el-button>

  <!-- ---------- 待确认 ---------- -->
  <template v-if="state.drafts.length">
    <div class="hint">确认后存入角色库，之后每张图都能复用同一份外形描述。</div>
    <div v-for="(c, i) in state.drafts" :key="'d' + i" class="char-card">
      <div class="char-head">
        <span class="char-name">{{ c.name || "未命名角色" }}</span>
        <el-tag v-if="c.role" size="small" effect="plain">{{ c.role }}</el-tag>
      </div>
      <div v-if="c.appearance" class="char-line"><b>外形</b>{{ c.appearance }}</div>
      <div v-if="c.outfit" class="char-line"><b>服装</b>{{ c.outfit }}</div>
      <div v-if="c.palette" class="char-line"><b>配色</b>{{ c.palette }}</div>
      <div v-if="c.signature" class="char-line"><b>标志</b>{{ c.signature }}</div>
      <div v-if="c.promptFragment" class="char-frag">{{ c.promptFragment }}</div>
      <div class="char-actions">
        <el-button size="small" type="primary" plain :loading="busy === 'save-char'" @click="saveCharacter(c)">
          存入角色库
        </el-button>
        <el-button size="small" @click="useCharacter(c)">用于当前画面</el-button>
      </div>
    </div>
  </template>

  <!-- ---------- 角色库入口 ---------- -->
  <div class="notice info">
    角色库里已有 {{ state.library.length }} 个角色，在「沿用角色」里勾选即可复用。
    <el-button link type="primary" @click="goLibrary">去角色库管理 →</el-button>
  </div>
</template>
