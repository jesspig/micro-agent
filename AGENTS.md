# MicroAgent 开发指南

**MicroAgent** 是基于 Bun + TypeScript 的超轻量级个人 AI 助手框架。所有对话、注释、问答、思考过程等都必须严格使用中文。

---

## 目录

- [常用命令](#常用命令)
- [设计原则](#设计原则)
- [开发规范](#开发规范)
- [关键约束](#关键约束)
- [架构概览](#架构概览)

---

## 常用命令

| 命令 | 用途 |
|------|------|
| `bun run dev` | 开发模式 |
| `bun start` | 生产模式 |
| `bun test` | 运行测试 |
| `bun run typecheck` | 类型检查 |

---

## 设计原则

| 优先级 | 原则 | 说明 |
|--------|------|------|
| P0 | 单一职责、代码即文档、显式优于隐式 | 所有代码必须遵循 |
| P1 | 失败快速、组合优于继承、开放封闭、依赖倒置 | 架构设计重点 |
| P2 | 接口隔离、最小惊讶 | API 设计重点 |
| P3 | 轻量化、零技术债务 | 代码质量保障 |

**轻量化标准**: 文件 ≤300 行，方法 ≤25 行，嵌套 ≤3 层

---

## 开发规范

### 命名规范

| 类型 | 规范 | 示例 |
|------|------|------|
| 接口/类名 | 帕斯卡命名法 | `UserService` |
| 方法/变量 | 驼峰命名法 | `getUserById` |
| 常量 | 大写蛇形命名法 | `MAX_COUNT` |
| 文件名 | 短横线命名法 | `user-service.ts` |

### 提交规范

```
<type>(<scope>): <subject>

type: feat | fix | refactor | docs | chore
scope: 可选，模块名称
subject: 简短描述，动词原形开头，首字母小写
```

---

## 关键约束

### 技术约束

- **禁止 Node.js API**: 完全使用 Bun API，避免兼容性问题

### 并发控制

- **subagent 并发上限**: 单批次最多 2 个 subagent 并行
- **复杂任务策略**: 必须拆分为独立子任务，多批次并行执行，优先最大化批次数量

---

## 架构概览

### 分层架构

```
┌─────────────────────────────────────────────────────────┐
│  Applications                                            │
│  (CLI / Web / 配置管理 / 提示词模板 / 第三方扩展)         │
└─────────────────────┬───────────────────────────────────┘
                      │ 单向依赖
                      ▼
┌─────────────────────────────────────────────────────────┐
│  SDK                                                     │
│  (高级封装 / 增强能力 / 扩展接口)                         │
└─────────────────────┬───────────────────────────────────┘
                      │ 单向依赖
                      ▼
┌─────────────────────────────────────────────────────────┐
│  Agent Service                                           │
│  ┌─────────────────────────────────────────────────┐    │
│  │ Interface Layer                                 │    │
│  │ (Runtime 能力暴露 / IPC/HTTP/Streaming 通信)    │    │
│  └─────────────────────────��───────────────────────┘    │
│  ┌─────────────────────────────────────────────────┐    │
│  │ Runtime Layer                                    │    │
│  │ ├─ Kernel (Orchestrator/Planner/Execution/CTX)  │    │
│  │ ├─ Capability (Tools/MCP/Skills/Memory/RAG)     │    │
│  │ ├─ Provider (LLM/Embedding/VectorDB/Storage)    │    │
│  │ └─ Infrastructure (Database/Cache/Logging)      │    │
│  └─────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────┘
```

### 分层职责

| 层级 | 定位 | 职责 |
|------|------|------|
| **Agent Service** | 纯运行时 | 提供精简完备的 Agent 运行能力，不含高级功能 |
| **SDK** | 高级封装 | 对 Agent Service 进行增强封装，提供扩展能力 |
| **Applications** | 上层应用 | 基于 SDK 开发 Agent 应用，可引入第三方库 |

### Agent Service 内部层级

| 层级 | 职责 |
|------|------|
| **Interface Layer** | 向上暴露 Runtime 底层结构（Kernel/Capability/Provider/Infrastructure），提供 IPC/HTTP/Streaming 通信接口 |
| **Runtime Layer** | 核心 Agent 运行能力，包含 Kernel、Capability、Provider、Infrastructure |

### 依赖规则

- **单向依赖**: Applications → SDK → Agent Service，绝对禁止反向依赖
- **项目隔离**: Agent Service 与 Applications 虽同属一个主项目管理，但为独立项目，必须严格隔离
- **访问限制**: Applications 禁止直接访问 Agent Service，必须通过 SDK 间接调用
- **扩展自由**: Applications 可自由组合 SDK 能力并引入第三方库

### 技术栈

| 类别 | 选型 |
|------|------|
| 运行时 | Bun + TypeScript 5.9 |
| 网络 | Bun.serve() 内置 |
| 存储 | SQLite + LanceDB |
| 日志 | @logtape/logtape |
| 校验 | Zod |
| LLM | Vercel AI SDK |

### 性能目标

| 指标 | 目标值 |
|------|--------|
| HTTP QPS | 1000+ |
| 响应延迟 P95 | <500ms |
| 流式首字节 TTFT | <1s |
| 并发会话 | 100+ |
