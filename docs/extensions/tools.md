# 工具扩展

## 概述

工具扩展位于 `extensions/tool/`，提供文件系统、Shell、Web 等工具实现。

## 内置工具

### 文件系统工具

- `read_file`: 读取文件
- `write_file`: 写入文件
- `list_directory`: 列出目录
- `glob`: 文件搜索
- `search_file_content`: 内容搜索

### Shell 工具

- `run_shell_command`: 执行 Shell 命令

### Web 工具

- `web_fetch`: 获取网页内容

### 消息工具

- `send_message`: 发送消息

## 创建自定义工具

推荐使用 `defineTool` 工厂函数：

```typescript
// extensions/tool/my-tool/index.ts
import { defineTool } from '@micro-agent/sdk';
import type { JSONSchema, ToolContext } from '@micro-agent/types';

export const MyTool = defineTool({
  name: 'my_tool',
  description: '自定义工具描述',
  inputSchema: {
    type: 'object',
    properties: {
      param: { type: 'string', description: '参数说明' },
    },
    required: ['param'],
  } satisfies JSONSchema,
  execute: async (input: { param: string }, ctx: ToolContext) => {
    // 使用 ctx.workspace 获取工作目录
    // 使用 ctx.sendToBus 发送消息
    return `处理结果: ${input.param}`;
  },
});
```
