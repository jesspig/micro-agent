---
layout: home

hero:
  name: MicroAgent
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
    details: 插件式扩展系统，支持工具、技能、通道扩展，支持热重载
  - title: 本地优先
    details: 默认本地存储，保护用户隐私
  - title: 智能路由
    details: 根据任务类型自动选择合适的模型
  - title: MCP 兼容
    details: 支持 Model Context Protocol 工具接口，易于集成外部工具
  - title: 多协议支持
    details: ACP（IDE集成）、A2A（Agent通信）、MCP（工具接入）

---

## 项目简介

MicroAgent 是一个超轻量级的个人 AI 助手框架，使用 TypeScript 开发，Bun 作为运行时。

### 核心特性

- **依赖注入容器**：轻量级 DI 容器，支持瞬态和单例模式
- **Provider 抽象**：统一的 LLM 提供商接口，支持 OpenAI 兼容 API（Ollama、DeepSeek、GLM、Kimi 等）
- **Agent 执行器**：Function Calling 模式 + ReAct 循环双模式
- **工具系统**：可扩展的工具注册与执行机制，MCP 兼容
- **多通道支持**：CLI、飞书（更多通道开发中）
- **本地存储**：JSONL 会话存储，LanceDB 向量记忆检索
- **技能系统**：基于 SKILL.md 的渐进式技能加载
- **热重载**：扩展开发时支持文件变更自动重载

### 技术栈

- **语言**: TypeScript 5.9
- **运行时**: Bun 1.3+ (不支持 Node.js)
- **依赖注入**: 自研轻量容器
- **配置验证**: Zod
- **日志**: @logtape/logtape

> **注意**：本项目专为 Bun 运行时设计，不支持 Node.js。详见 [快速开始](/guide/)。
