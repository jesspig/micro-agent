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
| 记忆 | SQLite |
| 定时任务 | SQLite |

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
        Services[Service<br/>后台服务]
    end
    
    Agent --> Providers
    Agent --> Tools
    Agent --> Storage
    Agent --> Skills
    Channels --> Agent
    Services --> Storage
```

### 消息流向

```mermaid
sequenceDiagram
    participant User as 用户
    participant Channel as 通道
    participant EventBus as 事件总线
    participant Agent as Agent
    participant Provider as LLM
    
    User->>Channel: 发送消息
    Channel->>EventBus: publishInbound
    EventBus->>Agent: consume
    Agent->>Provider: chat
    Provider-->>Agent: response
    Agent->>EventBus: publishOutbound
    EventBus->>Channel: send
    Channel-->>User: 返回响应
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
packages/core/src/
├── container.ts        # 依赖注入容器
├── event-bus.ts        # 事件总线
├── hook-system.ts      # 钩子系统
├── pipeline.ts         # 中间件管道
├── agent/              # Agent 模块
│   ├── loop.ts        # ReAct 循环
│   ├── context.ts     # 上下文构建
│   └── subagent.ts    # 子代理管理
├── providers/          # LLM 提供商
│   ├── base.ts        # Provider 接口
│   ├── gateway.ts     # 模型网关
│   └── router.ts      # 智能路由
├── tool/               # 工具系统
│   ├── registry.ts    # 工具注册表
│   └── base.ts        # 工具基类
├── channel/            # 消息通道
│   ├── base.ts        # 通道接口
│   └── manager.ts     # 通道管理器
├── storage/            # 存储层
│   ├── session/       # 会话存储
│   ├── memory/        # 记忆存储
│   └── cron/          # 定时任务存储
├── skill/              # 技能系统
│   └── loader.ts      # 技能加载器
└── service/            # 服务
    ├── cron/          # 定时任务服务
    └── heartbeat/    # 心跳服务
```

## 扩展机制

| 机制 | 用途 | 示例 |
|------|------|------|
| 依赖注入 | 解耦组件 | `container.resolve<ToolRegistry>()` |
| 事件系统 | 松耦合通信 | `eventBus.on('tool:beforeExecute')` |
| 注册表模式 | 动态注册扩展 | `toolRegistry.register(new MyTool())` |
