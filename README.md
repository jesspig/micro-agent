# 🐈 MicroAgent — 超轻量级个人 AI 助手

<div align="center">
  <img src="./assets/micro-agent-logo-text.png" alt="MicroAgent" width="600" />
</div>

<p align="center">
  <a href="https://github.com/jesspig/micro-agent"><img src="https://img.shields.io/badge/Version-0.2.2-blue.svg" alt="Version"></a>
  <a href="https://bun.sh/"><img src="https://img.shields.io/badge/Bun-1.3.9-black?logo=bun" alt="Bun"></a>
  <a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/TypeScript-5.9.3-blue?logo=typescript" alt="TypeScript"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-green.svg" alt="License"></a>
  <a href="https://github.com/jesspig/micro-agent/stargazers"><img src="https://img.shields.io/github/stars/jesspig/micro-agent?style=flat" alt="GitHub Stars"></a>
  <a href="https://www.npmjs.com/package/@micro-agent/core"><img src="https://img.shields.io/npm/dt/@micro-agent/core" alt="npm Downloads"></a>
</p>

<p align="center">基于 <strong>Bun + TypeScript</strong> 的超轻量级个人 AI 助手框架，核心代码简洁高效。</p>

<p align="center"><a href="https://jesspig.github.io/micro-agent/">📖 在线文档</a> · <a href="https://jesspig.github.io/micro-agent/guide/changelog/">📦 更新日志</a> · <a href="https://github.com/jesspig/micro-agent/discussions">💬 讨论区</a></p>

## 特性

🪶 **轻量高效**：Bun 原生性能，核心代码简洁，8 层 Monorepo 架构

🧠 **长期记忆**：LanceDB 向量存储、语义检索、自动摘要、跨会话上下文保持

🎯 **意图识别**：分阶段意图识别管道，支持上下文重试

📚 **知识库**：PDF/Word/Excel 文档解析，向量存储，RAG 检索

🔗 **引用溯源**：RAG 级别引用溯源，支持多格式引用展示

💬 **多通道**：CLI、飞书（更多通道开发中），消息聚合与响应广播

🔌 **MCP 兼容**：Model Context Protocol 工具接口，热重载支持

📊 **结构化日志**：调用链追踪，LLM/工具/记忆检索日志可观测

## 📢 最新更新

- **2026-03-02** 🚀 发布 **v0.2.2** — 意图识别管道、知识库系统、引用溯源
  - 🎯 意图识别管道，分阶段识别 + 上下文重试
  - 📚 知识库系统，PDF/Word/Excel 文档解析
  - 🔗 RAG 级别引用溯源

- **2026-02-27** 📦 发布 **v0.2.1** — 项目重命名与代码清理
  - 🏷️ microbot → micro-agent 命名空间变更
  - 🔧 类型系统统一，新增 LLMMessage/ContentPart 类型
  - 🗑️ 移除 A2A 客户端和 ReAct 提示词

- **2026-02-24** 🏗️ 发布 **v0.2.0** — 架构重构 + 多协议支持
  - 📦 8 层 Monorepo 拆分
  - 🧠 全新记忆系统，LanceDB 向量存储
  - 🔌 MCP/ACP 协议支持

<details>
<summary>更多更新</summary>

- **2026-02-20** v0.1.1 — 优化版本，精简代码
- **2026-02-19** v0.1.0 — 首个内测版本

</details>

## 运行环境要求

