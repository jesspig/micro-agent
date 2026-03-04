# MicroAgent 开发指南

**MicroAgent** 是基于 Bun + TypeScript 的超轻量级个人 AI 助手框架。所有对话、注释、问答、思考过程等都必须严格使用中文。

---

## 常用命令

```bash
bun run dev       # 开发模式
bun start         # 生产模式
bun test          # 运行测试
bun run typecheck # 类型检查
```

---

## 设计原则

| 优先级 | 原则 |
|--------|------|
| P0 | 单一职责、代码即文档、显式优于隐式 |
| P1 | 失败快速、组合优于继承、开放封闭、依赖倒置 |
| P2 | 接口隔离、最小惊讶 |
| P3 | 轻量化（文件≤300行，方法≤25行，嵌套≤3层）、零技术债务 |

---

## 开发规范

| 类型 | 规范 | 示例 |
|------|------|------|
| 接口/类名 | 帕斯卡命名法 | `UserService` |
| 方法/变量 | 驼峰命名法 | `getUserById` |
| 常量 | 大写蛇形命名法 | `MAX_COUNT` |
| 文件名 | 短横线命名法 | `my-tool.ts` |
| 提交 | `feat/fix/refactor/docs/chore(scope): subject` | |

---

## 关键约束

- **禁止 Node.js API**: 完全使用 Bun API，避免兼容性问题
- **并发控制**: subagent 最大并发数限制为 2，多任务可分批并行

---

## 架构概览

> 更新自: feature/architecture-refactoring (2026-03-04)

### 分层架构

```
Applications (CLI/Web/配置管理/提示词模板)
       │
       ▼ SDK API (配置/提示词通过 API 传入)
Agent Service
├── Interface Layer (IPC 主要 / HTTP 调试可选 / 流式响应)
└── Runtime Layer
    ├── Kernel (Orchestrator/Planner/ExecutionEngine/ContextManager)
    ├── Capability (Tools/MCP Client/Skills/Memory/RAG)
    ├── Provider (LLM/Embedding/VectorDB/Storage)
    └── Infrastructure (Database/Cache/Observability)
```

**架构要点**:

- Agent Service 是纯运行时，不负责认证、多用户管理、配置持久化
- 配置项和提示词模板由 Applications 层管理，通过 SDK API 传入
- IPC 是主要通信方式，HTTP 仅作为可选调试接口

### 技术栈

| 层级 | 技术选型 |
|------|----------|
| 运行时 | Bun + TypeScript 5.9 |
| HTTP/WebSocket | Bun.serve() 内置 |
| 向量数据库 | LanceDB |
| 关系存储 | SQLite (Bun 内置) |
| 日志 | @logtape/logtape |
| Schema 校验 | Zod |
| LLM SDK | Vercel AI SDK (ai) |

### 性能目标

- HTTP QPS: 1000+
- 响应延迟 P95: <500ms
- 流式首字节 TTFT: <1s
- 并发会话: 100+
