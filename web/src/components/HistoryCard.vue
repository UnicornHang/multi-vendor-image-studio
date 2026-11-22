<script setup>
import { Files, Download, CopyDocument, Delete } from "@element-plus/icons-vue";
import { ElMessage, ElMessageBox } from "element-plus";
import UiCard from "./UiCard.vue";
import { useStudio } from "../composables/useStudio.js";

const { state, download, copy, removeHistory, clearHistory } = useStudio();

function fmtTime(iso) {
  try {
    return new Date(iso).toLocaleString("zh-CN", { hour12: false });
  } catch {
    return iso;
  }
}

async function onClear() {
  try {
    await ElMessageBox.confirm("清空全部历史记录？", "确认", {
      confirmButtonText: "清空",
      cancelButtonText: "取消",
      type: "warning"
    });
  } catch {
    return; // 用户取消
  }
  await clearHistory();
  ElMessage.success("历史记录已清空");
}
</script>

<template>
  <UiCard title="历史记录" :collapsible="false">
    <template #icon><el-icon><Files /></el-icon></template>
    <template #actions>
      <el-button size="small" type="danger" plain @click="onClear">清空历史</el-button>
    </template>

    <div v-if="!state.history.length" class="empty">暂无历史记录</div>

    <template v-else>
      <div v-for="h in state.history" :key="h.id" class="hist-item">
        <el-image
          :src="h.src"
          :preview-src-list="[h.src]"
          preview-teleported
          fit="cover"
          alt="历史图片"
        />
        <div class="hist-meta">
          <div class="p">{{ h.prompt || "(无提示词)" }}</div>
          <div class="t">{{ h.provider }} · {{ h.model }} · {{ fmtTime(h.time) }}</div>
          <div class="hist-actions">
            <el-button size="small" :icon="Download" @click="download(h.src)">下载</el-button>
            <el-button size="small" :icon="CopyDocument" @click="copy(h.src)">复制</el-button>
            <el-button size="small" type="danger" plain :icon="Delete" @click="removeHistory(h.id)">
              删除
            </el-button>
          </div>
        </div>
      </div>
    </template>
  </UiCard>
</template>
