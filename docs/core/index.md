# 核心模块

MicroBot 采用 8 层 Monorepo 架构，核心功能分布在多个模块中。

## 模块列表

| 模块 | 路径 | 说明 |
|------|------|------|
| [Container](container) | `packages/runtime/` | 依赖注入容器 |
| [Provider](provider) | `packages/providers/` | LLM 提供商接口 |
| [Agent](agent) | `packages/runtime/` | Agent 循环实现 |
| [Memory](memory) | `packages/runtime/` | 记忆系统 |
| [Tool](tool) | `packages/types/` + `packages/sdk/` | 工具系统 |
| [Channel](channel) | `extensions/channel/` | 消息通道 |
| [ChannelGateway](channel) | `packages/runtime/src/gateway/` | 消息处理枢纽，负责消息聚合和响应广播 |
| [Storage](storage) | `packages/storage/` | 存储层 |
| [Skill](skill) | `packages/sdk/` | 技能系统 |

## 导出

通过 SDK 聚合模块统一导出：

```typescript
import { Container, EventBus, HookSystem } from '@microbot/sdk';
import { AgentExecutor, ReActAgent } from '@microbot/sdk';
import { MemoryStore, ConversationSummarizer } from '@microbot/sdk';
import { SessionStore } from '@microbot/sdk';
import { ToolRegistry, defineTool } from '@microbot/sdk';
```