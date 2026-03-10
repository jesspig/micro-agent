# 配置指南

## 配置层级

MicroAgent 采用三级配置系统，优先级从低到高：

| 层级 | 路径 | 说明 |
|------|------|------|
| User | `~/.micro-agent/settings.yaml` | 用户全局配置 |
| Project | `<workspace>/.micro-agent/settings.yaml` | 项目配置 |
| Directory | `<currentDir>/.micro-agent/settings.yaml` | 目录配置（最高优先级） |

配置会按优先级合并，高优先级配置覆盖低优先级。

## 配置文件

主配置文件位于 `~/.micro-agent/settings.yaml`

## 完整配置示例

```yaml
# Agent 配置
agents:
  # 工作区路径
  workspace: ~/.micro-agent/workspace

  # 模型配置（格式：<provider>/<model>）
  models:
    chat: ollama/qwen3         # 对话模型（必填）
    intent: ollama/qwen3       # 意图识别模型（可选）
    embed: openai/text-embedding-3-small  # 嵌入模型（可选，用于记忆系统）
    vision: ollama/qwen3-vl     # 视觉模型（可选）
    coder: ollama/qwen3        # 编程模型（可选）

  # 生成参数
  maxTokens: 512
  temperature: 0.7
  topK: 50
  topP: 0.7
  frequencyPenalty: 0.5

# LLM 提供商
providers:
  deepseek:
    baseUrl: https://api.deepseek.com/v1
    apiKey: ${DEEPSEEK_API_KEY}
    models:
      - deepseek-chat
      - deepseek-reasoner
  
  ollama:
    baseUrl: http://localhost:11434/v1
    models:
      - qwen3
      - qwen3-vl

# 通道配置
channels:
  feishu:
    enabled: true
    appId: xxx
    appSecret: xxx
    allowFrom: []  # 允许所有人
```

