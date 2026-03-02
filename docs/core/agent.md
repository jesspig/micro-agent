# Agent - 智能代理

## 概述

Agent 核心执行器（AgentExecutor）采用 **Function Calling 模式**，利用主流 LLM 的原生工具调用能力实现 Agent 行为。

同时提供独立的 ReAct Agent 实现（`ReActAgent`），基于 JSON 结构化输出的推理-行动循环。

## 工作流程

### 整体流程

```mermaid
flowchart LR
    Start([用户消息]) --> Preflight[意图预处理]
    Preflight --> Route[任务类型路由]
    Route --> Context[构建上下文]
    Context --> Execute[Function Calling 执行]
    Execute --> Loop{循环检测?}
    Loop -->|是| Execute
    Loop -->|否| Cite[引用溯源]
    Cite --> Save[保存会话]
    Save --> End([返回响应])
```

### 上下文构建

```mermaid
flowchart TB
    subgraph Context[上下文构建]
        direction TB
        C1[记忆搜索] --> C2[技能加载]
        C2 --> C3[历史会话]
        C3 --> C4[系统提示]
    end
```

### 任务类型识别

```mermaid
flowchart LR
    subgraph Router[任务类型路由]
        direction LR
        R1[图片识别] --> R2[代码编写]
        R2 --> R3[常规对话]
    end
```

### Function Calling 循环

```mermaid
flowchart TB
    subgraph FC[Function Calling 循环]
        direction TB
        FC1[调用LLM] --> FC2{有工具调用?}
        FC2 -->|是| Execute[执行工具]
        FC2 -->|否| Check{循环检测?}
        Check -->|是| FC1
        Check -->|否| Return[返回响应]
        Execute --> FC1
    end
```

### 循环检测

AgentExecutor 内置循环检测机制，防止 Agent 陷入无限循环：

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| `warningThreshold` | 3 | 警告阈值，相同调用次数达到此值时发出警告 |
| `criticalThreshold` | 5 | 临界阈值，达到此值时中断执行 |
| `globalCircuitBreaker` | 30 | 全局熔断，累计调用次数上限 |

```yaml
agents:
  executor:
    loopDetection:
      enabled: true
      warningThreshold: 3
      criticalThreshold: 5
```

### 引用溯源

启用引用溯源后，Agent 响应会包含来源文档的引用：

```yaml
agents:
  executor:
    citationEnabled: true
```

引用格式支持：
- `numbered` - 编号格式 [1], [2]
- `bracket` - 括号格式
- `footnote` - 脚注格式

## 配置

```typescript
interface AgentConfig {
  workspace: string;
  models?: {
    chat: string;      // 常规对话模型（默认）
    vision?: string;   // 图片识别模型（默认使用 chat）
    coder?: string;    // 编程模型（默认使用 chat）
    intent?: string;   // 意图识别模型（默认使用 chat）
    embed?: string;    // 嵌入模型（用于记忆检索）
  };
  maxIterations: number;
  maxHistoryMessages?: number;  // 消息历史保留数量
  memoryEnabled?: boolean;      // 启用记忆系统
  knowledgeEnabled?: boolean;   // 启用知识库
  citationEnabled?: boolean;    // 启用引用溯源
  loopDetection?: {
    enabled: boolean;
    warningThreshold: number;   // 警告阈值（默认 3）
    criticalThreshold: number;  // 临界阈值（默认 5）
  };
}
```

## 上下文构建

Agent 使用 ContextBuilder 构建 LLM 上下文：

1. 加载 always=true 的技能
2. 搜索相关记忆
3. 获取会话历史
4. 合并系统提示

## 任务类型路由

Agent 通过意图识别判断任务类型，选择对应模型：

| 任务类型 | 触发条件 | 使用模型 |
|----------|----------|----------|
| 图片识别 | 用户消息包含图片或请求识别图片 | models.vision（默认 chat）|
| 代码编写 | 用户请求编写、调试、修复代码 | models.coder（默认 chat）|
| 常规对话 | 其他所有情况 | models.chat |

## 源码位置

`packages/runtime/src/executor/`
