import { defineConfig } from 'vitepress';
import { mermaidPlugin } from './mermaid-plugin';

export default defineConfig({
  title: 'MicroBot',
  description: '超轻量级个人 AI 助手框架',
  base: '/microbot/',
  appearance: 'dark',
  lastUpdated: true,
  cleanUrls: true,
  head: [
    ['link', { rel: 'icon', href: '/favicon.ico' }],
  ],
  markdown: {
    config: (md) => {
      md.use(mermaidPlugin);
    },
  },
  themeConfig: {
    logo: '/logo.svg',
    siteTitle: 'MicroBot',
    nav: [
      { text: '指南', link: '/guide/' },
      { text: '核心模块', link: '/core/' },
      { text: '扩展', link: '/extensions/' },
      { text: '配置', link: '/config/' },
      { text: 'API', link: '/api/' },
    ],
    sidebar: {
      '/guide/': [
        {
          text: '指南',
          items: [
            { text: '快速开始', link: '/guide/' },
            { text: '架构概述', link: '/guide/architecture' },
            { text: '核心概念', link: '/guide/concepts' },
            { text: '更新日志', link: '/guide/changelog' },
          ],
        },
      ],
      '/core/': [
        {
          text: '核心模块',
          items: [
            { text: 'Container', link: '/core/container' },
            { text: 'Provider', link: '/core/provider' },
            { text: 'Agent', link: '/core/agent' },
            { text: 'Tool', link: '/core/tool' },
            { text: 'Channel', link: '/core/channel' },
            { text: 'Storage', link: '/core/storage' },
            { text: 'Skill', link: '/core/skill' },
            { text: 'Service', link: '/core/service' },
          ],
        },
      ],
      '/extensions/': [
        {
          text: '扩展',
          items: [
            { text: '概述', link: '/extensions/' },
            { text: '工具扩展', link: '/extensions/tools' },
            { text: '技能扩展', link: '/extensions/skills' },
            { text: '通道扩展', link: '/extensions/channels' },
          ],
        },
      ],
      '/config/': [
        {
          text: '配置',
          items: [
            { text: '配置指南', link: '/config/' },
          ],
        },
      ],
      '/api/': [
        {
          text: 'API 参考',
          items: [
            { text: 'API 概览', link: '/api/' },
          ],
        },
      ],
    },
    socialLinks: [
      { icon: 'github', link: 'https://github.com/jesspig/microbot' },
    ],
    footer: {
      message: '基于 MIT 许可证开源',
      copyright: 'Copyright © 2024-present jesspig',
    },
    search: {
      provider: 'local',
    },
  },
  vite: {
    resolve: {
      alias: {
        '@': '/src',
      },
    },
  },
});