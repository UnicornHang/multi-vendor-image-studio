<script setup>
import { computed } from "vue";
import { PictureFilled, Download, CopyDocument, Loading } from "@element-plus/icons-vue";
import UiCard from "./UiCard.vue";
import { useStudio } from "../composables/useStudio.js";

const { state, download, copy } = useStudio();

const items = computed(() => state.result?.items || []);
const meta = computed(() => state.result?.meta || "等待生成");
const isError = computed(() => !!state.result?.error);
</script>

<template>
  <UiCard title="生成结果" :collapsible="false">
    <template #icon><el-icon><PictureFilled /></el-icon></template>
    <template #actions>
      <el-tag size="small" effect="plain">{{ meta }}</el-tag>
    </template>

    <div v-if="items.length" class="grid-imgs">
      <div v-for="(it, i) in items" :key="i" class="img-cell">
        <el-image
          :src="it.src"
          :preview-src-list="[it.src]"
          preview-teleported
          fit="contain"
          :alt="'生成结果 ' + (i + 1)"
        >
          <template #error>
            <div class="img-err">图片加载失败</div>
          </template>
          <template #placeholder>
            <div class="img-err"><el-icon class="is-loading"><Loading /></el-icon></div>
          </template>
        </el-image>
        <div class="tools">
          <el-button size="small" :icon="Download" @click.stop="download(it.src)">下载</el-button>
          <el-button size="small" :icon="CopyDocument" @click.stop="copy(it.src)">复制</el-button>
        </div>
      </div>
    </div>

    <div v-else class="empty">
      <div class="big">{{ isError ? "⚠️" : state.generating ? "⏳" : "✨" }}</div>
      <div v-if="state.generating">正在生成，请稍候…</div>
      <div v-else-if="isError">{{ state.result.meta }}</div>
      <div v-else>还没有结果。填写右侧描述后点击「开始生成」。</div>
    </div>
  </UiCard>
</template>
