---
layout: home

hero:
  name: MicroBot
  text: 超轻量级个人 AI 助手框架
  tagline: 基于 TypeScript + Bun 构建的现代化 AI 助手框架
  actions:
    - theme: brand
      text: 快速开始
      link: /guide/
    - theme: alt
      text: 查看文档
      link: /core/

features:
  - title: 轻量级
    details: 极简设计，无过度抽象，最小化依赖
  - title: 可扩展
    details: 插件式扩展系统，支持工具、技能、通道扩展
  - title: 本地优先
    details: 默认本地存储，保护用户隐私
  - title: 智能路由
    details: 根据任务复杂度自动选择合适的模型
---

## 项目简介

MicroBot 是一个超轻量级的个人 AI 助手框架，使用 TypeScript 开发，Bun 作为运行时。

### 核心特性

- **依赖注入容器**：轻量级 DI 容器，支持瞬态和单例模式
- **Provider 抽象**：统一的 LLM 提供商接口，支持 OpenAI 兼容 API
- **ReAct Agent**：基于思考-行动模式的智能代理
- **工具系统**：可扩展的工具注册与执行机制
- **多通道支持**：支持飞书等多种消息通道
- **本地存储**：JSONL 格式的会话存储，SQLite 记忆存储
- **技能系统**：基于 SKILL.md 的渐进式技能加载

### 技术栈

- **语言**: TypeScript
- **运行时**: Bun
- **依赖注入**: 自研轻量容器
- **配置验证**: Zod
- **LLM SDK**: Vercel AI SDK
- **日志**: @logtape/logtape
