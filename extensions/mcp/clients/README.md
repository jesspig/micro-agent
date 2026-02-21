# MCP Clients 扩展目录

此目录用于存放 MCP Client 扩展配置。

## 用途

连接外部 MCP 服务器，获取工具、资源和提示词。

## 配置示例

创建 `my-server.yaml`:

```yaml
name: my-mcp-server
transport:
  type: stdio
  command: npx
  args:
    - "-y"
    - "@example/mcp-server"
```

## 支持的传输类型

- `stdio`: 通过标准输入输出通信
- `sse`: 通过 Server-Sent Events 通信
- `websocket`: 通过 WebSocket 通信
