# Memory - 记忆系统

## 概述

记忆系统为 Agent 提供长期记忆能力，支持对话历史存储、语义检索和自动摘要。通过向量检索实现相似内容召回，使 Agent 能够"记住"历史交互。

## 架构

```
┌─────────────────────────────────────────────────────────────┐
│                      AgentExecutor                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │ 检索记忆     │→│ 注入提示词   │→│ 执行对话        │  │
│  └──────────────┘  └──────────────┘  └──────────────────┘  │
│                                              ↓              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │ 空闲摘要     │←│ 检查阈值     │←│ 存储记忆        │  │
│  └──────────────┘  └──────────────┘  └──────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                       MemoryStore                           │
│  ┌──────────────────┐  ┌──────────────────────────────┐    │
│  │ LanceDB (向量)   │  │ Markdown (会话记录)          │    │
│  └──────────────────┘  └──────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                    EmbeddingService                         │
│  ┌──────────────────┐  ┌──────────────────────────────┐    │
│  │ OpenAI Embedding │  │ NoEmbedding (降级方案)       │    │
│  └──────────────────┘  └──────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

## 核心组件

### MemoryStore

记忆存储，使用 LanceDB 存储向量，Markdown 存储会话记录。

**功能**：
- 向量检索：基于语义相似度召回记忆
- 全文检索：无嵌入服务时的降级方案
- 会话记录：Markdown 格式持久化

```typescript
import { MemoryStore } from '@micro-agent/runtime/memory';

const store = new MemoryStore({
  storagePath: '~/.micro-agent/memory',
  embeddingService: embeddingService,
  defaultSearchLimit: 10,
  shortTermRetentionDays: 7,
});

await store.initialize();

// 存储记忆
await store.store({
  id: 'uuid',
  sessionId: 'channel:chatId',
  type: 'conversation',
  content: '用户: 你好\n助手: 你好！',
  metadata: { tags: ['conversation'] },
  createdAt: new Date(),
  updatedAt: new Date(),
});

// 检索记忆
const memories = await store.search('用户之前问了什么', { limit: 5 });

// 获取最近记忆
const recent = await store.getRecent('channel:chatId', 20);

// 清理过期记忆
const result = await store.cleanupExpired();
```

**检索模式**：

| 模式 | 条件 | 说明 |
|------|------|------|
| 向量检索 | 配置嵌入服务 | 基于语义相似度，召回最相关记忆 |
| 全文检索 | 无嵌入服务 | 基于关键词匹配，支持中英文混合 |

**全文检索算法**：
- 英文：提取连续字母作为关键词
- 中文：2-gram 和 3-gram 分词
- 数字：提取连续数字

### EmbeddingService

嵌入服务，将文本转换为向量。

```typescript
import { createEmbeddingService } from '@micro-agent/runtime/memory';

// 创建嵌入服务（需配置 embed 模型）
const embedding = createEmbeddingService(
  'text-embedding-3-small',
  'https://api.openai.com/v1',
  'sk-xxx'
);

// 检查可用性
if (embedding.isAvailable()) {
  // 生成嵌入向量
  const vector = await embedding.embed('这是要编码的文本');
  
  // 批量生成
  const vectors = await embedding.embedBatch(['文本1', '文本2']);
}
```

**降级方案**：

未配置嵌入模型时，自动使用 `NoEmbedding` 降级：

```typescript
const noEmbedding = createEmbeddingService(null, '', '');
noEmbedding.isAvailable(); // false
```

### ConversationSummarizer

对话摘要器，生成长对话的结构化摘要。

**触发条件**：
1. 阈值触发：消息数量达到 `summarizeThreshold`
2. 空闲触发：无活动超过 `idleTimeout`

```typescript
import { ConversationSummarizer } from '@micro-agent/runtime/memory';

const summarizer = new ConversationSummarizer(
  gateway,      // LLMGateway
  memoryStore,  // MemoryStore
  {
    minMessages: 20,
    maxLength: 2000,
    idleTimeout: 300000, // 5 分钟
  }
);

// 检查是否需要摘要
if (summarizer.shouldSummarize(messages)) {
  const summary = await summarizer.summarize(messages);
  await summarizer.storeSummary(summary, sessionId);
}

// 启动空闲检查
summarizer.startIdleCheck(sessionId, () => messages);

