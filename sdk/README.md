# SDK

MicroAgent 客户端开发套件。

## 功能

- 客户端核心（请求构建、响应解析、错误处理）
- 传输层（HTTP/WebSocket/IPC）
- Typed API（会话/聊天/任务/记忆）
- 工具定义辅助

## 结构

```
sdk/
├── src/
│   ├── client/        # 客户端核心
│   ├── transport/     # 传输层
│   ├── api/           # Typed API
│   ├── tool/          # 工具定义
│   └── define/        # 定义辅助
└── tests/             # 测试
```

## 使用

```typescript
import { createClient, defineTool, ToolRegistry } from '@micro-agent/sdk';

// 创建客户端
const client = createClient({ transport: 'ipc' });

// 定义工具
const myTool = defineTool({
  name: 'my_tool',
  description: 'My custom tool',
  inputSchema: { type: 'object', properties: {} },
  handler: async (input, ctx) => ({ content: [{ type: 'text', text: 'ok' }] })
});

// 注册工具
const registry = new ToolRegistry();
registry.register(myTool);

// 发起聊天
const response = await client.chat({ messages: [{ role: 'user', content: 'Hello' }] });
```

## 测试

```bash
bun test sdk/tests/
```
