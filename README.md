# microbot

[![Bun](https://img.shields.io/badge/Bun-1.3.9-black?logo=bun)](https://bun.sh/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9.3-blue?logo=typescript)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

使用 **Bun + TypeScript** 构建的超轻量级个人 AI 助手框架，复刻自 [nanobot](https://github.com/HKUDS/nanobot)。

## ✨ 特性

- 🚀 **轻量高效** - 保持核心代码简洁，Bun 原生性能
- 🔌 **多通道支持** - 飞书、QQ 频道、邮箱、钉钉、企业微信
- 🤖 **本地优先 LLM** - Ollama/LM Studio/vLLM + OpenAI Compatible 接入云服务
- ⏰ **定时任务** - 支持 at/every/cron 三种调度方式
- 🧠 **记忆系统** - 日记 + 长期记忆，上下文自动注入
- 🛠️ **工具生态** - 文件操作、Shell 命令、Web 搜索
- 📦 **技能系统** - Markdown 定义，渐进式加载
- 🔒 **安全可靠** - 消息去重、自动重连、权限控制

## 📦 安装

```bash
# 克隆项目
git clone https://github.com/jesspig/microbot.git
cd microbot

# 安装依赖
pnpm install
```

## ⚡ 快速开始

### 1. 配置

```bash
# 复制配置模板
cp config.example.yaml config.yaml

# 编辑配置
# 填入你的 API Key 和通道配置
```

### 2. 设置环境变量

```bash
# .env
DEEPSEEK_API_KEY=your-api-key  # 如需云服务
```

### 3. 运行

```bash
# 开发模式
bun run dev

# 生产模式
bun run start
```

## 📱 支持的通道

| 通道 | 协议 | 特性 |
|------|------|------|
| 飞书 | WebSocket | 私聊/群聊、Markdown 卡片、消息反应 |
| QQ 频道 | WebSocket | C2C 私聊、消息去重 |
| 邮箱 | IMAP/SMTP | 轮询接收、HTML 解析、回复线程 |
| 钉钉 | WebSocket Stream | 私聊/群聊、Markdown 消息 |
| 企业微信 | Webhook/API | 私聊/群聊、消息加密 |

## 🤖 支持的 LLM Provider

**设计理念**：本地优先，通过 OpenAI Compatible 接入云服务。

| 类型 | Provider | 说明 |
|------|----------|------|
| **内置本地** | Ollama | 默认支持，baseUrl: http://localhost:11434/v1 |
| **内置本地** | LM Studio | baseUrl: http://localhost:1234/v1 |
| **内置本地** | vLLM | 自定义 baseUrl |
| **通用接口** | OpenAI Compatible | 接入 OpenAI、DeepSeek、Gemini 等云服务 |

### LLM Gateway

Gateway 提供统一的 LLM 接口，聚合多个 Provider：

- **自动路由**：根据模型名自动选择 Provider
- **故障转移**：主 Provider 失败时自动切换备用
- **负载均衡**：多 Provider 间均匀分配请求

```typescript
// 创建 Gateway（本地优先）
const gateway = new LLMGateway();

// 注册 Provider
gateway.registerProvider(new OllamaProvider(config.ollama));
gateway.registerProvider(new OpenAICompatibleProvider(config.cloud));

// 自动路由生成
const result = await gateway.generate({
  model: 'llama3.1',  // 自动路由到 ollama
  messages: context.messages,
});
```

## 🏗️ 架构

```
Chat Channels (Feishu/QQ/Email/DingTalk/WeCom)
        │
        ▼
ChannelManager ──► MessageBus
                        │
                        ▼
                   AgentLoop
                        │
        ┌───────────────┼───────────────┐
        ▼               ▼               ▼
  ContextBuilder  ToolRegistry   MemoryManager
        │               │               │
        └───────────────┴───────────────┘
                        │
                        ▼
                 LLM Provider
```

## 🛠️ 内置工具

| 类别 | 工具 | 描述 |
|------|------|------|
| 文件系统 | `read_file` | 读取文件内容 |
| | `write_file` | 写入文件 |
| | `edit_file` | 编辑文件 |
| | `list_dir` | 列出目录 |
| Shell | `exec` | 执行命令 |
| Web | `web_search` | Web 搜索 |
| | `web_fetch` | 获取网页 |
| 消息 | `message` | 发送消息 |
| 定时任务 | `cron` | 管理定时任务 |

## 📚 内置技能

| 技能 | 描述 |
|------|------|
| `time` | 获取时间（系统时间/UTC时间/指定时区时间） |
| `sysinfo` | 资源监视器（CPU/内存/硬盘使用情况） |

## 📁 项目结构

```
microbot/
├── src/
│   ├── index.ts          # 入口
│   ├── cli.ts            # CLI 命令
│   ├── types/            # 类型定义
│   ├── utils/            # 工具函数
│   ├── config/           # 配置管理
│   ├── db/               # 数据库管理
│   ├── bus/              # 消息总线
│   ├── session/          # 会话存储
│   ├── memory/           # 记忆存储
│   ├── cron/             # 定时任务
│   ├── heartbeat/        # 心跳服务
│   ├── tools/            # 工具系统
│   ├── providers/        # LLM Provider
│   ├── agent/            # Agent 核心
│   ├── channels/         # 通道实现
│   └── skills/           # 技能系统
├── tests/
├── docs/plan/            # 实施计划
├── specs/                # 规格文档
├── package.json
└── tsconfig.json
```

## 📖 文档

- [快速开始](./specs/main/quickstart.md) - 安装和配置指南
- [项目规格](./specs/main/spec.md) - 完整功能规格
- [实施计划](./specs/main/plan.md) - 开发计划
- [API 契约](./specs/main/contracts/) - 接口定义

## 🔧 开发

```bash
# 开发模式（热重载）
bun run dev

# 类型检查
bun run typecheck

# 运行测试
bun test

# 构建
bun build
```

## 📄 配置示例

```yaml
# config.yaml
agents:
  defaults:
    workspace: ~/.microbot/workspace
    model: qwen3
    maxTokens: 8192

channels:
  feishu:
    enabled: true
    appId: your-app-id
    appSecret: your-app-secret

  qq:
    enabled: false
    appId: your-qq-bot-id
    secret: your-secret

  email:
    enabled: false
    imapHost: imap.example.com
    smtpHost: smtp.example.com
```