> **注意**：本项目专为 [Bun](https://bun.sh/) 运行时设计，**不支持 Node.js**。

| 要求 | 版本 |
|------|------|
| Bun | >= 1.0.0 |
| TypeScript | >= 5.0 |

**不兼容 Node.js 的原因**：
- 使用 `Bun.serve()`、`Bun.spawn()` 等 Bun 特有 API
- 使用 `bun:test` 测试框架
- TypeScript 配置针对 Bun 优化（`moduleResolution: bundler`）

## 安装

> [!TIP]
> 确保已安装 [Bun](https://bun.sh/) 运行时（>= 1.0.0）

```bash
# 克隆项目
git clone https://github.com/jesspig/micro-agent.git
cd micro-agent

# 安装依赖
bun install

# 启动服务
bun start
```

## 快速开始

> [!TIP]
> 推荐使用本地 [Ollama](https://ollama.com/) 运行 qwen3 模型

```bash
# 1. 拉取模型
ollama pull qwen3

# 2. 启动 MicroAgent
bun start

# 3. 开始对话
# 发送消息到已配置的通道（CLI/飞书）
```

### 启动

```bash
bun start
```

首次启动自动创建 `~/.micro-agent/settings.yaml` 配置文件。

## CLI 命令

```bash
micro-agent <command> [options]

Commands:
  start       启动服务
  status      显示状态
  ext         扩展管理

Options:
  -c, --config <path>   配置文件路径
  -v, --verbose         详细日志模式
  -q, --quiet           静默模式（仅显示警告和错误）
  -h, --help            显示帮助
  --version             显示版本
```

## 架构

```
┌─────────────────────────────────────────────────────────────┐
│                         CLI (apps/cli)                       │
├─────────────────────────────────────────────────────────────┤
│                        Server (packages/server)              │
├─────────────────────────────────────────────────────────────┤
│    SDK    │  Providers  │  Extension-System                 │
├───────────┴─────────────┴──────────────────┴────────────────┤
│    Runtime    │    Config    │    Storage    │   Memory     │
│    Gateway    │              │               │              │
├───────────────┴──────────────┴───────────────┴──────────────┤
│                         Types                                │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Extensions (extensions/)                  │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │   Tools     │  │  Channels   │  │       Skills        │  │
│  │ filesystem  │  │   feishu    │  │   time, sysinfo     │  │
│  │ shell, web  │  │             │  │                     │  │
│  │ message     │  │             │  │                     │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## 核心包

| 包 | 路径 | 说明 |
|------|------|------|
| @micro-agent/types | `packages/types/` | 核心类型定义（MCP 兼容） |
| @micro-agent/runtime | `packages/runtime/` | 运行时引擎（Container、EventBus、HookSystem、Gateway） |
| @micro-agent/config | `packages/config/` | 三级配置系统（user < project < directory） |
| @micro-agent/storage | `packages/storage/` | 会话存储（SQLite） |
| @micro-agent/providers | `packages/providers/` | LLM Provider 抽象、Gateway、路由 |
| @micro-agent/extension-system | `packages/extension-system/` | 扩展发现、加载、热重载 |
| @micro-agent/sdk | `packages/sdk/` | 聚合 SDK，统一开发接口 |
| @micro-agent/server | `packages/server/` | 服务层（Channel、Queue、Events） |

## 扩展模块

| 模块 | 路径 | 说明 |
|------|------|------|
| 工具 | `extensions/tool/` | 文件、Shell、Web、消息工具 |
| 技能 | `extensions/skills/` | time、sysinfo、skill-creator |
| 通道 | `extensions/channel/` | 飞书 |

## 内置工具

| 工具 | 说明 |
|------|------|
| `read_file` | 读取文件 |
| `write_file` | 写入文件 |
| `list_dir` | 列出目录 |
| `exec` | 执行 Shell 命令 |
| `web_fetch` | 获取网页内容 |
| `message` | 发送消息 |

## 内置技能

| 技能 | 说明 | 依赖 |
|------|------|------|
| `time` | 时间查询、格式转换、时区处理 | - |
| `sysinfo` | CPU、内存、磁盘、网络、进程状态 | bun>=1.0 |
| `skill-creator` | 创建或更新 Agent Skills | - |

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

### Ollama（本地运行）

```yaml
providers:
  ollama:
    baseUrl: http://localhost:11434/v1
    models: [qwen3, qwen3-vl]

agents:
  models:
    chat: ollama/qwen3
    vision: ollama/qwen3-vl
```

### DeepSeek（深度推理）

```yaml
providers:
  deepseek:
    baseUrl: https://api.deepseek.com/v1
    apiKey: ${DEEPSEEK_API_KEY}
    models: [deepseek-chat, deepseek-reasoner]

agents:
  models:
    chat: deepseek/deepseek-chat
    coder: deepseek/deepseek-chat
```

### GLM 智谱 / MiniMax / Kimi

```yaml
providers:
  glm:
    baseUrl: https://open.bigmodel.cn/api/paas/v4
    apiKey: ${GLM_API_KEY}
    models: [glm-4-flash]
  
  minimax:
    baseUrl: https://api.minimax.chat/v1
    apiKey: ${MINIMAX_API_KEY}
    models: [abab6.5s-chat]
  
  kimi:
    baseUrl: https://api.moonshot.cn/v1
    apiKey: ${MOONSHOT_API_KEY}
    models: [moonshot-v1-128k]
```

**Gateway 特性**:

- 自动路由：根据 `provider/model` 格式路由
- 智能路由：根据任务复杂度选择合适模型
- 故障转移：主 Provider 失败时自动切换备用

## 数据目录

```
~/.micro-agent/
├── settings.yaml          # 用户配置
├── data/                  # 数据存储
│   ├── sessions.db        # 会话存储（SQLite）
│   └── knowledge.db       # 知识库索引（SQLite）
├── memory/                # 记忆系统数据
│   ├── lancedb/           # LanceDB 向量存储
│   ├── sessions/          # 会话记忆（Markdown）
│   └── summaries/         # 摘要归档
├── knowledge/             # 知识库文档
├── logs/                  # 日志文件
├── skills/                # 用户技能
└── workspace/             # 工作空间
```

## 开发

```bash
bun run dev          # 开发模式
bun run typecheck    # 类型检查
bun test             # 运行测试
```

## 项目结构

```
micro-agent/
├── packages/
│   ├── types/              # 核心类型定义
│   ├── runtime/            # 运行时引擎
│   ├── config/             # 配置系统
│   ├── storage/            # 存储层
│   ├── providers/          # LLM 提供商
│   ├── extension-system/   # 扩展系统
│   ├── sdk/                # 聚合 SDK
│   └── server/             # 服务层
├── apps/
│   └── cli/                # CLI 应用
├── extensions/
│   ├── tool/               # 工具扩展
│   ├── channel/            # 通道扩展
│   └── skills/             # 技能扩展
├── tests/                  # 测试
├── docs/                   # 文档
├── templates/              # 模板文件
└── workspace/              # 工作空间配置
```

## Stars History

[![Star History Chart](https://api.star-history.com/svg?repos=jesspig/micro-agent&type=date&legend=top-left)](https://www.star-history.com/#jesspig/micro-agent&type=date&legend=top-left)

## License

MIT
