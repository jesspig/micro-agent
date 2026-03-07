# 核心模块

MicroAgent 采用分层架构，核心功能分布在多个模块中。

## 架构概览

```
Applications (CLI/Web/配置管理/提示词模板)
       │
       ▼ SDK API (配置/提示词通过 API 传入)
Agent Service
├── Interface Layer (IPC/HTTP/流式响应)
└── Runtime Layer
    ├── Kernel (Orchestrator/Planner/ExecutionEngine/ContextManager)
    ├── Capability (Tools/MCP Client/Skills/Memory/RAG)
    ├── Provider (LLM/Embedding/VectorDB/Storage)
    └── Infrastructure (Database/Cache/Observability)
```

## 核心模块

| 模块 | 路径 | 说明 |
|------|------|------|
| [Types](/core/) | `agent-service/types/` | 核心类型定义（MCP 兼容） |
| [Runtime](/core/) | `agent-service/runtime/` | 运行时引擎 |
| [SDK](/api/) | `sdk/` | 开发者 SDK |
| [Container](container) | `agent-service/runtime/infrastructure/` | 依赖注入容器 |
| [Provider](provider) | `agent-service/runtime/provider/` | LLM 提供商接口 |
| [Agent](agent) | `agent-service/runtime/kernel/` | Agent 编排器 |
| [Memory](memory) | `agent-service/runtime/capability/memory/` | 记忆系统 |
| [Tool](tool) | `agent-service/runtime/capability/tool-system/` | 工具系统 |
| [Skill](skill) | `agent-service/runtime/capability/skill-system/` | 技能系统 |
| [Knowledge](/core/) | `agent-service/runtime/capability/knowledge/` | 知识库系统 |
| [Storage](storage) | `agent-service/runtime/infrastructure/database/` | 存储层 |
| [Channel](channel) | `extensions/channel/` | 消息通道 |

## 快速开始

### SDK 客户端

```typescript
import { createClient } from '@micro-agent/sdk';

const client = createClient({
  transport: 'ipc',
});

const response = await client.chat.send({
  sessionId: 'default',
  content: '你好！',
});
```

### 工具定义

```typescript
import { defineTool } from '@micro-agent/sdk';

const myTool = defineTool({
  name: 'my_tool',
  description: '我的自定义工具',
  inputSchema: {
    type: 'object',
    properties: {
      input: { type: 'string' },
    },
  },
  execute: async (input, context) => {
    return { result: `处理: ${input.input}` };
  },
});
```

### 运行时组件

```typescript
import {
  ContainerImpl,
  EventBus,
  ToolRegistry,
  MemoryManager,
} from '@micro-agent/runtime';

// 创建容器
const container = new ContainerImpl();

// 注册组件
container.singleton('toolRegistry', () => new ToolRegistry());

// 解析依赖
const tools = container.resolve<ToolRegistry>('toolRegistry');
```