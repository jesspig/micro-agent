# Storage - 存储层

## 概述

存储层提供两种存储服务：
- **SessionStore**：短期会话存储，JSONL 格式
- **KVMemoryStore**：通用键值内存缓存，支持 TTL 和 LRU

> **注意**：长期记忆存储（向量检索）位于 `@micro-agent/runtime` 包，详见 [Memory 文档](./memory.md)。

---

## SessionStore

会话存储基于 JSONL 格式，用于保存对话历史。

### 功能特性

- 会话超时自动创建新会话
- 消息追加写入，高性能
- 内存缓存加速读取
- 元数据跟踪

### 使用示例

```typescript
import { SessionStore } from '@micro-agent/storage';

const store = new SessionStore({
  sessionsDir: '~/.micro-agent/sessions',
  maxMessages: 500,
  sessionTimeout: 30 * 60 * 1000, // 30 分钟
});

// 添加消息
store.addMessage('feishu:chat_123', 'user', '你好');
store.addMessage('feishu:chat_123', 'assistant', '你好！有什么可以帮助你？');

// 获取会话
const session = store.get('feishu:chat_123');

// 获取消息历史（LLM 格式）
const history = store.getHistory('feishu:chat_123', 100);
```

### 存储格式

```
~/.micro-agent/sessions/
├── feishu_chat_123.jsonl
└── feishu_chat_456.jsonl
```

每个文件格式：
```jsonl
{"_type":"metadata","channel":"feishu","chatId":"chat_123","createdAt":"...","updatedAt":"..."}
{"role":"user","content":"你好","timestamp":1700000000000}
{"role":"assistant","content":"你好！","timestamp":1700000001000}
```

---

## KVMemoryStore

通用键值内存缓存，用于临时数据存储。

### 功能特性

- **键值存储**：简单的 get/set 接口
- **TTL 过期**：支持设置过期时间
- **LRU 淘汰**：超过容量时自动淘汰最久未使用的条目
- **定时清理**：自动清理过期条目

### 使用示例

```typescript
import { KVMemoryStore } from '@micro-agent/storage';

// 创建缓存（默认最大 1000 条目）
const cache = new KVMemoryStore<string>({
  defaultTTL: 60000,      // 默认 60 秒过期
  maxSize: 500,           // 最多 500 条目
  cleanupInterval: 30000, // 每 30 秒清理过期
});

// 设置值
cache.set('user:123', '张三');
cache.set('token:abc', 'xyz', 300000); // 5 分钟过期

// 获取值
const name = cache.get('user:123');

// 检查存在
cache.has('token:abc');

// 删除
cache.delete('user:123');

// 清空
cache.clear();
```

---

## 源码位置

| 模块 | 路径 |
|------|------|
| SessionStore | `packages/storage/src/session/store.ts` |
| KVMemoryStore | `packages/storage/src/memory-store.ts` |
| MemoryStore（向量记忆） | `packages/runtime/src/memory/store.ts` |