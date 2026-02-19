# Agent - 智能代理

## 概述

Agent 实现了 ReAct（Reasoning + Acting）模式，是系统的核心智能组件。

## 工作流程

### 整体流程

```mermaid
flowchart LR
    Start([用户消息]) --> Context[构建上下文]
    Context --> Route[智能路由]
    Route --> React[ReAct循环]
    React --> Save[保存会话]
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

### 智能路由

```mermaid
flowchart LR
    subgraph Router[路由选择]
        direction LR
        R1[意图分析] --> R2[复杂度评估]
        R2 --> R3[模型选择]
    end
```

### ReAct 循环

```mermaid
flowchart TB
    subgraph ReAct[ReAct 循环]
        direction TB
        RL1[调用LLM] --> RL2{有工具调用?}
        RL2 -->|是| Execute[执行工具]
        RL2 -->|否| Return[返回响应]
        Execute --> RL1
    end
```

## 配置

```typescript
interface AgentConfig {
  workspace: string;
  models?: {
    chat: string;
    check?: string;
  };
  maxIterations: number;
  generation?: GenerationConfig;
  auto?: boolean;
  max?: boolean;
  availableModels?: Map<string, ModelConfig[]>;
  routing?: RoutingConfig;
}
```

## 上下文构建

Agent 使用 ContextBuilder 构建 LLM 上下文：

1. 加载 always=true 的技能
2. 搜索相关记忆
3. 获取会话历史
4. 合并系统提示

## 智能路由

根据任务复杂度自动选择模型：

- **fast**: 简单问候、感谢
- **low**: 翻译、格式化
- **medium**: 常规对话、修改
- **high**: 调试、分析
- **ultra**: 架构设计、重构

## 源码位置

`packages/core/src/agent/`
