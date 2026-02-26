# Channel - 消息通道

## 概述

通道是消息进出的抽象，支持多种消息平台。

## Channel 接口

```typescript
interface Channel {
  /** 通道名称 */
  readonly name: ChannelType;
  /** 是否运行中 */
  readonly isRunning: boolean;
  /** 启动通道 */
  start(): Promise<void>;
  /** 停止通道 */
  stop(): Promise<void>;
  /** 发送消息 */
  send(msg: OutboundMessage): Promise<void>;
}
```

## ChannelGateway - 消息处理枢纽

ChannelGateway 是消息处理的中心枢纽，负责协调所有通道的消息流转。

### 职责

| 职责 | 说明 |
|------|------|
| 消息接收 | 接收来自任意 Channel 的消息 |
| LLM 调用 | 调用 AgentExecutor/LLM 处理消息 |
| 响应广播 | 将处理结果广播到所有活跃 Channel |

### 消息流程

```
Channel → ChannelManager.onMessage() → ChannelGateway.process() 
       → AgentExecutor → LLM 
       → ChannelGateway.broadcast() → 所有活跃 Channel
```

### 接口定义

```typescript
interface ChannelGateway {
  /** 统一会话 ID */
  readonly sessionKey: string;
  /** 广播消息到所有活跃 Channel */
  broadcast(msg: BroadcastMessage): Promise<PromiseSettledResult<void>[]>;
}
```

### 核心方法

```typescript
class ChannelGatewayImpl implements ChannelGateway {
  /**
   * 处理来自任意通道的消息
   * 流程：Channel → Gateway → LLM → Gateway → 所有 Channel
   */
  async process(msg: InboundMessage): Promise<void>;
  
  /**
   * 广播消息到所有活跃 Channel
   */
  async broadcast(msg: BroadcastMessage): Promise<PromiseSettledResult<void>[]>;
}
```

## ChannelManager - 通道管理器

ChannelManager 负责管理所有通道实例，提供注册、启停和消息路由功能。

### 核心功能

| 功能 | 方法 | 说明 |
|------|------|------|
| 注册通道 | `register(channel)` | 注册新通道实例 |
| 设置处理器 | `setHandler(handler)` | 设置 ChannelGateway 作为消息处理器 |
| 消息转发 | `onMessage(msg)` | 接收消息并转发给处理器 |
| 启停管理 | `startAll() / stopAll()` | 批量启停所有通道 |
| 状态查询 | `getRunningChannels()` | 获取运行中的通道列表 |

## 实现示例

```typescript
import type { Channel, ChannelType, OutboundMessage } from '@micro-agent/types';
import type { ChannelManager } from '@micro-agent/sdk';

class MyChannel implements Channel {
  readonly name: ChannelType = 'mychannel';
  private running = false;
  
  constructor(private readonly manager: ChannelManager) {}
  
  get isRunning(): boolean {
    return this.running;
  }
  
  async start(): Promise<void> {
    // 启动逻辑，如监听 WebSocket、HTTP 服务等
    this.running = true;
  }
  
  async stop(): Promise<void> {
    // 停止逻辑
    this.running = false;
  }
  
  async send(msg: OutboundMessage): Promise<void> {
    // 发送消息给用户（如调用第三方 API）
    console.log('发送消息:', msg.content);
  }
  
  // 收到用户消息时，转发给 Manager
  private async onUserMessage(content: string): Promise<void> {
    await this.manager.onMessage({
      channel: this.name,
      chatId: 'default',
      userId: 'user-1',
      content,
    });
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
  replyTo?: string;
  media?: string[];
  metadata?: Record<string, unknown>;
}
```

### BroadcastMessage

```typescript
interface BroadcastMessage {
  content: string;
  replyTo?: string;
  media?: string[];
  metadata?: Record<string, unknown>;
}
```

## 源码位置

| 组件 | 路径 |
|------|------|
| Channel 接口 | `packages/types/src/interfaces.ts` |
| ChannelGateway | `packages/runtime/src/gateway/channel-gateway.ts` |
| ChannelManager | `packages/sdk/src/channel/manager.ts` |