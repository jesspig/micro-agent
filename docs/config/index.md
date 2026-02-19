# 配置指南

## 配置文件

配置文件位于 `~/.microbot/settings.yaml`

## 完整配置示例

```yaml
# 代理/模型配置
agents:
  workspace: ~/.microbot/workspace
  models:
    chat: deepseek-chat
    check: deepseek-chat
  maxTokens: 8192
  temperature: 0.7
  topK: 50
  topP: 0.7
  frequencyPenalty: 0.5
  maxToolIterations: 20
  auto: true
  max: false

# LLM 提供商
providers:
  ollama:
    baseUrl: http://localhost:11434/v1
    models:
      - deepseek-chat
      - qwen2.5-coder
  
  openai:
    baseUrl: https://api.deepseek.com/v1
    apiKey: ${OPENAI_API_KEY}
    models:
      - id: deepseek-chat
        level: medium
        tool: true
      - id: deepseek-reasoner
        level: ultra
        think: true

# 通道配置
channels:
  feishu:
    enabled: true
    appId: xxx
    appSecret: xxx

# 路由配置
routing:
  enabled: true
  rules:
    - keywords: [架构, architecture]
      level: ultra
      priority: 10
```

## 环境变量

支持在配置中使用环境变量：

```yaml
providers:
  openai:
    apiKey: ${OPENAI_API_KEY}
```

## 模型级别

| 级别 | 说明 | 适用场景 |
|------|------|----------|
| fast | 最快响应 | 简单问答 |
| low | 低性能 | 简单任务 |
| medium | 中等性能 | 一般对话 |
| high | 高性能 | 复杂任务 |
| ultra | 最高性能 | 架构设计、重构 |
