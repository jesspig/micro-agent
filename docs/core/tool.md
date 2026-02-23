# Tool - 工具系统

## 概述

工具是 Agent 与世界交互的桥梁。每个工具都是可执行的函数。

## 定义工具

```typescript
import { z } from 'zod';
import { Tool, ToolContext } from '@microbot/sdk';

class MyTool extends Tool {
  readonly name = 'my_tool';
  readonly description = '工具描述';
  readonly inputSchema = z.object({
    param1: z.string(),
    param2: z.number().optional(),
  });

  async execute(input: unknown, ctx: ToolContext): Promise<unknown> {
    const { param1, param2 } = input as z.infer<typeof this.inputSchema>;
    // 实现逻辑
    return { result: 'success' };
  }
}
```

## 工具上下文

```typescript
interface ToolContext {
  channel: string;
  chatId: string;
  workspace: string;
  currentDir: string;
  sendToBus: (msg: OutboundMessage) => Promise<void>;
}
```

## 工具注册

```typescript
import { ToolRegistry } from '@microbot/sdk';

const registry = new ToolRegistry();
registry.register(new MyTool());
```

## 源码位置

- 基类: `packages/types/src/tool.ts`
- 注册表: `packages/sdk/src/tool/registry.ts`
