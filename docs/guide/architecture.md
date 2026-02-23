# 架构概述

## 设计原则

### 1. 代码即文档

类型系统自解释，命名语义化，避免隐式逻辑。

```typescript
// ✅ 类型即文档
interface Tool {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: ZodSchema;
  execute(input: unknown, ctx: ToolContext): Promise<unknown>;
}
```

### 2. 组合优于继承

通过接口 + 事件总线解耦，避免继承链导致的循环依赖。

```typescript
// ✅ 组合 + 事件总线解耦
class FeishuChannel implements Channel {
  constructor(private eventBus: EventBus) {
    this.eventBus.on('message:outbound', this.send.bind(this));
  }
}
```

### 3. 开放封闭原则

对扩展开放，对修改封闭。使用注册表模式实现插件式扩展。

```typescript
class ToolRegistry {
  private tools = new Map<string, Tool>();
  
  register(tool: Tool): void {
    this.tools.set(tool.name, tool);
  }
}
```

### 4. 轻量化设计

最小依赖，最小抽象，无过度工程。

| 约束 | 阈值 |
|------|------|
| 单文件行数 | ≤ 300 行 |
| 单方法行数 | ≤ 25 行 |
| 方法嵌套层级 | ≤ 3 层 |
| 方法参数 | ≤ 4 个 |

### 5. 本地优先

默认本地存储和隐私保护，无云存储依赖。

| 数据 | 存储 |
|------|------|
| 会话 | JSONL |

## 模块架构

### Core 模块概览

```mermaid
graph LR
    Container[Container<br/>依赖注入]
    EventBus[EventBus<br/>事件总线]
    HookSystem[HookSystem<br/>钩子系统]
    Pipeline[Pipeline<br/>中间件管道]
    
    Container --> EventBus
    Container --> HookSystem
    Container --> Pipeline
```

### 核心模块关系

```mermaid
graph TB
    subgraph 核心层
        Agent[Agent<br/>智能代理]
        Providers[Providers<br/>模型管理]
        Tools[Tool<br/>工具系统]
        Channels[Channel<br/>消息通道]
    end
    
    subgraph 支撑层
        Storage[Storage<br/>存储层]
        Skills[Skill<br/>技能系统]
    end
    
    Agent --> Providers
    Agent --> Tools
    Agent --> Storage
    Agent --> Skills
    Channels --> Agent
```

### 运行时架构

```
App
  └── ChannelGatewayImpl (消息处理枢纽)
        ├── executor: AgentExecutor
        └── getChannels: () => Channel[]
```

### 消息流向

```mermaid
sequenceDiagram
    participant C as Channel
    participant M as MessageBus
    participant G as ChannelGateway
    participant E as AgentExecutor
    participant L as LLM
    
    C->>M: publishInbound()
    M->>G: consumeInbound()
    G->>E: processMessage()
    E->>L: generate()
    L-->>E: response
    E-->>G: response
    G->>C: broadcast() to all Channels
```

### 扩展机制

```mermaid
graph LR
    subgraph Extensions["extensions/"]
        ToolExt[工具扩展]
        SkillExt[技能扩展]
        ChannelExt[通道扩展]
    end
    
    subgraph Core["Core SDK"]
        ToolReg[ToolRegistry]
        SkillLoad[SkillsLoader]
        ChannelMgr[ChannelManager]
    end
    
    ToolExt -->|register| ToolReg
    SkillExt -->|load| SkillLoad
    ChannelExt -->|add| ChannelMgr
```

### 目录结构

```
packages/
├── types/              # L1: 核心类型定义（MCP 兼容）
├── runtime/            # L2: 运行时引擎（Container、EventBus、HookSystem）
├── config/             # L2: 三级配置系统
├── storage/            # L2: 会话存储
├── sdk/                # L3: 聚合 SDK，统一开发接口
├── providers/          # L3: LLM Provider 抽象
├── extension-system/   # L3: 扩展发现、加载、热重载
└── server/             # L4: 服务层（Channel、Queue、Events）
```

### 核心模块说明

| 模块 | 位置 | 职责 |
|------|------|------|
| ChannelGateway | `packages/runtime/src/gateway/` | 消息聚合处理、响应广播、自动重连 |
| AgentExecutor | `packages/runtime/src/executor/` | Agent 执行引擎、工具调用编排 |
| MessageBus | `packages/runtime/src/message/` | 消息队列、入站/出站消息分发 |

## 扩展机制

| 机制 | 用途 | 示例 |
|------|------|------|
| 依赖注入 | 解耦组件 | `container.resolve<ToolRegistry>()` |
| 事件系统 | 松耦合通信 | `eventBus.on('tool:beforeExecute')` |
| 注册表模式 | 动态注册扩展 | `toolRegistry.register(new MyTool())` |