// 记录活动时间
summarizer.recordActivity();
```

**摘要结构**：

```typescript
interface Summary {
  id: string;
  topic: string;           // 对话主题
  keyPoints: string[];     // 关键要点
  decisions: string[];     // 决策列表
  todos: Array<{           // 待办事项
    done: boolean;
    content: string;
  }>;
  entities: string[];      // 提及的实体
  timeRange: {
    start: Date;
    end: Date;
  };
  originalMessageCount: number;
}
```

## 配置说明

```yaml
agents:
  models:
    chat: gpt-4o
    embed: text-embedding-3-small  # 嵌入模型
  
  memory:
    enabled: true                    # 启用记忆系统
    storagePath: '~/.micro-agent/memory'
    autoSummarize: true              # 自动摘要
    summarizeThreshold: 20           # 触发阈值
    idleTimeout: 300000              # 空闲超时 (ms)
    shortTermRetentionDays: 7        # 保留天数
    searchLimit: 10                  # 检索数量
```

**配置项说明**：

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `enabled` | boolean | true | 是否启用记忆系统 |
| `storagePath` | string | ~/.micro-agent/memory | 存储路径 |
| `autoSummarize` | boolean | true | 是否自动摘要 |
| `summarizeThreshold` | number | 20 | 触发摘要的消息数 |
| `idleTimeout` | number | 300000 | 空闲超时时间 (ms) |
| `shortTermRetentionDays` | number | 7 | 短期记忆保留天数 |
| `searchLimit` | number | 10 | 检索结果数量上限 |

## 工作流程

### 记忆检索流程

```
用户消息 → 构建查询 → 向量/全文检索 → 返回相关记忆
                                           ↓
                              注入系统提示词 (<relevant-memories>)
```

1. 用户发送消息
2. AgentExecutor 调用 `retrieveMemories(query)`
3. MemoryStore 执行检索（向量优先，全文降级）
4. 相关记忆注入系统提示词

### 记忆存储流程

```
对话完成 → 构建 MemoryEntry → 存储 LanceDB → 存储 Markdown
```

1. 对话完成后触发 `storeMemory()`
2. 构建 MemoryEntry（包含对话内容）
3. 存储到 LanceDB（向量 + 元数据）
4. 追加到 Markdown 文件

### 自动摘要流程

```
消息数 ≥ 阈值 → 生成摘要 → 存储摘要 → 清理原始记录
     或
空闲超时 → 生成摘要 → 存储
```

1. 检查触发条件（阈值/空闲）
2. LLM 生成结构化摘要
3. 存储摘要类型记忆
4. 可选清理原始记录

## 使用示例

### 基础用法

```typescript
import { Container } from '@micro-agent/sdk';
import { MemoryStore, createEmbeddingService, ConversationSummarizer } from '@micro-agent/runtime/memory';

const container = Container.getInstance();

// 创建嵌入服务
const embedding = createEmbeddingService(
  config.agents.models?.embed ?? null,
  providerUrl,
  apiKey
);

// 创建记忆存储
const memoryStore = new MemoryStore({
  storagePath: config.agents.memory?.storagePath ?? '~/.micro-agent/memory',
  embeddingService: embedding,
  defaultSearchLimit: config.agents.memory?.searchLimit ?? 10,
});

// 创建摘要器
const summarizer = new ConversationSummarizer(
  gateway,
  memoryStore,
  {
    minMessages: config.agents.memory?.summarizeThreshold ?? 20,
    idleTimeout: config.agents.memory?.idleTimeout ?? 300000,
  }
);

// 注入到执行器
const executor = new AgentExecutor(
  bus,
  gateway,
  tools,
  config,
  memoryStore,
  summarizer
);
```

### 手动检索

```typescript
// 检索相关记忆
const memories = await memoryStore.search('用户之前提到的项目');

// 注入到提示词
const context = memories.map(m => 
  `[${m.type}] ${m.content.slice(0, 200)}`
).join('\n');

const systemPrompt = `${basePrompt}\n\n相关记忆:\n${context}`;
```

### 记忆类型

| 类型 | 说明 | 存储内容 |
|------|------|----------|
| `conversation` | 对话记录 | 用户-助手交互 |
| `summary` | 对话摘要 | 结构化摘要 |
| `fact` | 事实记忆 | 用户偏好、实体信息 |
| `task` | 任务记忆 | 待办事项、项目状态 |

## 源码位置

- 记忆存储: `packages/runtime/src/memory/store.ts`
- 嵌入服务: `packages/runtime/src/memory/embedding.ts`
- 对话摘要: `packages/runtime/src/memory/summarizer.ts`
- 执行器集成: `packages/runtime/src/executor/index.ts`
- 配置定义: `packages/config/src/schema.ts`
