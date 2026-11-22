<script setup>
import { computed } from "vue";
import { useAgent } from "../../composables/useAgent.js";
import { useStudio } from "../../composables/useStudio.js";

const { state, busy, refine, applyRefine } = useAgent();
const studio = useStudio();

/** 当前有没有可复盘的结果 */
const hasResult = computed(() => (studio.state.result?.items || []).length > 0);
</script>

<template>
  <div class="notice info">
    复盘会把<strong>当前生成的图片</strong>连同提示词一起交给 Agent，
    指出问题并给出一版改好的提示词。需要模型支持视觉输入。
  </div>

  <el-button
    type="primary"
    :loading="busy === 'refine'"
    :disabled="!hasResult"
    @click="refine()"
  >
    {{ hasResult ? "复盘当前结果" : "先生成一张图再来复盘" }}
  </el-button>

  <template v-if="state.refine">
    <div class="refine-block">
      <div class="lib-title">总体评价</div>
      <div class="sb-desc">{{ state.refine.critique }}</div>
    </div>

    <div v-if="state.refine.issues?.length" class="refine-block">
      <div class="lib-title">具体问题</div>
      <ul class="issue-list">
        <li v-for="(it, i) in state.refine.issues" :key="i">{{ it }}</li>
      </ul>
    </div>

    <div v-if="state.refine.notes" class="notice info">{{ state.refine.notes }}</div>

    <el-button type="primary" plain @click="applyRefine()">应用修改建议</el-button>
    <div class="hint">应用后会替换表单里的画面描述与参数，仍然可以再手工微调。</div>
  </template>
</template>
