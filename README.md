# MicroBot

[![Version](https://img.shields.io/badge/Version-0.1.0-blue.svg)](https://github.com/jesspig/microbot)
[![Bun](https://img.shields.io/badge/Bun-1.3.9-black?logo=bun)](https://bun.sh/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9.3-blue?logo=typescript)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

基于 **Bun + TypeScript** 的超轻量级个人 AI 助手框架。

**[📖 在线文档](https://jesspig.github.io/microbot/)** | **[📦 更新日志](https://jesspig.github.io/microbot/guide/changelog)**

## 特性

| 特性 | 说明 |
|------|------|
| 轻量高效 | Bun 原生性能，核心代码简洁 |
| 模块化架构 | Core SDK + Extensions 分层设计 |
| 智能路由 | 根据任务复杂度自动选择模型 |
| 多通道支持 | 飞书（更多通道开发中） |
| 本地优先 LLM | Ollama / LM Studio / OpenAI Compatible |

## 安装

### 方式一：克隆运行（推荐）

```bash
git clone https://github.com/jesspig/microbot.git
cd microbot
bun install
bun start
```

### 方式二：直接运行

```bash
bunx jesspig/microbot start
```

## 快速开始

### 配置 LLM

**本地 Ollama（推荐）**

```bash
ollama pull qwen3
```

**云服务**

```bash
export DEEPSEEK_API_KEY=your-api-key
# 或
export OPENAI_API_KEY=your-api-key
```

### 启动

```bash
bun start
```

首次启动自动创建 `~/.microbot/settings.yaml` 配置文件。

## CLI 命令

```bash
microbot <command> [options]

Commands:
  start       启动服务
  status      显示状态

Options:
  -c, --config <path>   配置文件路径
  -h, --help            显示帮助
  -v, --version         显示版本
```

## 架构

```
Channel ──► ChannelManager ──► MessageBus
                                     │
              ┌──────────────────────┼──────────────────────┐
              ▼                      ▼                      ▼
         InboundQueue            AgentLoop             OutboundConsumer
                                     │
              ┌──────────────────────┴──────────────────────┐
              ▼                      ▼                      
        ContextBuilder          ToolRegistry           
              │                      │                      
              └──────────────────────┘                      
                                     │
                                     ▼
                               LLM Gateway
                               │         │
                     ┌─────────┘         └─────────┐
                     ▼                             ▼
                  Ollama                   OpenAI Compatible
```

## 核心模块

| 模块 | 路径 | 说明 |
|------|------|------|
| 容器 | `packages/core/src/container.ts` | 依赖注入容器 |
| 事件总线 | `packages/core/src/event-bus.ts` | 类型安全的事件系统 |
| 钩子系统 | `packages/core/src/hook-system.ts` | 前置/后置钩子 |
| 中间件 | `packages/core/src/pipeline.ts` | 可组合的处理链 |
| 配置 | `packages/core/src/config/` | YAML 配置加载与验证 |
| LLM | `packages/core/src/providers/` | Provider 抽象、Gateway、路由 |
| Agent | `packages/core/src/agent/` | ReAct 循环、上下文构建 |
| 工具 | `packages/core/src/tool/` | 工具注册表 |
| 通道 | `packages/core/src/channel/` | 通道管理器 |
| 技能 | `packages/core/src/skill/` | 技能加载器 |
| 存储 | `packages/core/src/storage/` | 会话存储 |

## 扩展模块

| 模块 | 路径 | 说明 |
|------|------|------|
| 工具 | `extensions/tool/` | 文件、Shell、Web 工具 |
| 技能 | `extensions/skill/` | time、sysinfo |
| 通道 | `extensions/channel/` | 飞书 |

## 内置工具

| 工具 | 说明 |
|------|------|
| `read_file` | 读取文件 |
| `write_file` | 写入文件 |
| `list_directory` | 列出目录 |
| `exec` | 执行 Shell 命令 |
| `web_fetch` | 获取网页内容 |
| `send_message` | 发送消息 |

## 内置技能

| 技能 | 说明 |
|------|------|
| `time` | 时间查询、格式转换、时区处理 |
| `sysinfo` | CPU、内存、磁盘、网络状态 |

## 通道配置

<details>
<summary>飞书</summary>

使用 WebSocket 长连接，无需公网 IP。

1. 创建飞书应用 → 启用机器人能力
2. 权限：添加 `im:message` 和 `im:resource`
3. 事件订阅：选择「使用长连接接收事件」，添加 `im.message.receive_v1`
4. 获取 App ID 和 App Secret

```yaml
channels:
  feishu:
    enabled: true
    appId: cli_xxx
    appSecret: xxx
    allowFrom: []
```

</details>

## LLM Provider

**模型格式**: `provider/model`（如 `ollama/qwen3`、`deepseek/deepseek-chat`）

```yaml
providers:
  ollama:
    baseUrl: http://localhost:11434/v1
    models: [qwen3]

  deepseek:
    baseUrl: https://api.deepseek.com/v1
    apiKey: ${DEEPSEEK_API_KEY}
    models: [deepseek-chat]
```

**Gateway 特性**:

- 自动路由：根据 `provider/model` 格式路由
- 智能路由：根据任务复杂度选择合适模型
- 故障转移：主 Provider 失败时自动切换备用

## 数据目录

```
~/.microbot/
├── settings.yaml          # 用户配置
└── sessions/              # 会话存储（JSONL）
```

## 开发

```bash
bun run dev          # 开发模式
bun run typecheck    # 类型检查
bun test             # 运行测试
```

## 项目结构

```
microbot/
├── packages/
│   └── core/               # Core SDK
│       └── src/
│           ├── container.ts
│           ├── event-bus.ts
│           ├── hook-system.ts
│           ├── pipeline.ts
│           ├── types/
│           ├── config/
│           ├── providers/
│           ├── agent/
│           ├── tool/
│           ├── channel/
│           ├── skill/
│           └── storage/
├── extensions/
│   ├── tool/               # 工具扩展
│   ├── skill/              # 技能扩展
│   └── channel/            # 通道扩展
├── src/
│   ├── index.ts            # 应用入口
│   └── cli.ts              # CLI 命令
├── tests/                  # 测试
├── docs/                   # 文档
└── workspace/              # 工作空间配置
```

## License

MIT