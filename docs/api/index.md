# API 参考

## SDK 客户端

### 创建客户端

```typescript
import { createClient } from '@micro-agent/sdk';

const client = createClient({
  transport: 'http',  // http | websocket | ipc
  http: {
    baseUrl: 'http://localhost:3000',
    timeout: 30000,
  },
});
```

### 传输层

```typescript
import { HTTPTransport, WebSocketTransport, IPCTransport } from '@micro-agent/sdk';

// HTTP 传输
const httpTransport = new HTTPTransport({
  baseUrl: 'http://localhost:3000',
  timeout: 30000,
});

// WebSocket 传输
const wsTransport = new WebSocketTransport({
  url: 'ws://localhost:3000/ws',
});

// IPC 传输
const ipcTransport = new IPCTransport({
  path: '/tmp/micro-agent.sock',
});
```

## Core 模块

### Container

```typescript
import { Container } from '@micro-agent/sdk/runtime';

// 创建容器实例
const container = new Container();

// 注册瞬态依赖
container.register('service', () => new Service());

// 注册单例
container.singleton('db', () => new Database());

// 解析依赖
const service = container.resolve<Service>('service');
```

### EventBus

```typescript
import { EventBus } from '@micro-agent/sdk/runtime';

// 订阅事件
eventBus.on('message:received', (msg) => {
  console.log(msg);
});

// 发布事件
eventBus.emit('message:received', { content: 'hello' });
```

### HookSystem

```typescript
import { HookSystem } from '@micro-agent/sdk/runtime';

// 创建钩子系统实例
const hookSystem = new HookSystem();

// 注册钩子
hookSystem.registerHook('pre:chat', async (ctx) => {
  console.log('Before chat');
  return ctx;
});
```

## Provider 模块

### LLM Provider

```typescript
import { createLLMProvider } from '@micro-agent/sdk/llm';

const provider = createLLMProvider({
  baseUrl: 'https://api.deepseek.com/v1',
  apiKey: 'your-key',
  vendor: 'deepseek',
});

// 聊天
const response = await provider.chat([
  { role: 'user', content: 'Hello' }
], undefined, 'deepseek-chat');
```

### Embedding Provider

```typescript
import { createEmbeddingProvider } from '@micro-agent/sdk/llm';

const embeddingProvider = createEmbeddingProvider({
  baseUrl: 'http://localhost:11434/v1',
  vendor: 'ollama',
});

const embeddings = await embeddingProvider.embed(['Hello world']);
```

## Capability 模块

### Tool Registry

```typescript
import { ToolRegistry } from '@micro-agent/sdk/runtime';

const registry = new ToolRegistry();

// 注册工具
registry.register({
  name: 'my_tool',
  description: '我的自定义工具',
  inputSchema: zodSchema,
  execute: async (input, ctx) => {
    return { result: `处理: ${input}` };
  },
});
```

### Memory Manager

```typescript
import { MemoryManager } from '@micro-agent/sdk/memory';

const memory = new MemoryManager({
  vectorDb: lancedb,
  sessionStore: sessionStore,
});

// 存储记忆
await memory.store({
  content: '用户喜欢蓝色',
  type: 'preference',
});

// 检索记忆
const results = await memory.search('用户颜色偏好');
```

### Knowledge Base

```typescript
import { KnowledgeBaseManager } from '@micro-agent/sdk/knowledge';

const kb = new KnowledgeBaseManager({
  storagePath: '~/.micro-agent/knowledge',
});

// 添加文档
await kb.addDocument({
  content: 'MicroAgent 是一个 AI 助手框架',
  metadata: { source: 'about' },
});

// 检索
const results = await kb.search('什么是 MicroAgent');
```

## Kernel 模块

### Agent Orchestrator

```typescript
import { AgentOrchestrator } from '@micro-agent/sdk/runtime';

const orchestrator = new AgentOrchestrator({
  llmProvider,
  toolRegistry,
  memoryManager,
  knowledgeRetriever,
});

// 处理消息
const response = await orchestrator.processMessage({
  sessionId: 'session-1',
  content: '你好',
});
```

## MCP Server

MCP (Model Context Protocol) 服务器，支持 IDE 集成。

```typescript
import { createMCPServer } from '@micro-agent/agent-service/interface';

const server = createMCPServer({
  serverInfo: {
    name: 'my-agent',
    version: '1.0.0',
  },
  capabilities: {
    tools: {},
    resources: {},
    prompts: {},
  },
});

// 注册工具
server.registerTool(
  { name: 'my_tool', description: '工具描述', inputSchema: {...} },
  async (params) => ({ content: [{ type: 'text', text: '结果' }] })
);

// 启动 stdio 模式
await server.startStdio();
```

### CLI 命令

```bash
micro-agent mcp  # 启动 MCP 服务器（stdio 模式）
```

## ACP Server

ACP (Agent Client Protocol) 服务器，提供完整的 Agent 能力。

```typescript
import { createACPServer } from '@micro-agent/agent-service/interface';

const server = createACPServer({
  agent: myAgent,  // ACPAgent 实现
  serverVersion: '1.0.0',
});

// 启动服务器
await server.start();

// 发送响应
await server.sendText(sessionId, 'Hello');
await server.sendToolPending(sessionId, toolCall);
await server.sendComplete(sessionId);
```

### CLI 命令

```bash
micro-agent acp  # 启动 ACP 服务器
```

## HTTP API

### 基础信息

- 默认地址：`http://127.0.0.1:3000`
- 认证方式：Bearer Token

### 端点列表

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /v1/chat/completions | OpenAI 兼容的对话补全 |
| GET | /v1/models | 获取可用模型列表 |
| POST | /v1/embeddings | 获取嵌入向量 |

### Chat Completions

```bash
curl -X POST http://127.0.0.1:3000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "model": "ollama/qwen3",
    "messages": [
      {"role": "system", "content": "你是一个助手"},
      {"role": "user", "content": "你好"}
    ]
  }'
```

### List Models

```bash
curl -X GET http://127.0.0.1:3000/v1/models \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## IPC API

### Unix Socket

```typescript
import { UnixSocketIPC } from '@micro-agent/agent-service/interface/ipc';

const ipc = new UnixSocketIPC({
  path: '/tmp/micro-agent.sock',
});

// 发送消息
const response = await ipc.send('chat', {
  content: '你好',
});
```

### TCP Loopback

```typescript
import { TCPLoopbackIPC } from '@micro-agent/agent-service/interface/ipc';

const ipc = new TCPLoopbackIPC({
  port: 3001,
});
```

## Streaming API

### Server-Sent Events

```typescript
import { createSSEHandler } from '@micro-agent/agent-service/interface/streaming';

const handler = createSSEHandler({
  orchestrator,
});

// 流式响应
for await (const chunk of handler.stream({
  sessionId: 'session-1',
  content: '你好',
})) {
  console.log(chunk);
}
```
