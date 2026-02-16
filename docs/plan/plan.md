# microbot 实施计划

**项目**: microbot - Bun + TypeScript AI 助手框架  
**日期**: 2026-02-16  
**基于**: specs/main/spec.md

## 概述

本项目使用 **Bun + pnpm + TypeScript** 复刻 Python 项目 nanobot，打造超轻量级个人 AI 助手框架。

## 技术上下文

| 属性 | 值 |
|------|-----|
| **语言/版本** | TypeScript 5.0+ |
| **运行时** | Bun ^1.3.9 |
| **包管理** | pnpm ^10.0.0 |
| **LLM SDK** | Vercel AI SDK ^6.0.86 |
| **数据库** | Bun SQLite（内置） |
| **日志** | pino ^10.3.1 |
| **验证** | Zod ^4.3.6 |
| **测试** | Bun test |
| **目标平台** | Node.js/Bun 服务器 |

## 宪法合规检查

| 原则 | 状态 | 说明 |
|------|------|------|
| I. 代码即文档 | ✅ | TypeScript 类型自解释，严格命名规范 |
| II. 组合优于继承 | ✅ | 接口 + DI + 事件总线架构 |
| III. 开放封闭原则 | ✅ | Registry 模式支持扩展 |
| IV. 轻量化设计 | ✅ | 单文件 ≤300 行，单方法 ≤25 行 |
| V. 本地优先 | ✅ | Ollama/LM Studio/vLLM 默认支持 |

## 项目结构

### 文档结构

```
docs/
├── plan/
│   ├── plan.md                    # 主计划文档（本文件）
│   ├── phase-1-infrastructure.md  # 阶段1：基础设施
│   ├── phase-2-events.md          # 阶段2：事件系统
│   ├── phase-3-storage.md         # 阶段3：存储层
│   ├── phase-4-tools.md           # 阶段4：工具系统
│   ├── phase-5-provider.md        # 阶段5：LLM Provider
│   ├── phase-6-agent.md           # 阶段6：Agent 核心
│   ├── phase-7-channels.md        # 阶段7：通道系统
│   ├── phase-8-services.md        # 阶段8：服务层
│   └── phase-9-cli.md             # 阶段9：入口 & CLI
```

### 源码结构

```
src/
├── types/
│   └── interfaces.ts        # 核心接口定义（零依赖）
├── container.ts             # DI 容器
├── event-bus.ts             # 事件总线
├── hook-system.ts           # 钩子系统
├── pipeline.ts              # 中间件管道
├── utils/
│   └── logger.ts            # 日志工具
├── config/
│   ├── schema.ts            # 配置 Schema
│   └── loader.ts            # 配置加载器
├── db/
│   └── manager.ts           # 数据库管理器
├── bus/
│   ├── events.ts            # 消息事件类型
│   └── queue.ts             # 消息队列
├── session/
│   └── store.ts             # 会话存储
├── memory/
│   └── store.ts             # 记忆存储
├── cron/
│   ├── store.ts             # Cron 存储
│   └── service.ts           # Cron 服务
├── heartbeat/
│   └── service.ts           # Heartbeat 服务
├── tools/
│   ├── base.ts              # 工具基类
│   ├── registry.ts          # 工具注册表
│   ├── filesystem.ts        # 文件系统工具
│   ├── shell.ts             # Shell 工具
│   ├── web.ts               # Web 工具
│   └── message.ts           # 消息工具
├── providers/
│   ├── base.ts              # Provider 基类
│   ├── ollama.ts            # Ollama Provider
│   ├── lm-studio.ts         # LM Studio Provider
│   ├── vllm.ts              # vLLM Provider
│   ├── openai-compatible.ts # OpenAI Compatible
│   ├── gateway.ts           # LLM Gateway
│   └── registry.ts          # Provider 注册表
├── agent/
│   ├── context.ts           # 上下文构建
│   ├── loop.ts              # Agent 循环
│   └── subagent.ts          # 子代理管理器
├── channels/
│   ├── base.ts              # 通道接口
│   ├── manager.ts           # 通道管理器
│   ├── feishu.ts            # 飞书通道
│   ├── qq.ts                # QQ 通道
│   ├── email.ts             # 邮箱通道
│   ├── dingtalk.ts          # 钉钉通道
│   └── wecom.ts             # 企业微信通道
├── skills/
│   ├── loader.ts            # 技能加载器
│   ├── time.ts              # 时间技能
│   └── sysinfo.ts           # 系统信息技能
├── cli.ts                   # CLI 命令
└── index.ts                 # 入口

tests/
├── unit/
├── integration/
└── e2e/
```

## 实施阶段

### 依赖关系图

```
阶段 1（基础设施）
    │
    ├──► 阶段 2（事件系统）
    │         │
    │         └──► 阶段 3（存储层）
    │                   │
    │                   └──► 阶段 4（工具系统）
    │                             │
    │                             └──► 阶段 6（Agent）
    │                                       │
    └──► 阶段 5（Provider）─────────────────┘
                    │
                    └──► 阶段 7（通道）
                              │
                              └──► 阶段 8（服务）
                                        │
                                        └──► 阶段 9（入口）
```

### 阶段概览

| 阶段 | 名称 | 依赖 | 关键产出 |
|------|------|------|----------|
| 1 | 基础设施 | 无 | logger, config, container, db |
| 2 | 事件系统 | 阶段1 | event-bus, hook-system, pipeline, message-queue |
| 3 | 存储层 | 阶段2 | session-store, memory-store, cron-store |
| 4 | 工具系统 | 阶段3 | tool-registry, filesystem, shell, web, message |
| 5 | LLM Provider | 阶段1 | ollama, lm-studio, vllm, gateway, provider-registry |
| 6 | Agent 核心 | 阶段4,5 | agent-loop, context-builder, subagent |
| 7 | 通道系统 | 阶段5 | feishu, qq, email, dingtalk, wecom |
| 8 | 服务层 | 阶段7 | cron-service, heartbeat-service, skills-loader |
| 9 | 入口 & CLI | 阶段8 | cli, index |

## 里程碑

| 里程碑 | 阶段 | 交付物 | 验收标准 |
|--------|------|--------|----------|
| M1 | 1-2 | 基础设施 + 事件系统 | 可运行的基础框架，配置加载正常 |
| M2 | 3-4 | 存储层 + 工具系统 | SQLite 读写正常，工具可执行 |
| M3 | 5-6 | Provider + Agent | 可与 LLM 交互，ReAct 循环正常 |
| M4 | 7-8 | 通道 + 服务 | 至少一个通道可用，Cron 正常调度 |
| M5 | 9 | CLI + 入口 | 完整 CLI 可用，服务可启动 |

## 复杂度跟踪

| 违规项 | 原因 | 拒绝简化替代方案的理由 |
|--------|------|----------------------|
| 无 | - | - |

## 风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| Bun API 变更 | 高 | 锁定 Bun 版本，关注 changelog |
| Vercel AI SDK 升级 | 中 | 使用稳定 API，避免实验性功能 |
| 通道 SDK 兼容性 | 中 | 使用官方 SDK，封装适配层 |
| 循环依赖 | 高 | 严格接口隔离，依赖方向检查 |

## 参考资料

- [nanobot (Python)](https://github.com/HKUDS/nanobot)
- [Vercel AI SDK](https://ai-sdk.dev/)
- [Bun SQLite](https://bun.sh/docs/api/sqlite)
- [飞书开放平台](https://open.feishu.cn/)
