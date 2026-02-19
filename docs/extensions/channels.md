# 通道扩展

## 概述

通道扩展位于 `extensions/channel/`，负责消息的接收和发送。

## 通道基类

```typescript
import { Channel, type InboundMessage, type OutboundMessage } from '@microbot/sdk';

export abstract class BaseChannel implements Channel {
  abstract readonly name: string;
  
  async start(): Promise<void> {}
  async stop(): Promise<void> {}
  
  abstract send(message: OutboundMessage): Promise<void>;
  
  protected abstract onMessage(handler: (msg: InboundMessage) => void): void;
}
```

## 当前支持

### 飞书通道

```yaml
channels:
  feishu:
    enabled: true
    appId: your-app-id
    appSecret: your-app-secret
    allowFrom: []
```

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
