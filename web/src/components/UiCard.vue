<script setup>
import { ref, watch } from "vue";

const props = defineProps({
  title: { type: String, default: "" },
  icon: { type: String, default: "" },
  collapsible: { type: Boolean, default: true },
  /** 初始是否折叠 */
  initCollapsed: { type: Boolean, default: false }
});

const collapsed = ref(props.initCollapsed);
watch(() => props.initCollapsed, (v) => { collapsed.value = v; });

function toggle() {
  if (props.collapsible) collapsed.value = !collapsed.value;
}
</script>

<template>
  <section class="card" :class="{ collapsed: collapsible && collapsed }">
    <div class="card-head" @click="toggle">
      <span class="ico"><slot name="icon">{{ icon }}</slot></span>
      <h2>{{ title }}</h2>
      <span class="spacer"></span>
      <span @click.stop><slot name="actions" /></span>
      <span v-if="collapsible" class="chev">▼</span>
    </div>
    <div class="card-body">
      <slot />
    </div>
  </section>
</template>
