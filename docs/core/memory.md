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
| `auto` | 默认 | 自动选择（向量优先，无嵌入服务时降级全文） |
| `vector` | 配置嵌入服务 | 强制向量检索，基于语义相似度 |
| `fulltext` | 无嵌入服务 | 强制全文检索，基于关键词匹配 |
| `hybrid` | 配置嵌入服务 | 混合检索，结合向量和全文 |

**向量检索算法**：
1. 向量检索 Top-200 条记忆
2. 关键词重排序，结合向量相似度（权重 0.7）和关键词匹配度（权重 0.3）
3. 返回最终 Top-N 结果

**双层检索算法**：
1. 第一层：向量检索 Top-200 条记忆
2. 第二层：关键词重排序，结合向量相似度（0.7）和关键词匹配度（0.3）
3. 返回最终 Top-N 结果

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
    multiEmbed:                      # 多嵌入模型配置
      enabled: true
      maxModels: 3
      autoMigrate: true
      batchSize: 50
      migrateInterval: 0
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
| `multiEmbed.enabled` | boolean | true | 是否启用多嵌入模型 |
| `multiEmbed.maxModels` | number | 3 | 最大支持的嵌入模型数 |
| `multiEmbed.autoMigrate` | boolean | true | 是否自动迁移向量数据 |
| `multiEmbed.batchSize` | number | 50 | 迁移批次大小 |
| `multiEmbed.migrateInterval` | number | 0 | 迁移间隔时间 (ms) |

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
| `preference` | 用户偏好 | 用户偏好设置 |
| `fact` | 事实记忆 | 用户信息、实体信息 |
| `decision` | 决策记录 | 重要决策 |
| `entity` | 实体记忆 | 提及的实体 |
| `document` | 文档知识 | 从知识库导入的内容 |

## 源码位置

- 记忆存储: `agent-service/runtime/capability/memory/`
- 嵌入服务: `agent-service/runtime/provider/embedding/`
- SDK 封装: `sdk/src/memory/`

## SDK 高级封装

SDK 层对基础记忆系统进行了高级封装，提供更强大的功能。

### MemoryManager

```typescript
import { MemoryManager } from '@micro-agent/sdk/memory';

const memory = new MemoryManager({
  vectorDb: lancedb,
  sessionStore: sessionStore,
  embedService: embeddingService,
});

// 存储记忆
await memory.store({
  content: '用户喜欢蓝色',
  type: 'preference',
});

// 检索记忆
const results = await memory.search('用户颜色偏好');
```

### 自动整合 (Consolidation)

SDK 提供自动整合功能，将短期对话整合为长期记忆：

| 组件 | 功能 |
|------|------|
| `ConsolidationExecutor` | 协调整合流程，确保记忆增长不超过原始消息的 20% |
| `ConsolidationTrigger` | 触发策略管理（阈值/空闲/事件） |
| `IdleDetector` | 会话空闲检测 |
| `FactExtractor` | 从对话中提取事实、决策、偏好 |
| `ConversationSummarizer` | 生成结构化摘要 |

```typescript
import { ConsolidationExecutor } from '@micro-agent/sdk/memory';

const executor = new ConsolidationExecutor({
  messageThreshold: 20,        // 触发消息数
  idleTimeout: 300000,         // 空闲超时 (ms)
  maxMemoryGrowthRate: 0.2,    // 最大增长率 20%
  summaryTokenBudget: 500,      // 摘要 token 预算
});
```

### 遗忘曲线 (Forgetting)

基于艾宾浩斯遗忘曲线自动清理低价值记忆：

```typescript
import { ForgettingEngine } from '@micro-agent/sdk/memory';

const engine = new ForgettingEngine({
  retentionThreshold: 0.1,    // 保持率阈值
  minAgeDays: 7,              // 最小存活天数
  maxAgeDays: 365,            // 最大存活天数
  defaultHalfLifeDays: 30,    // 半衰期
  considerImportance: true,    // 考虑重要性
  importanceWeight: 0.3,      // 重要性权重
});
```

### AI 分类器 (Classifiers)

自动分类记忆内容：

```typescript
import { MemoryClassifier, PreferenceClassifier } from '@micro-agent/sdk/memory';

// 记忆分类
const result = await classifier.classify('用户说他喜欢蓝色');
// { type: 'preference', confidence: 0.95 }

// 偏好检测
const preferences = await prefClassifier.detectPreferences(messages);
```

### 重要性评分 (Scoring)

自动评估记忆的重要性：

```typescript
import { ImportanceScorer } from '@micro-agent/sdk/memory';

const scorer = new ImportanceScorer();

// 计算重要性分数
const score = await scorer.calculateImportance(memoryEntry);
// 考虑因素：记忆类型、访问频率、时间衰减
```

### 安全模块

自动检测和脱敏敏感信息：

```typescript
import { SensitiveDetector } from '@micro-agent/sdk/memory';

const detector = new SensitiveDetector();

// 检测敏感信息
const result = detector.detect('我的邮箱是 test@example.com');
// { type: 'email', value: 'test@example.com', action: 'redact' }

// 支持的检测类型
// - api_key: API 密钥
// - email: 邮箱地址
// - phone: 手机号码
// - id_card: 身份证号
// - bank_card: 银行卡号
// - password: 密码字段
```
