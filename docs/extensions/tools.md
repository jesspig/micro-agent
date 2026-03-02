# 工具扩展

## 概述

工具扩展位于 `extensions/tool/`，提供文件系统、Shell、Web 等工具实现。

## 内置工具

### 文件系统工具

| 工具 | 说明 | 安全限制 |
|------|------|----------|
| `read_file` | 读取文件 | 仅允许工作区和 ~/.micro-agent 目录 |
| `write_file` | 写入文件 | 仅允许工作区和 ~/.micro-agent 目录 |
| `list_dir` | 列出目录 | 禁止访问 node_modules |

### Shell 工具

| 工具 | 说明 | 安全限制 |
|------|------|----------|
| `exec` | 执行 Shell 命令 | 危险命令黑名单、模式检测、环境变量过滤 |

**危险命令黑名单**：
- 系统命令：shutdown, useradd, sudo, mkfs, mke2fs
- 破坏性命令：rm -rf /, Fork bomb

**环境变量白名单**：PATH, HOME, USER, LANG, TMPDIR

### Web 工具

| 工具 | 说明 | 安全限制 |
|------|------|----------|
| `web_fetch` | 获取网页内容 | 内网 IP 禁止、SSRF 防护、协议限制 |

**内网 IP 禁止**：
- 127.x, 10.x, 172.16-31.x, 192.168.x

### 消息工具

| 工具 | 说明 |
|------|------|
| `message` | 发送消息 |

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
