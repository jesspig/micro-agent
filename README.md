# microbot

[![Bun](https://img.shields.io/badge/Bun-1.3.9-black?logo=bun)](https://bun.sh/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9.3-blue?logo=typescript)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

基于 **Bun + TypeScript** 的超轻量级个人 AI 助手框架，参考 [nanobot](https://github.com/HKUDS/nanobot) 设计理念实现。

## 特性

| 特性 | 说明 |
|------|------|
| 轻量高效 | Bun 原生性能，核心代码简洁 |
| 多通道支持 | 飞书、QQ、钉钉、企业微信 |
| 本地优先 LLM | Ollama / LM Studio / vLLM / OpenAI Compatible |
| 定时任务 | at / every / cron 三种调度方式 |
| 记忆系统 | 日记 + 长期记忆，上下文自动注入 |
| 工具生态 | 文件操作、Shell 命令、Web 搜索 |
| 技能系统 | Markdown 定义，渐进式加载 |

## 快速开始

### 安装

```bash
git clone https://github.com/jesspig/microbot.git
cd microbot
pnpm install
```

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
  cron        管理定时任务

Options:
  -c, --config <path>   配置文件路径
  -h, --help            显示帮助
  -v, --version         显示版本
```

## 架构

```
Channel (WebSocket) ──► ChannelManager ──► MessageBus
                                              │
                    ┌─────────────────────────┼─────────────────────────┐
                    ▼                         ▼                         ▼
               InboundQueue              AgentLoop                OutboundConsumer
                                              │
                    ┌─────────────────────────┼─────────────────────────┐
                    ▼                         ▼                         ▼
              ContextBuilder            ToolRegistry             MemoryManager
                    │                         │                         │
                    └─────────────────────────┴─────────────────────────┘
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
| 类型定义 | `src/types/` | 核心接口，零依赖 |
| 配置管理 | `src/config/` | YAML 配置加载与验证 |
| 事件系统 | `src/bus/` | 消息队列与事件总线 |
| 存储层 | `src/session/` `src/memory/` `src/cron/` | SQLite 持久化 |
| 工具系统 | `src/tools/` | 文件、Shell、Web 工具 |
| LLM Provider | `src/providers/` | Ollama、OpenAI Compatible |
| Agent 核心 | `src/agent/` | ReAct 循环、上下文构建 |
| 通道系统 | `src/channels/` | 飞书、QQ、钉钉、企业微信 |
| 技能系统 | `src/skills/` | Markdown 定义技能 |

## 通道配置

<details>
<summary>飞书</summary>

使用 WebSocket 长连接，无需公网 IP。

1. 创建飞书应用 → 启用机器人能力
2. 权限：添加 `im:message`
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

<details>
<summary>QQ</summary>

待实现。

</details>

<details>
<summary>钉钉</summary>

待实现。

</details>

<details>
<summary>企业微信</summary>

待实现。

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

  openai:
    baseUrl: https://api.openai.com/v1
    apiKey: ${OPENAI_API_KEY}
    models: [gpt-4o, gpt-4o-mini]
```

**Gateway 特性**:

- 自动路由：根据 `provider/model` 格式路由
- 故障转移：主 Provider 失败时自动切换备用

## 内置工具

| 类别 | 工具 | 说明 |
|------|------|------|
| 文件系统 | `read_file` `write_file` `edit_file` `list_dir` | 文件操作 |
| Shell | `exec` | 执行命令 |
| Web | `web_search` `web_fetch` | 搜索与获取网页 |
| 消息 | `message` | 发送消息 |
| 定时任务 | `cron` | 管理定时任务 |

## 内置技能

| 技能 | 说明 |
|------|------|
| `time` | 获取系统时间 / UTC 时间 / 指定时区时间 |
| `sysinfo` | CPU / 内存 / 硬盘使用情况 |

## 数据目录

```
~/.microbot/
├── settings.yaml          # 用户配置
├── skills/                # 用户技能（优先级高于内置）
├── workspace/             # 工作目录
│   ├── memory/            # 记忆存储
│   │   ├── MEMORY.md      # 长期记忆
│   │   └── 2026-02-17.md  # 今日日记
│   ├── HEARTBEAT.md       # 心跳任务
│   └── skills/            # 项目技能（最高优先级）
└── data/                  # 数据库
    ├── sessions.db        # 会话存储
    ├── cron.db            # 定时任务
    └── memory.db          # 记忆索引
```

**配置优先级**: 命令行 `-c` > `~/.microbot/settings.*` > 项目 `config.yaml`

**技能加载优先级**: 项目 `skills/` > `~/.microbot/skills/` > 内置 `skills/`

## 开发

```bash
bun run dev          # 开发模式
bun run typecheck    # 类型检查
bun test             # 运行测试
```

## 项目结构

```
microbot/
├── src/
│   ├── index.ts            # 入口
│   ├── cli.ts              # CLI 命令
│   ├── container.ts        # DI 容器
│   ├── event-bus.ts        # 事件总线
│   ├── hook-system.ts      # 钩子系统
│   ├── pipeline.ts         # 中间件管道
│   ├── types/              # 类型定义
│   ├── utils/              # 工具函数
│   ├── config/             # 配置管理
│   ├── db/                 # 数据库管理
│   ├── bus/                # 消息总线
│   ├── session/            # 会话存储
│   ├── memory/             # 记忆存储
│   ├── cron/               # 定时任务
│   ├── heartbeat/          # 心跳服务
│   ├── tools/              # 工具系统
│   ├── providers/          # LLM Provider
│   ├── agent/              # Agent 核心
│   ├── channels/           # 通道实现
│   └── skills/             # 技能系统
├── tests/
│   ├── unit/               # 单元测试
│   ├── integration/        # 集成测试
│   └── e2e/                # 端到端测试
├── docs/plan/              # 实施计划
├── specs/                  # 规格文档
└── package.json
```
