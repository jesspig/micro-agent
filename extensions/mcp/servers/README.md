# MCP Servers 扩展目录

此目录用于存放 MCP Server 扩展配置。

## 用途

暴露 MicroBot 的工具、资源和提示词给 MCP 客户端（如 Claude Desktop）。

## 配置示例

创建 `my-server.yaml`:

```yaml
name: microbot-tools
version: 1.0.0
instructions: |
  这是一个 MicroBot MCP 服务器，提供文件系统、Shell 等工具。
tools:
  - name: read_file
    description: 读取文件内容
    inputSchema:
      type: object
      properties:
        path:
          type: string
          description: 文件路径
      required: [path]
```

## 使用方式

```bash
microbot mcp --name microbot-tools --version 1.0.0
```
