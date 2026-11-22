<script setup>
import { computed } from "vue";
import { Promotion, CopyDocument } from "@element-plus/icons-vue";
import { useStudio } from "../composables/useStudio.js";

const { state, generate, cancel, buildPrompt, copy, statusType } = useStudio();

const prompt = computed(() => buildPrompt());
</script>

<template>
  <!-- 生图操作条：固定在中间栏底部 -->
  <div class="proc-bar-card">
    <el-tag :type="statusType()" effect="dark" class="proc-status">{{ state.status.text }}</el-tag>
    <span class="proc-prompt" :title="prompt">
      {{ prompt || "（请先在右侧「基础生图」里填写主体描述）" }}
    </span>
    <el-button link :icon="CopyDocument" :disabled="!prompt" @click="copy(prompt)">复制</el-button>
    <el-button
      type="primary"
      size="large"
      :loading="state.generating"
      :icon="Promotion"
      @click="generate"
    >
      {{ state.generating ? "生成中…" : "开始生成" }}
    </el-button>
    <el-button size="large" :disabled="!state.generating" @click="cancel">取消</el-button>
  </div>
</template>
