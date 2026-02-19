import DefaultTheme from 'vitepress/theme';
import { h } from 'vue';
import type { Theme } from 'vitepress';
import Mermaid from './components/Mermaid.vue';
import './custom.css';

export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    // 注册 Mermaid 组件
    app.component('Mermaid', Mermaid);
  },
  Layout() {
    return h(DefaultTheme.Layout, null, {});
  },
} as Theme;
