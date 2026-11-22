<script setup>
import { ref, computed } from "vue";
import { Setting, EditPen, Picture, Refresh } from "@element-plus/icons-vue";
import UiCard from "./UiCard.vue";
import { useStudio } from "../composables/useStudio.js";

/** 默认展开「生成参数」，其余面板收起 */
const openPanels = ref(["params"]);

const { state, modeObj, cur, optionsWithCustom, pickReference, clearReference, buildPrompt } = useStudio();

const supports = computed(() => modeObj.value?.supports || {});
/* 模型级能力覆盖：同一厂商下不同模型支持的尺寸/质量不同 */
const modelCaps = computed(() => (modeObj.value?.modelCaps || {})[cur.value.model] || {});
const aspectOptions = computed(() =>
  optionsWithCustom(modelCaps.value.aspectOptions || modeObj.value?.aspectOptions, cur.value.aspect, 1)
);
const qualityOptions = computed(() =>
  optionsWithCustom(modelCaps.value.qualities || modeObj.value?.qualities, cur.value.quality)
);
const formatOptions = computed(() =>
  optionsWithCustom(modeObj.value?.responseFormats, cur.value.responseFormat)
);
const negativeOptions = computed(() => modeObj.value?.negativeModes || []);
const aspectLabel = computed(() => modeObj.value?.aspectLabel || "画面比例");
const isCustom = computed(() => state.provider === "custom");
/* 清晰度（分辨率档位）：只在厂商支持时显示 */
const supportsResolution = computed(() => !!modeObj.value?.supports?.resolution);
const resolutionOptions = computed(() =>
  (modeObj.value?.resolutions || []).map((r) => ({ value: r[1], label: r[0] }))
);
const resolutionNote = computed(() => modeObj.value?.resolutionNote || "");
const supportsReference = computed(() => !!modeObj.value?.supports?.reference);

const refPreview = computed(() => state.reference?.dataUrl || "");
const refName = computed(() =>
  state.reference ? `${state.reference.name} · ${(state.reference.size / 1024).toFixed(0)} KB` : ""
);
/* 最终提示词预览（拼接结果） */
const preview = computed(() => buildPrompt() || "（请先填写主体描述）");

/* el-input-number 只认数字，这里做一层代理 */
const nModel = computed({
  get: () => Number(cur.value.n) || 1,
  set: (v) => { cur.value.n = v; }
});
const seedModel = computed({
  get: () => {
    const s = cur.value.seed;
    return s === "" || s === null || s === undefined ? undefined : Number(s);
  },
  set: (v) => { cur.value.seed = v === undefined || v === null ? "" : v; }
});

function randSeed() {
  seedModel.value = Math.floor(Math.random() * 2147483647);
}

function onPick(uploadFile) {
  const f = uploadFile?.raw;
  if (f) pickReference(f);
}
</script>

