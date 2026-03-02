# Storage - 存储层

## 概述

存储层提供两种存储服务：
- **SessionStore**：短期会话存储，SQLite 数据库
- **KVMemoryStore**：通用键值内存缓存，支持 TTL 和 LRU

> **注意**：长期记忆存储（向量检索）位于 `@micro-agent/runtime` 包，详见 [Memory 文档](./memory.md)。

---

## SessionStore

会话存储基于 SQLite 数据库（性能比 JSONL 提升 10-100 倍），用于保存对话历史。

### 功能特性

- SQLite 高性能存储
- 会话超时自动创建新会话
- 内存缓存加速读取
- 元数据跟踪
- 消息裁剪和自动清理

### 使用示例

```typescript
import { SessionStore } from '@micro-agent/storage';

const store = new SessionStore({
  dbPath: '~/.micro-agent/data/sessions.db',
  maxMessages: 500,
  sessionTimeout: 30 * 60 * 1000, // 30 分钟
});

// 获取或创建会话
const session = await store.getOrCreate('feishu:chat_123');

// 添加消息
await store.appendMessage('feishu:chat_123', {
  role: 'user',
  content: '你好',
  timestamp: Date.now(),
});

// 获取消息历史（LLM 格式）
const history = await store.getHistory('feishu:chat_123', 100);

// 裁剪旧消息
await store.trimOldMessages('feishu:chat_123', 50);

// 清理过期会话
await store.cleanup(7 * 24 * 60 * 60 * 1000); // 7 天
```

### 存储结构

数据库路径：`~/.micro-agent/data/sessions.db`

```sql
-- sessions 表
CREATE TABLE sessions (
  key TEXT PRIMARY KEY,
  channel TEXT NOT NULL,
  chat_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  last_consolidated INTEGER
);

-- messages 表
CREATE TABLE messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_key TEXT NOT NULL,
  seq_num INTEGER NOT NULL,
  message_json TEXT NOT NULL,
  timestamp INTEGER NOT NULL,
  FOREIGN KEY (session_key) REFERENCES sessions(key)
);
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