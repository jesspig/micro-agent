# Channel - 消息通道

## 概述

通道是消息进出的抽象，支持多种消息平台。

## Channel 接口

```typescript
interface Channel {
  readonly name: string;
  
  start(): Promise<void>;
  stop(): Promise<void>;
}
```

## 实现示例

```typescript
import { Channel, EventBus } from '@microbot/sdk';

class MyChannel implements Channel {
  readonly name = 'my-channel';
  
  constructor(private eventBus: EventBus) {
    // 监听消息
    this.eventBus.on('message:outbound', this.send.bind(this));
  }
  
  async start(): Promise<void> {
    // 启动通道
  }
  
  async stop(): Promise<void> {
    // 停止通道
  }
  
  private async send(msg: OutboundMessage): Promise<void> {
    // 发送消息到目标平台
  }
}
```

## 消息类型

### InboundMessage

```typescript
interface InboundMessage {
  channel: string;
  chatId: string;
  userId: string;
  content: string;
  media?: string[];
  currentDir?: string;
  metadata?: Record<string, unknown>;
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

## 源码位置

- 基类: `packages/core/src/channel/base.ts`
- 管理器: `packages/core/src/channel/manager.ts`
