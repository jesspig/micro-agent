# 通道扩展

## 概述

通道扩展位于 `extensions/channel/`，负责消息的接收和发送。

## 飞书通道

### 创建飞书应用

1. 访问 [飞书开放平台](https://open.feishu.cn/) 并登录
2. 进入「开发者后台」→「创建企业自建应用」
3. 填写应用名称和描述，创建应用

### 配置应用权限

在应用管理页面，进入「权限管理」：

| 权限 | 权限点名称 | 用途 |
|------|-----------|------|
| `im:message` | 获取与发送单聊、群组消息 | 接收和发送消息 |
| `im:message:send_as_bot` | 以应用身份发消息 | 发送机器人消息 |
| `im:resource` | 获取与上传图片或文件资源 | 处理媒体文件 |

### 配置事件订阅

1. 进入「事件订阅」页面
2. 选择「使用长连接接收事件」（无需公网 IP）
3. 添加事件：`im.message.receive_v1`（接收消息）

### 获取凭证

在「凭证与基础信息」页面获取：

- **App ID**: 应用唯一标识
- **App Secret**: 应用密钥

### 配置 MicroAgent

编辑 `~/.micro-agent/settings.yaml`：

```yaml
channels:
  feishu:
    enabled: true
    appId: cli_xxxxxxxxxxxx
    appSecret: xxxxxxxxxxxxxxxxxxxxxxxx
    allowFrom: []  # 空数组允许所有人，或填入指定用户 ID
```

### 发布应用

1. 在「版本管理与发布」页面创建版本
2. 提交审核并通过
3. 发布应用后即可使用

### 测试连接

启动 MicroAgent 后，在飞书中向机器人发送消息，查看日志确认收到消息。

## 消息格式

### InboundMessage

```typescript
interface InboundMessage {
  channel: string;
  chatId: string;
  content: string;
  media?: string[];
  metadata?: Record<string, unknown>;
  currentDir?: string;
}
```

### OutboundMessage

```typescript
interface OutboundMessage {
  channel: string;
  chatId: string;
  content: string;
  media?: string[];
  metadata?: Record<string, unknown>;
}
```