详细的飞书配置步骤请参考 [通道扩展 - 飞书通道](/extensions/channels#飞书通道)。

## 环境变量

支持在配置中使用环境变量：

```yaml
providers:
  deepseek:
    apiKey: ${DEEPSEEK_API_KEY}
```

## 任务类型

| 类型 | 说明 | 模型配置 |
|------|------|----------|
| chat | 常规对话、问答 | `agents.models.chat` |
| intent | 意图识别、预处理 | `agents.models.intent` |
| embed | 向量嵌入、语义检索 | `agents.models.embed` |
| vision | 图片识别、图像理解 | `agents.models.vision` |
| coder | 代码编写、程序开发 | `agents.models.coder` |
| tool | 工具调用、函数执行 | `agents.models.tool` |

未配置专用模型时，默认使用 chat 模型。embed 模型未配置时，记忆系统将使用全文检索。

## 记忆系统

记忆系统允许 Agent 记住历史对话，支持跨会话检索和自动摘要。

```yaml
agents:
  memory:
    enabled: true
    storagePath: ~/.micro-agent/memory
    autoSummarize: true
    summarizeThreshold: 20
    idleTimeout: 300000
    shortTermRetentionDays: 7
    searchLimit: 10
```

| 参数 | 范围 | 默认值 | 说明 |
|------|------|--------|------|
| enabled | - | true | 是否启用记忆系统 |
| storagePath | - | ~/.micro-agent/memory | 记忆存储路径 |
| autoSummarize | - | true | 是否启用自动摘要 |
| summarizeThreshold | - | 20 | 触发摘要的消息阈值 |
| idleTimeout | - | 300000 | 空闲超时触发摘要（毫秒） |
| shortTermRetentionDays | - | 7 | 短期记忆保留天数 |
| searchLimit | 1-50 | 10 | 检索结果数量限制 |

记忆系统依赖嵌入模型进行语义检索，需配置 `agents.models.embed`。若未配置嵌入模型，系统将回退到全文检索模式。

## 生成参数

| 参数 | 范围 | 默认值 | 说明 |
|------|------|--------|------|
| maxTokens | 1-8192 | 512 | 最大生成长度 |
| temperature | 0-1.5 | 0.7 | 温度，越低越确定 |
| topK | - | 50 | Top-K 采样 |
| topP | - | 0.7 | Top-P 核采样 |
| frequencyPenalty | 0-2 | 0.5 | 频率惩罚 |

## 执行器配置

```yaml
agents:
  executor:
    maxIterations: 20    # 工具调用最大迭代次数
    loopDetection:       # 循环检测配置
      enabled: true
      warningThreshold: 3   # 警告阈值
      criticalThreshold: 5  # 临界阈值
```

| 参数 | 范围 | 默认值 | 说明 |
|------|------|--------|------|
| maxIterations | - | 20 | 工具调用最大迭代次数 |
| loopDetection.enabled | - | true | 是否启用循环检测 |
| loopDetection.warningThreshold | - | 3 | 连续相同调用警告阈值 |
| loopDetection.criticalThreshold | - | 5 | 连续相同调用临界阈值 |

## 知识库配置

```yaml
knowledgeBase:
  enabled: true
  basePath: ~/.micro-agent/knowledge
  chunkSize: 1000
  chunkOverlap: 200
  maxSearchResults: 5
  minSimilarityScore: 0.5
```

| 参数 | 范围 | 默认值 | 说明 |
|------|------|--------|------|
| enabled | - | true | 是否启用知识库 |
| basePath | - | ~/.micro-agent/knowledge | 知识库基础路径 |
| chunkSize | 100-8000 | 1000 | 文档分块大小 |
| chunkOverlap | 0-1000 | 200 | 文档分块重叠大小 |
| maxSearchResults | 1-50 | 5 | 最大搜索结果数 |
| minSimilarityScore | 0-1 | 0.5 | 最小相似度阈值 |
| buildInterval | ≥1000 | 5000 | 后台构建间隔（毫秒） |
| embedModel | - | - | 嵌入模型 ID（可选） |

## 多嵌入模型配置

```yaml
agents:
  memory:
    multiEmbed:
      enabled: true           # 启用多嵌入模型
      maxModels: 3            # 最大模型数量
      autoMigrate: true       # 自动迁移向量数据
      batchSize: 50           # 迁移批次大小
      migrateInterval: 0      # 迁移间隔（毫秒）
```

| 参数 | 范围 | 默认值 | 说明 |
|------|------|--------|------|
| enabled | - | true | 是否启用多嵌入模型 |
| maxModels | 1-10 | 3 | 最大支持的嵌入模型数量 |
| autoMigrate | - | true | 是否自动迁移向量数据 |
| batchSize | 1-100 | 50 | 迁移批次大小 |
| migrateInterval | - | 0 | 迁移间隔时间 |

多嵌入模型支持向量数据自动迁移，切换嵌入模型时无需重新索引。

## 通道配置

```yaml
channels:
  feishu:
    enabled: true
    appId: xxx
    appSecret: xxx
    allowFrom: []  # 允许所有人
```

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| enabled | boolean | false | 是否启用通道 |
| appId | string | - | 飞书应用 ID |
| appSecret | string | - | 飞书应用密钥 |
| allowFrom | string[] | [] | 允许发送消息的用户 ID 列表 |

## 引用配置

配置知识库检索结果的引用格式：

```yaml
agents:
  citation:
    enabled: true
    minConfidence: 0.5
    maxCitations: 5
    format: numbered  # numbered | bracket | footnote
    maxSnippetLength: 200
```

| 参数 | 范围 | 默认值 | 说明 |
|------|------|--------|------|
| enabled | - | true | 是否启用引用 |
| minConfidence | 0-1 | 0.5 | 最小置信度阈值 |
| maxCitations | 1-10 | 5 | 最大引用数量 |
| format | - | numbered | 引用格式 |
| maxSnippetLength | 50-500 | 200 | 引用片段最大长度 |

## 循环检测配置

配置工具调用循环检测，防止 Agent 陷入无限循环：

```yaml
agents:
  executor:
    maxIterations: 20
    loopDetection:
      enabled: true
      warningThreshold: 3
      criticalThreshold: 5
```

| 参数 | 范围 | 默认值 | 说明 |
|------|------|--------|------|
| maxIterations | - | 20 | 工具调用最大迭代次数 |
| loopDetection.enabled | - | true | 是否启用循环检测 |
| loopDetection.warningThreshold | - | 3 | 警告阈值（连续相同调用） |
| loopDetection.criticalThreshold | - | 5 | 临界阈值（连续相同调用） |

## 工作区配置

配置多个工作区：

```yaml
workspaces:
  - path: ~/project1
    name: 项目一
    description: 第一个项目

  - path: ~/project2
    name: 项目二
```

| 参数 | 类型 | 说明 |
|------|------|------|
| path | string | 工作区路径 |
| name | string | 工作区名称（可选） |
| description | string | 工作区描述（可选） |

## 完整配置示例

```yaml
# 工作区
workspaces:
  - path: ~/micro-agent-workspace

# Agent 配置
agents:
  workspace: ~/micro-agent-workspace

  # 模型配置
  models:
    chat: openai/gpt-4o-mini
    intent: openai/gpt-4o-mini
    embed: openai/text-embedding-3-small
    vision: openai/gpt-4o
    coder: openai/gpt-4o

  # 生成参数
  maxTokens: 512
  temperature: 0.7
  topK: 50
  topP: 0.7
  frequencyPenalty: 0.5

  # 执行器
  executor:
    maxIterations: 20
    loopDetection:
      enabled: true
      warningThreshold: 3
      criticalThreshold: 5

  # 记忆系统
  memory:
    enabled: true
    storagePath: ~/.micro-agent/memory
    autoSummarize: true
    summarizeThreshold: 20
    idleTimeout: 300000
    shortTermRetentionDays: 7
    searchLimit: 10
    multiEmbed:
      enabled: true
      maxModels: 3
      autoMigrate: true
      batchSize: 50
      migrateInterval: 0

  # 引用配置
  citation:
    enabled: true
    minConfidence: 0.5
    maxCitations: 5
    format: numbered
    maxSnippetLength: 200

# LLM 提供商
providers:
  openai:
    baseUrl: https://api.openai.com/v1
    apiKey: ${OPENAI_API_KEY}
    models:
      - gpt-4o
      - gpt-4o-mini
      - text-embedding-3-small

  deepseek:
    baseUrl: https://api.deepseek.com/v1
    apiKey: ${DEEPSEEK_API_KEY}
    models:
      - deepseek-chat
      - deepseek-reasoner

  ollama:
    baseUrl: http://localhost:11434/v1
    models:
      - qwen3
      - qwen3-vl

# 知识库
knowledgeBase:
  enabled: true
  basePath: ~/.micro-agent/knowledge
  chunkSize: 1000
  chunkOverlap: 200
  maxSearchResults: 5
  minSimilarityScore: 0.5
  backgroundBuild:
    enabled: true
    interval: 60000
    batchSize: 3
    idleDelay: 5000

# 通道配置
channels:
  feishu:
    enabled: false
    appId: ${FEISHU_APP_ID}
    appSecret: ${FEISHU_APP_SECRET}
    allowFrom: []
```

## 源码位置

- 配置 Schema: `agent-service/runtime/infrastructure/config/schema.ts`
- 默认配置: `agent-service/runtime/infrastructure/config/defaults.ts`
- SDK 配置封装: `sdk/src/config/`