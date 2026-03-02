# API 参考

## Core 模块

### Container

```typescript
import { Container, container } from '@micro-agent/sdk';

// 注册瞬态依赖
container.register('service', () => new Service());

// 注册单例
container.singleton('db', () => new Database());

// 解析依赖
const service = container.resolve<Service>('service');
```

### EventBus

```typescript
import { EventBus, eventBus } from '@micro-agent/sdk';

// 订阅事件
eventBus.on('message:received', (msg) => {
  console.log(msg);
});

// 发布事件
eventBus.emit('message:received', { content: 'hello' });
```

### HookSystem

```typescript
import { HookSystem, hookSystem } from '@micro-agent/sdk';

// 注册钩子
hookSystem.registerHook('pre:chat', async (ctx) => {
  console.log('Before chat');
  return ctx;
});
```

## MCP Server API

MCP (Model Context Protocol) 服务器，支持 IDE 集成。

```typescript
import { createMCPServer } from '@micro-agent/sdk';

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

## ACP Server API

ACP (Agent Client Protocol) 服务器，提供完整的 Agent 能力。

```typescript
import { createACPServer } from '@micro-agent/sdk';

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

## Server HTTP API

### 基础信息

- 默认地址：`http://127.0.0.1:3000`
- 认证方式：Bearer Token

### 端点列表

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /v1/chat/completions | OpenAI 兼容的对话补全 |
| GET | /v1/models | 获取可用模型列表 |

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

## Provider 模块

```typescript
import { OpenAICompatibleProvider } from '@micro-agent/sdk/providers';

const provider = new OpenAICompatibleProvider({
  baseUrl: 'https://api.deepseek.com/v1',
  apiKey: 'your-key',
  model: 'deepseek-chat',
});

// 聊天
const response = await provider.chat([
  { role: 'user', content: 'Hello' }
]);
```

## Storage 模块

### SessionStore

```typescript
import { SessionStore } from '@micro-agent/sdk/storage';

const store = new SessionStore('~/.micro-agent/data');

// 添加消息
await store.appendMessage('channel:chatId', {
  role: 'user',
  content: 'Hello',
  timestamp: Date.now(),
});

// 获取消息历史
const history = await store.getHistory('channel:chatId', 100);
```
