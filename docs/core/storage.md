# Storage - 存储层

## 概述

存储层提供两种存储服务：
- **SessionStore**：短期会话存储，JSONL 格式
- **MemoryStore**：长期记忆存储，向量检索

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
import { SessionStore } from '@microbot/storage';

const store = new SessionStore({
  sessionsDir: '~/.microbot/sessions',
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
~/.microbot/sessions/
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

## MemoryStore

记忆存储提供长期记忆能力，基于 LanceDB 实现向量检索。

### 功能特性

- **向量存储**：使用嵌入模型将文本转化为向量
- **语义检索**：基于相似度搜索相关记忆
- **全文检索**：关键词匹配，支持中文 n-gram
- **混合搜索**：结合向量和全文检索结果
- **Markdown 归档**：记忆同时保存为 Markdown 文件

### 使用示例

```typescript
import { MemoryStore } from '@microbot/runtime';

const store = new MemoryStore({
  storagePath: '~/.microbot/memory',
  embeddingService: embeddingService, // 可选
  defaultSearchLimit: 10,
  shortTermRetentionDays: 7,
});

await store.initialize();

// 存储记忆
await store.store({
  id: 'mem_001',
  sessionId: 'feishu:chat_123',
  type: 'preference',
  content: '用户偏好使用 TypeScript 进行开发',
  metadata: { tags: ['preference', 'tech'] },
  createdAt: new Date(),
  updatedAt: new Date(),
});

// 语义检索（需要 embeddingService）
const memories = await store.search('TypeScript 项目', { 
  limit: 5,
  mode: 'vector'  // 'vector' | 'fulltext'
});

// 获取最近记忆
const recent = await store.getRecent('feishu:chat_123', 20);

// 清理过期记忆
const result = await store.cleanupExpired();
console.log(`已清理 ${result.deletedCount} 条过期记忆`);
```

### 存储结构

```
~/.microbot/memory/
├── lancedb/           # 向量数据库
├── sessions/          # Markdown 归档
│   ├── feishu_chat_123.md
│   └── feishu_chat_456.md
└── summaries/         # 会话摘要
```

### 检索模式

| 模式 | 说明 | 依赖 |
|------|------|------|
| `vector` | 向量相似度检索 | embeddingService |
| `fulltext` | 关键词匹配 | 无 |

当未配置 `embeddingService` 时，自动降级为全文检索。

### 全文检索特性

支持中英文混合查询：
- 英文：提取连续字母单词
- 中文：使用 n-gram（2-3 字符组）
- 数字：提取连续数字

---

## 源码位置

| 模块 | 路径 |
|------|------|
| SessionStore | `packages/storage/src/session/store.ts` |
| MemoryStore | `packages/runtime/src/memory/store.ts` |