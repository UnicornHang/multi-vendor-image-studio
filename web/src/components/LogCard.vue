<script setup>
import { Document } from "@element-plus/icons-vue";
import UiCard from "./UiCard.vue";
import { useStudio } from "../composables/useStudio.js";

const { state } = useStudio();
</script>

<template>
  <UiCard title="运行日志" init-collapsed>
    <template #icon><el-icon><Document /></el-icon></template>

    <div class="log">
      <div v-for="(l, i) in state.logs" :key="i">
        <span class="t">[{{ l.t }}]</span> <span :class="l.kind">{{ l.msg }}</span>
      </div>
      <div v-if="!state.logs.length" class="t">（暂无日志）</div>
    </div>
  </UiCard>
</template>
