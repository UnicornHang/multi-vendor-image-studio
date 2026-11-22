<script setup>
import { useAgent } from "../../composables/useAgent.js";

const { state, busy, storyboard, applyPanel, saveCfg } = useAgent();
</script>

<template>
  <div class="field">
    <label>
      分镜格数
      <span class="hint">Agent 会拆成连续的 N 格</span>
    </label>
    <el-input-number
      v-model="state.panelCount"
      :min="1"
      :max="12"
      controls-position="right"
      @change="saveCfg()"
    />
  </div>

  <el-button
    type="primary"
    :loading="busy === 'board'"
    :disabled="!state.brief.trim()"
    @click="storyboard()"
  >
    拆解分镜
  </el-button>

  <template v-if="state.board">
    <div v-if="state.board.synopsis" class="notice info">
      <strong>梗概：</strong>{{ state.board.synopsis }}
    </div>

    <div v-for="p in state.board.panels" :key="p.index" class="sb-panel">
      <div class="sb-head">
        <span class="sb-no">{{ p.index }}</span>
        <span class="sb-title">{{ p.title || "未命名分镜" }}</span>
        <el-tag v-if="p.shot" size="small" effect="plain">{{ p.shot }}</el-tag>
      </div>
      <div class="sb-desc">{{ p.description || p.prompt?.main }}</div>
      <div v-if="p.dialogue || p.sfx" class="sb-text">
        <span v-if="p.dialogue">「{{ p.dialogue }}」</span>
        <span v-if="p.sfx" class="sfx">{{ p.sfx }}</span>
      </div>
      <div class="sb-actions">
        <el-button size="small" @click="applyPanel(p, false)">填入表单</el-button>
        <el-button size="small" type="primary" plain @click="applyPanel(p, true)">填入并生成</el-button>
      </div>
    </div>
  </template>

  <div v-else class="hint">先在上面写一句描述，再点「拆解分镜」。</div>
</template>