<template>
  <UiCard title="基础生图">
    <template #icon><el-icon><EditPen /></el-icon></template>

    <el-collapse v-model="openPanels">
      <!-- ============ 生成参数 ============ -->
      <el-collapse-item name="params">
        <template #title>
          <el-icon><Setting /></el-icon>
          <span class="panel-title">生成参数</span>
        </template>

        <div class="row c2">
          <div class="field">
            <label>{{ aspectLabel }}</label>
            <el-select v-model="cur.aspect" filterable allow-create default-first-option>
              <el-option v-for="o in aspectOptions" :key="o.value" :label="o.label" :value="o.value" />
            </el-select>
          </div>
          <div class="field">
            <label>生成数量 n</label>
            <el-input-number v-model="nModel" :min="1" :max="9" controls-position="right" />
          </div>
        </div>

        <div class="field" v-if="supportsResolution">
          <label>
            清晰度 resolution
            <span class="hint">{{ resolutionNote }}</span>
          </label>
          <el-select v-model="cur.resolution" clearable placeholder="默认（厂商推荐）">
            <el-option v-for="o in resolutionOptions" :key="o.value" :label="o.label" :value="o.value" />
          </el-select>
        </div>

        <div class="row c2">
          <div class="field" :class="{ hidden: !supports.quality }">
            <label>质量 quality</label>
            <el-select v-model="cur.quality" filterable allow-create default-first-option>
              <el-option v-for="o in qualityOptions" :key="o.value" :label="o.label" :value="o.value" />
            </el-select>
          </div>
          <div class="field" :class="{ hidden: !supports.responseFormat }">
            <label>返回格式 response_format</label>
            <el-select v-model="cur.responseFormat">
              <el-option v-for="o in formatOptions" :key="o.value" :label="o.label" :value="o.value" />
            </el-select>
          </div>
        </div>

        <div class="row c2">
          <div class="field" :class="{ hidden: !supports.seed }">
            <label>随机种子 seed</label>
            <div class="inline">
              <el-input-number v-model="seedModel" :controls="false" :min="0" placeholder="留空 = 随机" />
              <el-button :icon="Refresh" title="随机种子" @click="randSeed" />
            </div>
          </div>
          <div class="field" :class="{ hidden: !supports.optimizer }">
            <label>提示词优化</label>
            <el-checkbox v-model="cur.optimizer">prompt_optimizer</el-checkbox>
          </div>
        </div>

        <div class="field" :class="{ hidden: negativeOptions.length === 0 }">
          <label>负向提示词处理方式</label>
          <el-select v-model="cur.negativeMode">
            <el-option v-for="o in negativeOptions" :key="o[0]" :label="o[1]" :value="o[0]" />
          </el-select>
        </div>

        <div class="field">
          <label>附加自定义参数 <span class="hint">JSON 对象，合并进请求体</span></label>
          <el-input
            v-model="cur.extraJson"
            type="textarea"
            :rows="2"
            class="code"
            spellcheck="false"
            placeholder='{"width": 1024}'
          />
        </div>

        <div class="subcard" v-show="isCustom">
          <div class="field">
            <label>
              请求体模板
              <span class="hint" v-pre>占位符：{{model}} {{prompt}} {{negative}} {{aspect}} {{n}} {{seed}} {{quality}} {{refBase64}}</span>
            </label>
            <el-input v-model="cur.bodyTemplate" type="textarea" :rows="4" class="code" spellcheck="false" />
          </div>
          <div class="field">
            <label>
              响应取值路径
              <span class="hint">如 data.image_urls / data[].url / predictions[].bytesBase64Encoded</span>
            </label>
            <el-input v-model="cur.respPath" spellcheck="false" />
          </div>
        </div>
      </el-collapse-item>

      <!-- ============ 画面描述 ============ -->
      <el-collapse-item name="prompt">
        <template #title>
          <el-icon><EditPen /></el-icon>
          <span class="panel-title">画面描述</span>
        </template>

        <div class="field">
          <label>
            主体描述 <span class="hint">必填</span>
            <span class="spacer-flex"></span>
            <span class="char-count">{{ state.prompt.main.length }}</span>
          </label>
          <el-input
            v-model="state.prompt.main"
            type="textarea"
            :rows="3"
            spellcheck="false"
            placeholder="例：一位穿白色风衣的女孩站在雨夜的东京街头，霓虹灯牌倒映在积水里"
          />
        </div>

        <div class="field">
          <label>
            风格
            <span class="spacer-flex"></span>
            <span class="char-count">{{ state.prompt.style.length }}</span>
          </label>
          <el-input v-model="state.prompt.style" type="textarea" :rows="2" spellcheck="false" placeholder="例：赛博朋克电影感，35mm 胶片质感，浅景深" />
        </div>

        <div class="field">
          <label>
            场景与细节
            <span class="spacer-flex"></span>
            <span class="char-count">{{ state.prompt.detail.length }}</span>
          </label>
          <el-input v-model="state.prompt.detail" type="textarea" :rows="2" spellcheck="false" placeholder="例：湿漉漉的柏油路面、便利店自动门、飘动的伞" />
        </div>

        <div class="field">
          <label>
            光影与色调
            <span class="spacer-flex"></span>
            <span class="char-count">{{ state.prompt.light.length }}</span>
          </label>
          <el-input v-model="state.prompt.light" type="textarea" :rows="2" spellcheck="false" placeholder="例：冷蓝主调 + 洋红霓虹补光，体积光，高对比" />
        </div>

        <div class="field">
          <label>
            构图与镜头
            <span class="spacer-flex"></span>
            <span class="char-count">{{ state.prompt.cam.length }}</span>
          </label>
          <el-input v-model="state.prompt.cam" type="textarea" :rows="2" spellcheck="false" placeholder="例：低机位仰拍，居中构图，50mm" />
        </div>

        <div class="field">
          <label>
            负向提示词
            <span class="spacer-flex"></span>
            <span class="char-count">{{ state.prompt.negative.length }}</span>
          </label>
          <el-input v-model="state.prompt.negative" type="textarea" :rows="2" spellcheck="false" placeholder="例：低分辨率，文字水印，多余手指，畸变" />
        </div>

        <div class="field">
          <label>最终提示词预览 <span class="hint">按顺序拼接</span></label>
          <div class="preview-box">{{ preview }}</div>
        </div>
      </el-collapse-item>

      <!-- ============ 参考图 ============ -->
      <el-collapse-item v-if="supportsReference" name="reference">
        <template #title>
          <el-icon><Picture /></el-icon>
          <span class="panel-title">参考图</span>
        </template>

        <div class="notice info">
          MiniMax 使用 <code>subject_reference</code>；自定义模式下会注入 <code v-pre>{{refBase64}}</code>。
        </div>

        <div class="field">
          <label>参考图类型</label>
          <el-select v-model="state.refType">
            <el-option label="character（保持主体一致）" value="character" />
            <el-option label="general（风格参考）" value="general" />
          </el-select>
        </div>

        <div class="field">
          <label>上传参考图</label>
          <el-upload :auto-upload="false" :show-file-list="false" accept="image/*" :on-change="onPick">
            <el-button>选择图片</el-button>
          </el-upload>
          <span class="hint">{{ refName }}</span>
        </div>

        <div v-show="refPreview">
          <div class="ref-preview">
            <el-image :src="refPreview" :preview-src-list="[refPreview]" preview-teleported fit="contain" />
            <el-button class="rm" size="small" type="danger" @click="clearReference">移除</el-button>
          </div>
        </div>
      </el-collapse-item>
    </el-collapse>
  </UiCard>
</template>
