# Provider - LLM 提供商

## 概述

Provider 抽象了 LLM 调用接口，支持 OpenAI 兼容的各种后端。

## 任务类型路由

基于任务类型选择模型：

| 类型 | 适用场景 | 模型配置 |
|------|----------|----------|
| vision | 图片识别、图像理解 | `agents.models.vision` |
| coder | 代码编写、程序开发 | `agents.models.coder` |
| chat | 常规对话、问答 | `agents.models.chat` |

### 路由流程

1. **图片检测**：检测消息中是否包含图片
2. **意图识别**：通过 LLM 判断任务类型
3. **模型选择**：根据任务类型选择对应模型
4. **回退机制**：未配置专用模型时使用 chat 模型

## 接口定义

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
  getModelCapabilities(modelId: string): ModelConfig;
  listModels(): Promise<string[] | null>;
}
```

## 类型定义

### LLMMessage

```typescript
type MessageRole = 'system' | 'user' | 'assistant' | 'tool';

interface LLMMessage {
  role: MessageRole;
  content: MessageContent;
  toolCallId?: string;
  toolCalls?: ToolCall[];
}
```

### GenerationConfig

```typescript
interface GenerationConfig {
  maxTokens?: number;
  temperature?: number;
  topK?: number;
  topP?: number;
  frequencyPenalty?: number;
}
```

### LLMResponse

```typescript
interface LLMResponse {
  content: string;
  toolCalls?: ToolCall[];
  hasToolCalls: boolean;
  reasoning?: string;      // 深度思考模型的推理过程
  usage?: UsageStats;      // Token 使用统计
  usedProvider?: string;
  usedModel?: string;
}
```

## 内置 Provider

### OpenAICompatibleProvider

支持 OpenAI API 兼容的所有后端。

### 配置示例

#### Ollama（本地运行）

```yaml
providers:
  ollama:
    baseUrl: http://localhost:11434/v1
    models:
      - qwen3
      - qwen3-vl

agents:
  models:
    chat: ollama/qwen3
    vision: ollama/qwen3-vl
```

#### DeepSeek（深度推理）

```yaml
providers:
  deepseek:
    baseUrl: https://api.deepseek.com/v1
    apiKey: ${DEEPSEEK_API_KEY}
    models:
      - deepseek-chat
      - deepseek-reasoner

agents:
  models:
    chat: deepseek/deepseek-chat
    coder: deepseek/deepseek-chat
```

#### GLM 智谱（国产大模型）

```yaml
providers:
  glm:
    baseUrl: https://open.bigmodel.cn/api/paas/v4
    apiKey: ${GLM_API_KEY}
    models:
      - glm-4-flash
      - glm-4-plus

agents:
  models:
    chat: glm/glm-4-flash
```

#### MiniMax（海螺 AI）

```yaml
providers:
  minimax:
    baseUrl: https://api.minimax.chat/v1
    apiKey: ${MINIMAX_API_KEY}
    models:
      - abab6.5s-chat

agents:
  models:
    chat: minimax/abab6.5s-chat
```

#### Kimi（长上下文）

```yaml
providers:
  kimi:
    baseUrl: https://api.moonshot.cn/v1
    apiKey: ${MOONSHOT_API_KEY}
    models:
      - moonshot-v1-8k
      - moonshot-v1-128k

agents:
  models:
    chat: kimi/moonshot-v1-8k
```

#### OpenAI（GPT 系列）

```yaml
providers:
  openai:
    baseUrl: https://api.openai.com/v1
    apiKey: ${OPENAI_API_KEY}
    models:
      - gpt-4o
      - gpt-4o-mini

agents:
  models:
    chat: openai/gpt-4o-mini
    vision: openai/gpt-4o
    coder: openai/gpt-4o
```

### Provider 对比

| Provider | 特点 | 推荐场景 |
|----------|------|----------|
| **Ollama** | 本地运行，无 API Key，隐私安全 | 开发测试、离线环境 |
| **DeepSeek** | 深度推理，性价比高 | 复杂推理、代码生成 |
| **GLM** | 国产模型，中文优化 | 中文对话、国内部署 |
| **MiniMax** | 海螺 AI，多模态 | 多模态应用 |
| **Kimi** | 128K 长上下文 | 长文档处理 |
| **OpenAI** | GPT 系列，功能全面 | 通用场景 |

## 协议支持

| 协议 | 用途 | 说明 |
|------|------|------|
| ACP | IDE 集成 | 支持 Cursor、Claude Desktop 等 IDE 集成 |
| A2A | Agent 通信 | Agent 间通信协议 |
| MCP | 工具接入 | Model Context Protocol，外部工具/资源接入 |

## 源码位置

- 接口定义: `packages/providers/src/base.ts`
- OpenAI 兼容: `packages/providers/src/openai-compatible.ts`
- 模型网关: `packages/providers/src/gateway.ts`
- 智能路由: `packages/providers/src/router.ts`