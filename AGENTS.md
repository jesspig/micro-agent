# MicroAgent 开发指南

**MicroAgent** 是基于 Bun + TypeScript 的超轻量级个人 AI 助手框架。

**项目目标**：复刻 [nanobot](https://github.com/HKUDS/nanobot) 核心能力并增强，保持项目精简完备。

> **语言要求**：所有对话、注释、问答、思考过程等都必须严格使用中文。

---

## 目录

1. [常用命令](#常用命令)
2. [设计原则](#设计原则)
3. [开发规范](#开发规范)
4. [关键约束](#关键约束)
5. [架构概览](#架构概览)
6. [配置管理](#配置管理)
7. [模板与提示词](#模板与提示词)
8. [运行时数据管理](#运行时数据管理)

---

## 常用命令

### 开发命令

| 命令 | 用途 | 说明 |
|------|------|------|
| `bun run dev` | 开发模式 | 启动热重载开发服务器 |
| `bun run build` | 构建项目 | 编译 TypeScript 到 dist/ |
| `bun run start` | 启动 Agent | 运行 micro-agent start |
| `bun run typecheck` | 类型检查 | 验证 TypeScript 类型安全 |
| `bun test` | 运行测试 | 执行单元测试和集成测试 |

### CLI 命令

| 命令 | 用途 | 说明 |
|------|------|------|
| `micro-agent start` | 启动 Agent | 运行 Agent 服务 |
| `micro-agent status` | 查看状态 | 显示配置和运行信息 |
| `micro-agent config` | 生成配置 | 初始化配置文件 |

**CLI 选项**：`--config <path>`、`--model <model>`、`--debug`、`--log-level <level>`、`--verbose`、`--json`、`--force`、`--dry-run`

---

## 设计原则

### 核心原则

| 优先级 | 原则 | 说明 | 应用场景 |
|--------|------|------|----------|
| P0 | 单一职责、代码即文档、显式优于隐式 | 所有代码必须遵循 | 日常编码 |
| P1 | 失败快速、组合优于继承、开放封闭、依赖倒置 | 架构设计重点 | 系统设计 |
| P2 | 接口隔离、最小惊讶 | API 设计重点 | 接口设计 |
| P3 | 轻量化、零技术债务 | 代码质量保障 | 代码审查 |

### 轻量化标准

| 指标 | 限制 | 说明 |
|------|------|------|
| 文件大小 | ≤300 行 | 单个源文件最大行数 |
| 方法长度 | ≤25 行 | 单个函数/方法最大行数 |
| 代码嵌套 | ≤3 层 | 最大嵌套深度 |

---

## 开发规范

### 命名规范

| 类型 | 规范 | 示例 |
|------|------|------|
| 接口/类名 | 帕斯卡命名法 | `UserService`, `IProvider` |
| 方法/变量 | 驼峰命名法 | `getUserById`, `userData` |
| 常量 | 大写蛇形命名法 | `MAX_COUNT`, `API_VERSION` |
| 文件名 | 短横线命名法 | `agent-builder.ts` |

### 提交规范

采用 [Conventional Commits](https://www.conventionalcommits.org/) 标准：`<type>(<scope>): <subject>`

**type 类型**：`feat` | `fix` | `refactor` | `docs` | `chore`

---

## 关键约束

### 技术约束

| 约束 | 要求 | 原因 |
|------|------|------|
| 禁止 Node.js API | 完全使用 Bun API | 避免兼容性问题，优化性能 |
| 纯 TypeScript | 禁止使用 JavaScript | 类型安全，开发体验 |
| Runtime 零外部依赖 | Runtime 层禁止引入第三方库 | 保持轻量化，减少攻击面 |
| Applications 层例外 | 允许引入必要依赖 | Zod、YAML、平台 SDK 等 |

### subagent 并发控制

| 场景 | 限制 | 策略 |
|------|------|------|
| subagent 并发 | 单批次最多 5 个并行 | 避免触发平台速率限制 |
| 复杂任务 | 必须拆分 | 拆分为独立子任务，多批次并行执行 |

---

## 架构概览

### 项目结构

```
microagent/
├── runtime/                  # 核心运行时层（零外部依赖）
│   ├── kernel/               # 核心调度（AgentLoop）
│   ├── provider/             # Provider 抽象
│   ├── tool/                 # Tool 抽象
│   ├── skill/                # Skill 抽象
│   ├── channel/              # Channel 抽象
│   ├── memory/               # Memory 抽象
│   ├── session/              # Session 管理
│   └── bus/                  # 消息总线
│
└── applications/             # 应用层（可引入第三方依赖）
    ├── cli/                  # CLI 入口
    ├── providers/            # Provider 实现（OpenAI/Anthropic/Ollama）
    ├── tools/                # Tool 实现（Filesystem/Shell/Web）
    ├── channels/             # Channel 实现（QQ/飞书/企微/钉钉）
    ├── config/               # 配置管理
    ├── prompts/              # 提示词模板
    ├── templates/            # 用户模板
    └── builder/              # Agent 构建器
```

### 运行时数据目录

```
~/.micro-agent/               # 运行时数据目录
├── workspace/                # 工作目录（Agent 唯一可访问目录）
│   ├── .agent/               # Agent 配置目录
│   │   ├── mcp.json          # MCP 服务器配置
│   │   ├── AGENTS.md         # Agent 角色定义
│   │   ├── SOUL.md           # 个性/价值观
│   │   ├── USER.md           # 用户偏好
│   │   ├── TOOLS.md          # 工具使用指南
│   │   ├── HEARTBEAT.md      # 心跳任务
│   │   ├── MEMORY.md         # 长期记忆
│   │   ├── history/          # 每日记录（按日期分文件）
│   │   └── skills/           # 用户自定义技能
│   └── ...                   # 用户工作文件
│
├── sessions/                 # 会话存储（JSONL 格式）
├-─ logs/                     # 日志目录（滚动日志）
└── settings.yaml     # 用户配置
```

### 分层架构

```
Applications 层 ──依赖──► Runtime 层

Applications: 用户交互、具体实现、配置组装、可引入第三方依赖
Runtime: 接口定义、核心调度、注册表、消息总线、零外部依赖
```

### 核心概念

| 概念 | 说明 |
|------|------|
| AgentLoop | ReAct 循环（Thought-Action-Observation） |
| Registry | Provider/Tool/Skill 的统一注册和管理 |
| Session | 会话管理（对话历史、状态持久化） |
| Memory | 记忆抽象（短期/长期记忆接口定义） |
| Bus | 消息总线（异步消息队列，解耦渠道与核心） |

---

## 配置管理

### 支持的 Provider 类型

| 类型 | 说明 | baseUrl 示例 |
|------|------|-------------|
| `openai` | OpenAI 兼容 API | `https://api.openai.com/v1` |
| `openai-response` | OpenAI Response API | `https://api.openai.com/v1` |
| `anthropic` | Anthropic Claude | `https://api.anthropic.com/v1` |
| `ollama` | Ollama 本地模型 | `http://localhost:11434` |

### OpenAI 兼容平台

| 平台 | baseUrl |
|------|---------|
| DeepSeek | `https://api.deepseek.com/v1` |
| 智谱 AI | `https://open.bigmodel.cn/api/paas/v4` |
| 阿里百炼 | `https://dashscope.aliyuncs.com/compatible-mode/v1` |
| Moonshot | `https://api.moonshot.cn/v1` |
| OpenRouter | `https://openrouter.ai/api/v1` |

### 环境变量替换

配置文件支持 `${VAR_NAME}` 语法引用环境变量。

---

## 模板与提示词

### 模板文件说明

| 文件 | 用途 |
|------|------|
| `AGENTS.md` | Agent 角色定义、行为准则 |
| `SOUL.md` | 个性、价值观、说话风格 |
| `USER.md` | 用户偏好、常用信息 |
| `TOOLS.md` | 工具使用指南和技巧 |
| `HEARTBEAT.md` | 定时任务和检查项 |
| `MEMORY.md` | 长期记忆存储 |
| `settings.yaml` | 用户配置文件 |
| `mcp.json` | MCP 服务器配置 |

首次启动时，AgentBuilder 自动初始化 `~/.micro-agent/` 目录并复制模板文件。

---

## 运行时数据管理

### 会话存储

**路径**：`~/.micro-agent/sessions/YYYY-MM-DD.jsonl`（每行一个 JSON 对象）

### 日志管理

**路径**：`~/.micro-agent/logs/YYYY-MM-DD[-HH][-MM][-<iterator>].jsonl`（JSONL 格式，每行一个 JSON 对象）

| 规则 | 值 |
|------|-----|
| 单文件大小上限 | 10 MB |
| 保留天数 | 7 天 |

### 每日记录

**路径**：`~/.micro-agent/workspace/.agent/history/YYYY-MM-DD.md`（Markdown 格式）

### 用户自定义技能

**路径**：`~/.micro-agent/workspace/.agent/skills/<skill-name>/SKILL.md`

**优先级**：用户自定义技能 > 内置技能（同名覆盖）

---

## 依赖说明

| 依赖 | 层级 | 用途 |
|------|------|------|
| `zod` | Applications | 配置验证 |
| `yaml` | Applications | YAML 解析 |
| `@larksuiteoapi/node-sdk` | Applications | 飞书机器人 |
| `@wecom/aibot-node-sdk` | Applications | 企业微信机器人 |
| `dingtalk-stream-sdk-nodejs` | Applications | 钉钉机器人 |
| `qq-guild-bot` | Applications | QQ 频道机器人 |
| `typescript` | Dev | 类型检查 |
| `@types/bun` | Dev | Bun 类型定义 |

**零外部依赖原则**：Runtime 层零外部依赖，Applications 层允许必要的运行时依赖和开发依赖。
