# Storage - 存储层

## 概述

存储层提供会话数据持久化。

## 会话存储

JSONL 格式存储会话历史。

```typescript
import { SessionStore } from '@microbot/sdk/storage';

const store = new SessionStore('~/.microbot/sessions');

// 添加消息
store.addMessage('channel:chatId', 'user', '你好');
store.addMessage('channel:chatId', 'assistant', '你好');

// 获取会话
const session = store.get('channel:chatId');
```

## 源码位置

- 会话: `packages/core/src/storage/session/store.ts`