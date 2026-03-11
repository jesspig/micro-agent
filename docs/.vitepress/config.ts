import { defineConfig } from 'vitepress';

export default defineConfig({
  title: 'MicroAgent',
  description: '超轻量级个人 AI 助手框架',
  base: '/micro-agent/',
  appearance: 'dark',
  lastUpdated: true,
  cleanUrls: true,
  head: [
    ['link', { rel: 'icon', href: '/favicon.ico' }],
  ],
  themeConfig: {
    logo: '/micro-agent-logo.png',
    siteTitle: 'MicroAgent',
    nav: [
      { text: '更新日志', link: '/guide/changelog/' },
    ],
    sidebar: {
      '/guide/changelog/': [
        {
          text: '更新日志',
          items: [
            { text: '版本列表', link: '/guide/changelog/' },
            { text: 'v0.4.0 (重构中)', link: '/guide/changelog/v0.4.0' },
            { text: 'v0.3.0', link: '/guide/changelog/v0.3.0' },
            { text: 'v0.2.2', link: '/guide/changelog/v0.2.2' },
            { text: 'v0.2.1', link: '/guide/changelog/v0.2.1' },
            { text: 'v0.2.0', link: '/guide/changelog/v0.2.0' },
            { text: 'v0.1.1', link: '/guide/changelog/v0.1.1' },
            { text: 'v0.1.0', link: '/guide/changelog/v0.1.0' },
          ],
        },
      ],
    },
    socialLinks: [
      { icon: 'github', link: 'https://github.com/jesspig/micro-agent' },
    ],
    footer: {
      message: '基于 MIT 许可证开源',
      copyright: 'Copyright © 2024-present jesspig',
    },
    search: {
      provider: 'local',
    },
    outline: {
      level: [2, 3],
      label: '目录',
    },
  },
});