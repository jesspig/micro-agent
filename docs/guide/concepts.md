# 核心概念

## 整体流程

### 消息生命周期

```mermaid
sequenceDiagram
    participant User as 用户
    participant Channel as 通道
    participant Gateway as ChannelGateway
    participant Bus as 消息总线
    participant Agent as Agent

    User->>Channel: 发送消息
    Channel->>Gateway: 提交消息
    Gateway->>Bus: 发布入站消息
    Bus->>Agent: 消费消息
    Agent->>Agent: 处理
    Agent->>Bus: 发布出站消息
    Bus->>Gateway: 广播响应
    Gateway->>Channel: 分发回复
    Channel-->>User: 收到回复
```

### Agent 内部处理

```mermaid
sequenceDiagram
    participant Agent as Agent
    participant Router as 智能路由
    participant Provider as LLM
    participant Tools as 工具

    Agent->>Router: 分析意图
    Router-->>Agent: 返回模型选择
    
    Agent->>Provider: 调用LLM
    Provider-->>Agent: 返回响应
    
    alt 需要工具调用
        Agent->>Tools: 执行工具
        Tools-->>Agent: 返回结果
        Agent->>Provider: 继续调用
    end
```

## 依赖注入容器

Container 是 MicroAgent 的核心，提供依赖注入能力。

### 基本使用

```typescript
import { container } from '@micro-agent/sdk';

// 注册瞬态工厂
container.register('Provider', () => new OpenAIProvider());

// 注册单例
container.singleton('ToolRegistry', () => new ToolRegistry());

// 解析依赖
const provider = container.resolve<LLMProvider>('Provider');
```

## Provider 模式

Provider 抽象了 LLM 调用，支持多种后端。

### 接口定义

```typescript
interface LLMProvider {
  readonly name: string;
  
  chat(
    messages: LLMMessage[],
    tools?: LLMToolDefinition[],
    model?: string,
    config?: GenerationConfig
  ): Promise<LLMResponse>;
  
  getDefaultModel(): string;
  isAvailable(): Promise<boolean>;
}
```

### 支持的 Provider

- **OpenAI**: OpenAI API 兼容
- **Ollama**: 本地 LLM
- **自定义**: 实现 LLMProvider 接口

## Agent 循环

Agent 循环实现了 ReAct（Reasoning + Acting）模式。

### 主流程

```mermaid
flowchart LR
    A[接收消息] --> B[构建上下文]
    B --> C[模型路由]
    C --> D[调用LLM]
    D --> E{完成?}
    E -->|否| F[执行工具]
    F --> D
    E -->|是| G[保存会话]
    G --> H[返回响应]
```

### ReAct 详细流程

```mermaid
flowchart TD
    subgraph 思考
        T1[分析意图] --> T2[识别任务类型]
        T2 --> T3[选择模型]
    end
    
    subgraph 行动
        A1[调用LLM] --> A2{需要工具?}
        A2 -->|是| A3[执行工具]
        A3 --> A1
        A2 -->|否| A4[生成响应]
    end
    
    subgraph 观察
        O1[工具结果] --> O2[更新上下文]
    end
    
    T3 --> A1
    A3 --> O1
```

### 执行步骤

1. **接收用户消息** - 从通道获取输入
2. **构建上下文** - 加载记忆、技能、历史
3. **思考** - 分析意图，选择合适的模型
4. **行动** - 调用 LLM，执行工具
5. **观察** - 处理工具结果
6. **循环** - 重复直到完成任务
7. **保存会话** - 持久化对话历史

## 工具系统

工具是 Agent 与世界交互的桥梁。

### 定义工具

```typescript
import { z } from 'zod';
import { Tool } from '@micro-agent/sdk';

class FileReadTool extends Tool {
  readonly name = 'read_file';
  readonly description = '读取文件内容';
  readonly inputSchema = z.object({
    path: z.string(),
    limit: z.number().optional(),
    offset: z.number().optional(),
  });

  async execute(input: unknown, ctx: ToolContext): Promise<unknown> {
    const { path, limit, offset } = input as z.infer<typeof this.inputSchema>;
    // 实现...
  }
}
```

## 技能系统

技能是扩展 Agent 能力的 Markdown 文档。

### SKILL.md 格式

```markdown
---
name: my-skill
description: 技能描述
always: false
allowed-tools:
  - read_file
  - write_file
---

# 技能内容

这里是技能的详细说明和使用方法。
```

### 加载优先级

1. 项目技能（最高）
2. 用户技能 `~/.micro-agent/skills/`
3. 内置技能（最低）

## 存储系统

### 会话存储

JSONL 格式存储会话历史：

```jsonl
{"timestamp":"2024-01-01T00:00:00Z","role":"user","content":"你好"}
{"timestamp":"2024-01-01T00:00:01Z","role":"assistant","content":"你好"}
```

### 记忆系统

记忆系统让 Agent 能够跨会话保持上下文，实现长期记忆能力。

#### 核心功能

- **记忆存储**：将对话内容转化为向量存储，支持语义检索
- **智能检索**：基于用户输入检索相关记忆，注入系统提示
- **自动摘要**：对话过长时自动生成摘要，压缩上下文

#### 检索方式

1. **向量检索**：使用嵌入模型进行语义相似度搜索
2. **全文检索**：基于关键词匹配，支持中文 n-gram 分词

#### 工作流程

```mermaid
sequenceDiagram
    participant User as 用户
    participant Executor as 执行器
    participant Memory as 记忆存储
    participant LLM as 模型

    User->>Executor: 发送消息
    Executor->>Memory: 检索相关记忆
    Memory-->>Executor: 返回记忆列表
    Executor->>Executor: 注入系统提示
    Executor->>LLM: 调用模型
    LLM-->>Executor: 返回响应
    Executor->>Memory: 存储对话记忆
    Executor-->>User: 返回回复
```

#### 配置示例

```yaml
agents:
  models:
    embed: text-embedding-3-small  # 嵌入模型（可选）
  
  memory:
    enabled: true
    storagePath: ~/.micro-agent/memory
    searchLimit: 10
    shortTermRetentionDays: 7
    autoSummarize: true
    summarizeThreshold: 20
```

## 消息通道

通道是消息进出的抽象。

### 实现通道

```typescript
class MyChannel implements Channel {
  readonly name = 'my-channel';
  
  constructor(private messageBus: MessageBus) {
    this.messageBus.on('outbound', this.send.bind(this));
  }
  
  async start(): Promise<void> {
    // 启动通道监听
  }
  
  private async send(msg: OutboundMessage): Promise<void> {
    // 发送消息
  }
}
```
