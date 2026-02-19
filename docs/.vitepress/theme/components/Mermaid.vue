<script setup lang="ts">
import { ref, onMounted } from 'vue';

const props = defineProps<{
  code: string;
  encoding?: string;
}>();

const svg = ref('');
const error = ref('');

function decodeCode(): string {
  if (props.encoding === 'base64') {
    // base64 解码
    return decodeURIComponent(escape(atob(props.code)));
  }
  // 默认 URL 解码
  return decodeURIComponent(props.code);
}

onMounted(async () => {
  try {
    const mermaid = await import('mermaid');
    mermaid.default.initialize({
      startOnLoad: false,
      theme: 'dark',
    });
    const decodedCode = decodeCode();
    const { svg: renderedSvg } = await mermaid.default.render(
      `mermaid-${Math.random().toString(36).substring(7)}`,
      decodedCode
    );
    svg.value = renderedSvg;
  } catch (e) {
    error.value = String(e);
  }
});
</script>

<template>
  <div class="mermaid-container">
    <div v-if="error" class="mermaid-error">{{ error }}</div>
    <div v-else-if="svg" class="mermaid-chart" v-html="svg"></div>
    <div v-else class="mermaid-loading">加载中...</div>
  </div>
</template>

<style scoped>
.mermaid-container {
  margin: 16px 0;
}

.mermaid-chart {
  display: flex;
  justify-content: center;
  overflow-x: auto;
}

.mermaid-error {
  color: #ff6b6b;
  padding: 16px;
  background: rgba(255, 107, 107, 0.1);
  border-radius: 8px;
}

.mermaid-loading {
  color: #888;
  padding: 16px;
  text-align: center;
}
</style>
