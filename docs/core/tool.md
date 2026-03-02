# Tool - 工具系统

## 概述

工具是 Agent 与世界交互的桥梁。每个工具都是可执行的函数。

## 定义工具

推荐使用 `defineTool` 工厂函数定义工具：

```typescript
import { defineTool } from '@micro-agent/sdk';
import type { JSONSchema, ToolContext } from '@micro-agent/types';

export const myTool = defineTool({
  name: 'my_tool',
  description: '工具描述',
  inputSchema: {
    type: 'object',
    properties: {
      param1: { type: 'string', description: '参数1说明' },
      param2: { type: 'number', description: '参数2说明' },
    },
    required: ['param1'],
  } satisfies JSONSchema,
  execute: async (input: { param1: string; param2?: number }, ctx: ToolContext) => {
    // 使用 ctx.workspace 获取工作目录
    // 使用 ctx.sendToBus 发送消息
    return `处理结果: ${input.param1}`;
  },
});
```

### 使用 ToolBuilder（链式调用）

```typescript
import { createToolBuilder } from '@micro-agent/sdk';

const tool = createToolBuilder<{ message: string }>()
  .name('my_tool')
  .description('工具描述')
  .inputSchema({
    type: 'object',
    properties: {
      message: { type: 'string', description: '消息内容' },
    },
    required: ['message'],
  })
  .execute(async (input, ctx) => {
    return `处理: ${input.message}`;
  })
  .build();
```

## 工具上下文

```typescript
interface ToolContext {
  channel: string;          // 通道类型
  chatId: string;           // 会话 ID
  workspace: string;        // 工作区路径
  currentDir: string;       // 当前目录
  sessionKey: string;       // 会话键（格式: "channel:chatId"）
  sendToBus: (msg: OutboundMessage) => Promise<void>;  // 发送消息
}
```

## MCP 兼容

工具定义遵循 Model Context Protocol (MCP) 规范，输入 Schema 使用 JSON Schema 格式。

```typescript
interface Tool {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: JSONSchema;
  execute(input: unknown, ctx: ToolContext): Promise<string | ToolResult>;
}

interface ToolResult {
  content: ContentPart[];
  isError?: boolean;
}
```

## 工具注册

```typescript
import { ToolRegistry } from '@micro-agent/sdk';

const registry = new ToolRegistry();
registry.register(new MyTool());
```

## 源码位置

- 基类: `packages/types/src/tool.ts`
- 注册表: `packages/sdk/src/tool/registry.ts`
