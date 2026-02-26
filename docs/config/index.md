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
    chat: deepseek/deepseek-chat      # 对话模型（必填）
    embed: text-embedding-3-small     # 嵌入模型（可选，用于记忆系统）
    vision: deepseek/deepseek-chat    # 视觉模型（可选）
    coder: deepseek/deepseek-chat     # 编程模型（可选）
  
  # 生成参数
  maxTokens: 512
  temperature: 0.7

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
| vision | 图片识别、图像理解 | `agents.models.vision` |
| coder | 代码编写、程序开发 | `agents.models.coder` |
| embed | 向量嵌入、语义检索 | `agents.models.embed` |

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
    maxIterations: 20  # 工具调用最大迭代次数
```

| 参数 | 范围 | 默认值 | 说明 |
|------|------|--------|------|
| maxIterations | - | 20 | 工具调用最大迭代次数 |