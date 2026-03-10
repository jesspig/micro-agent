# API 文档

MicroAgent SDK 提供稳定的客户端 API，用于与 Agent Service 交互。

## 安装

```bash
bun add @micro-agent/sdk
```

## 客户端

### 创建客户端

```typescript
import { createClient } from '@micro-agent/sdk';

// IPC 传输（推荐，本地嵌入式）
const client = createClient({
  transport: 'ipc',
  ipc: {
    timeout: 30000,
  },
});

// HTTP 传输（远程服务）
const client = createClient({
  transport: 'http',
  http: {
    baseUrl: 'http://localhost:3000',
    timeout: 30000,
  },
});

// WebSocket 传输（实时通信）
const client = createClient({
  transport: 'websocket',
  websocket: {
    url: 'ws://localhost:3000/ws',
    reconnectAttempts: 5,
    reconnectInterval: 1000,
  },
});
```

### 传输方式对比

| 传输 | 特点 | 适用场景 |
|------|------|----------|
| IPC | Bun 原生 IPC，子进程管理 | 本地嵌入式（推荐） |
| HTTP | RESTful API，无状态 | 远程服务访问 |
| WebSocket | 双向通信，自动重连 | 实时通信 |

## 核心 API

### MicroAgentClient

```typescript
class MicroAgentClient {
  // 连接/断开
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  
  // 流式聊天
  async *chatStream(params: ChatStreamParams): AsyncIterable<StreamChunk>;
  
  // 会话 API
  get session(): SessionAPI;
  
  // 聊天 API
  get chat(): ChatAPI;
  
  // 记忆 API
  get memory(): MemoryAPI;
  
  // 配置 API
  get config(): ConfigAPI;
}
```

### ChatAPI

```typescript
interface ChatAPI {
  // 发送消息
  send(sessionKey: string, content: string, options?: ChatOptions): Promise<string>;
  
  // 获取历史
  getHistory(sessionKey: string): Promise<LLMMessage[]>;
  
  // 清空历史
  clearHistory(sessionKey: string): Promise<void>;
}
```

### SessionAPI

```typescript
interface SessionAPI {
  // 创建会话
  create(channel: string, chatId: string): Promise<SessionKey>;
  
  // 获取会话
  get(sessionKey: string): Promise<Session | null>;
  
  // 删除会话
  delete(sessionKey: string): Promise<boolean>;
  
  // 列出会话
  list(options?: SessionListOptions): Promise<Session[]>;
}
```

### MemoryAPI

```typescript
interface MemoryAPI {
  // 检索记忆
  search(query: string, options?: MemorySearchOptions): Promise<MemorySearchResponse>;
  
  // 向量检索
  vectorSearch(query: string, limit?: number): Promise<MemorySearchResponse>;
  
  // 全文检索
  fulltextSearch(query: string, limit?: number): Promise<MemorySearchResponse>;
  
  // 混合检索
  hybridSearch(query: string, options?: HybridSearchOptions): Promise<MemorySearchResponse>;
  
  // 存储记忆
  store(options: MemoryStoreOptions): Promise<MemoryStoreResponse>;
  
  // 获取记忆
  get(id: string): Promise<MemoryDetail | null>;
  
  // 删除记忆
  delete(id: string): Promise<boolean>;
  
  // 统计信息
  getStats(): Promise<MemoryStats>;
}
```

### ConfigAPI

```typescript
interface ConfigAPI {
  // 设置系统提示词
  setSystemPrompt(prompt: string): Promise<void>;
  
  // 重载配置
  reloadConfig(): Promise<void>;
  
  // 获取配置
  getConfig(): Promise<Config>;
}
```

## 流式响应

### StreamChunk 类型

```typescript
interface StreamChunk {
  type: 'text' | 'tool_call' | 'thinking' | 'error' | 'done';
  content: string;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}
```

### 流式处理示例

```typescript
for await (const chunk of client.chatStream({
  sessionKey: 'feishu:chat_123',
  content: '请帮我分析这段代码',
})) {
  switch (chunk.type) {
    case 'text':
      process.stdout.write(chunk.content);
      break;
    case 'tool_call':
      console.log(`[工具调用] ${chunk.metadata?.name}`);
      break;
    case 'thinking':
      console.log(`[思考] ${chunk.content}`);
      break;
    case 'error':
      console.error(`[错误] ${chunk.content}`);
      break;
    case 'done':
      console.log('\n[完成]');
      break;
  }
}
```

## 错误处理

### SDKError

```typescript
class SDKError extends Error {
  readonly code: SDKErrorCode;
  readonly details?: Record<string, unknown>;
}

type SDKErrorCode =
  | 'CONNECTION_ERROR'
  | 'TIMEOUT_ERROR'
  | 'PROTOCOL_ERROR'
  | 'IPC_CONNECT_FAILED'
  | 'IPC_TIMEOUT'
  | 'IPC_DISCONNECTED';
```

### 错误处理示例

```typescript
import { SDKError, ErrorHandler } from '@micro-agent/sdk';

try {
  await client.chat.send('session', 'hello');
} catch (error) {
  if (error instanceof SDKError) {
    console.error(`错误码: ${error.code}`);
    console.error(`详情: ${error.details}`);
    
    // 判断是否可重试
    if (ErrorHandler.isRetryable(error)) {
      // 重试逻辑
    }
  }
}
```

## 运行时访问

对于高级用户，可以直接访问运行时内部实现：

```typescript
import {
  // 类型
  type SessionKey,
  type LLMMessage,
  type Tool,
  type ToolContext,
  
  // 基础设施
  ContainerImpl,
  EventBus,
  
  // Provider
  createLLMProvider,
  ModelRouter,
  
  // 能力
  ToolRegistry,
  SkillRegistry,
  MemoryStore,
} from '@micro-agent/sdk/runtime';
```

### 依赖注入

```typescript
// 注册工具提供者
import { registerBuiltinToolProvider } from '@micro-agent/sdk/runtime';

registerBuiltinToolProvider({
  getTool(name) { return tools.get(name); },
  listTools() { return Array.from(tools.values()); },
});

// 注册技能提供者
import { registerBuiltinSkillProvider } from '@micro-agent/sdk/runtime';

registerBuiltinSkillProvider({
  getSkillsPath() { return skillsPath; },
});
```

## 定义函数

### defineTool

```typescript
import { defineTool } from '@micro-agent/sdk';

const myTool = defineTool({
  name: 'my_tool',
  description: '我的工具',
  inputSchema: {
    type: 'object',
    properties: {
      input: { type: 'string' },
    },
    required: ['input'],
  },
  execute: async (input, ctx) => {
    return { result: `处理: ${input.input}` };
  },
});
```

### defineSkill

```typescript
import { defineSkill } from '@micro-agent/sdk';

const mySkill = defineSkill({
  name: 'my-skill',
  description: '我的技能',
  content: `
# My Skill

技能内容...
  `,
});
```

### defineChannel

```typescript
import { defineChannel } from '@micro-agent/sdk';

const myChannel = defineChannel({
  name: 'my-channel' as ChannelType,
  start: async () => { /* 初始化 */ },
  stop: async () => { /* 关闭 */ },
  send: async (msg) => { /* 发送 */ },
});
```