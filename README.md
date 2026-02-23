# MicroBot

[![Version](https://img.shields.io/badge/Version-0.2.0-blue.svg)](https://github.com/jesspig/microbot)
[![Bun](https://img.shields.io/badge/Bun-1.3.9-black?logo=bun)](https://bun.sh/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9.3-blue?logo=typescript)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

基于 **Bun + TypeScript** 的超轻量级个人 AI 助手框架。

**[📖 在线文档](https://jesspig.github.io/microbot/)** | **[📦 更新日志](https://jesspig.github.io/microbot/guide/changelog/)**

## 特性

| 特性 | 说明 |
|------|------|
| 轻量高效 | Bun 原生性能，核心代码简洁 |
| 8层 Monorepo | Types → Runtime/Config/Storage → SDK/Providers/Extension-System → Server → CLI |
| 智能路由 | 根据任务复杂度自动选择模型 |
| 🧠 长期记忆 | LanceDB 向量存储、语义检索、自动摘要、跨会话上下文保持 |
| Channel Gateway | 消息处理枢纽，多通道聚合、响应广播、自动重连 |
| 多通道支持 | 飞书（更多通道开发中） |
| 本地优先 LLM | Ollama / LM Studio / OpenAI Compatible |
| MCP 兼容 | Model Context Protocol 工具接口 |

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
  ext         扩展管理

Options:
  -c, --config <path>   配置文件路径
  -v, --verbose         详细日志模式
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
| @microbot/types | `packages/types/` | 核心类型定义（MCP 兼容） |
| @microbot/runtime | `packages/runtime/` | 运行时引擎（Container、EventBus、HookSystem、Gateway） |
| @microbot/config | `packages/config/` | 三级配置系统（user < project < directory） |
| @microbot/storage | `packages/storage/` | 会话存储（JSONL） |
| @microbot/providers | `packages/providers/` | LLM Provider 抽象、Gateway、路由 |
| @microbot/extension-system | `packages/extension-system/` | 扩展发现、加载、热重载 |
| @microbot/sdk | `packages/sdk/` | 聚合 SDK，统一开发接口 |
| @microbot/server | `packages/server/` | 服务层（Channel、Queue、Events） |

## 扩展模块

| 模块 | 路径 | 说明 |
|------|------|------|
| 工具 | `extensions/tool/` | 文件、Shell、Web、消息工具 |
| 技能 | `extensions/skills/` | time、sysinfo |
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

| 技能 | 说明 | 依赖 |
|------|------|------|
| `time` | 时间查询、格式转换、时区处理 | - |
| `sysinfo` | CPU、内存、磁盘、网络、进程状态 | bun>=1.0 |

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
├── sessions/              # 会话存储（JSONL）
└── memory/                # 记忆系统数据
    ├── lancedb/           # LanceDB 向量存储
    ├── sessions/          # 会话记忆（Markdown）
    └── summaries/         # 摘要归档
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

## License

MIT
