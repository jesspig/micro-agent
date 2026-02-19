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

- `web_search`: 网络搜索
- `web_fetch`: 获取网页内容

### 消息工具

- `send_message`: 发送消息

## 创建自定义工具

```typescript
// extensions/tool/my-tool/index.ts
import { z } from 'zod';
import { Tool, type ToolContext } from '@microbot/sdk';

export class MyTool extends Tool {
  readonly name = 'my_tool';
  readonly description = '自定义工具';
  readonly inputSchema = z.object({
    param: z.string(),
  });

  async execute(input: unknown, ctx: ToolContext): Promise<unknown> {
    // 实现
    return { result: 'ok' };
  }
}
```
