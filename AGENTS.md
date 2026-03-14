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

---

## 常用命令

### 开发命令

| 命令 | 用途 | 说明 |
|------|------|------|
| `bun run dev` | 开发模式 | 启动热重载开发服务器 |
| `bun start` | 生产模式 | 启动优化后的生产环境 |
| `bun test` | 运行测试 | 执行单元测试和集成测试 |
| `bun run typecheck` | 类型检查 | 验证 TypeScript 类型安全 |

### CLI 命令

| 命令 | 用途 | 说明 |
|------|------|------|
| `micro-agent start` | 启动 MicroAgent | 运行 Agent 服务 |
| `micro-agent status` | 查看状态 | 显示配置和运行信息 |
| `micro-agent config` | 生成配置 | 创建默认配置文件 |

---

## 设计原则

### 核心原则

| 优先级 | 原则 | 说明 | 应用场景 |
|--------|------|------|----------|
| P0 | 单一职责、代码即文档、显式优于隐式 | 所有代码必须遵循 | 日常编码 |
| P1 | 失败快速、组合优于继承、开放封闭、依赖倒置、测试驱动开发 | 架构设计重点 | 系统设计 |
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

| 类型 | 规范 | 示例 | 说明 |
|------|------|------|------|
| 接口/类名 | 帕斯卡命名法 | `UserService`, `IRepository` | 首字母大写 |
| 方法/变量 | 驼峰命名法 | `getUserById`, `userData` | 首字母小写 |
| 常量 | 大写蛇形命名法 | `MAX_COUNT`, `API_VERSION` | 全大写，下划线分隔 |
| 文件名 | 短横线命名法 | `user-service.ts`, `api-client.ts` | 全小写，短横线分隔 |

### 提交规范

采用 [Conventional Commits](https://www.conventionalcommits.org/) 标准：

```
<type>(<scope>): <subject>

<body>

<footer>
```

**格式说明**：

| 部分 | 必填 | 格式要求 | 示例 |
|------|------|----------|------|
| type | 是 | `feat` \| `fix` \| `refactor` \| `docs` \| `chore` | `feat` |
| scope | 否 | 模块名称，小写 | `auth`, `api` |
| subject | 是 | 动词原形开头，首字母小写，≤50 字符 | `add user login` |
| body | 是 | 详细描述变更原因和方式 | - |
| footer | 否 | 关联 Issue/Breaking Change | `Fixes #123` |

**type 类型说明**：

- `feat`: 新功能
- `fix`: 修复 bug
- `refactor`: 代码重构（非功能变更）
- `docs`: 文档更新
- `chore`: 构建/工具/配置变更

---

## 关键约束

### 技术约束

| 约束 | 要求 | 原因 |
|------|------|------|
| 禁止 Node.js API | 完全使用 Bun API | 避免兼容性问题，优化性能 |
| 纯 TypeScript | 禁止使用 JavaScript | 类型安全，开发体验 |
| 零外部依赖 | Runtime 层禁止引入第三方库 | 保持轻量化，减少攻击面 |
| Applications 层例外 | 允许引入必要开发依赖 | Zod（验证）、YAML 解析器等 |

### 并发控制

| 场景 | 限制 | 策略 |
|------|------|------|
| subagent 并发 | 单批次最多 2 个并行 | 避免资源耗尽 |
| 复杂任务 | 必须拆分 | 拆分为独立子任务，多批次并行执行 |
| 批次优化 | 优先最大化批次数量 | 提高并发效率 |

---

## 架构概览

### 项目结构

**组织方式**：单一项目内分层目录结构，通过目录边界隔离职责。

```
microagent/
├── runtime/            # 核心运行时层（零外部依赖）
└── applications/       # 应用层（依赖 runtime）

~/.micro-agent/         (运行时数据目录)
├── workspace/          # 工作目录（Agent 唯一可访问目录）
│   ├── .agent/         # Agent 配置目录（隐藏目录）
│   │   ├── settings.yaml    # 用户配置
│   │   ├── mcp.json         # MCP 服务器配置
│   │   ├── AGENTS.md        # Agent 角色定义
│   │   ├── SOUL.md          # 个性/价值观
│   │   ├── USER.md          # 用户偏好
│   │   ├── TOOLS.md         # 工具使用指南
│   │   ├── HEARTBEAT.md     # 心跳任务
│   │   ├── MEMORY.md        # 长期记忆
│   │   ├── history/         # 历史日志（按日期分文件）
│   │   │   ├── 2026-03-11.md
│   │   │   ├── 2026-03-12.md
│   │   │   └── ...
│   │   └── skills/          # 用户自定义技能
│   │       ├── my-skill/
│   │       │   └── SKILL.md
│   │       └── ...
│   └── ...             # 用户工作文件（Agent 可读写）
│
├── sessions/           # 会话存储（按日期分文件）
│   ├── 2026-03-11.jsonl
│   ├── 2026-03-12.jsonl
│   └── ...
│
└── logs/               # 日志目录（滚动日志）
    ├── 2026-03-11.log
    ├── 2026-03-11-1.log    # 同一天第二个文件（超过10MB）
    ├── 2026-03-12.log
    └── ...                 # 最多保留7天
```

### 分层架构

```
┌─────────────────────────────────────────────────────────────────┐
│                       Applications                              │  应用层
│                                                                 │
│  ├── CLI/WebUI/Service 等多种入口                               │
│  ├── 具体实现（Provider/Tool/Channel/Skill）                    │
│  ├── 配置加载与组装                                              │
│  └── 可选增强模块（RAG Pipeline、高级 Memory）                   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ 依赖
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                         Runtime (Core)                          │  核心运行时层
│                                                                 │
│  ├── Interface Layer（接口定义）                                 │
│  │   └── IProvider, ITool, IChannel, ISkill, IMemory...        │
│  │                                                              │
│  └── Kernel Layer（核心调度）                                    │
│      ├── AgentLoop    ReAct 循环                                │
│      ├── Registry     注册表（Provider/Tool/Skill）              │
│      ├── Session      会话管理                                   │
│      ├── Memory       记忆抽象                                   │
│      └── Bus          消息总线                                   │
└─────────────────────────────────────────────────────────────────┘
```

**依赖方向**：Applications → Runtime（单向依赖，不可逆）

### 分层职责

| 层级 | 定位 | 职责 | 依赖限制 |
|------|------|------|----------|
| Applications | 应用层 | 日志前台输出、具体实现、配置组装、可选增强 | 可引入第三方库，依赖 Runtime |
| Runtime | 核心运行时 | 接口定义、核心调度、注册表、消息总线 | 零外部依赖 |

### 核心概念

| 概念 | 说明 | 职责 |
|------|------|------|
| Interface Layer | 接口定义层 | 定义 IProvider/ITool/IChannel 等契约接口 |
| Kernel Layer | 核心调度层 | 提供 Agent 基础运行环境 |
| AgentLoop | ReAct 循环 | Thought-Action-Observation 循环执行 |
| Registry | 注册表 | Provider/Tool/Skill 的统一注册和管理 |
| Session | 会话管理 | 对话历史、状态持久化 |
| Memory | 记忆抽象 | 短期/长期记忆接口定义 |
| Bus | 消息总线 | 异步消息队列，解耦消息通道与核心 |

### 依赖规则

| 规则 | 说明 | 违反后果 |
|------|------|----------|
| 单向依赖 | Applications → Runtime（不可逆） | 循环依赖，编译失败 |
| 接口实现分离 | Runtime 定义接口，Applications 实现接口 | 破坏封装，增加耦合 |
| 零外部依赖 | Runtime 层禁止引入第三方库 | 增加攻击面，违背轻量化 |
| 扩展自由 | Applications 可自由组合 Runtime 能力 | - |

---

## 详细目录结构

```
microagent/
├── package.json                      # 项目配置
├── tsconfig.json                     # TypeScript 配置
│
├── runtime/                          # 核心运行时层（零外部依赖）
│   ├── index.ts                      # 公共导出
│   ├── types.ts                      # 核心类型定义
│   ├── contracts.ts                  # 接口契约
│   ├── errors.ts                     # 错误类型
│   │
│   ├── kernel/                       # 核心调度
│   │   ├── agent-loop.ts             # ReAct 循环
│   │   └── state-machine.ts          # 状态机
│   │
│   ├── provider/                     # Provider 抽象
│   │   ├── contract.ts               # IProvider 接口
│   │   ├── base.ts                   # 抽象基类
│   │   ├── registry.ts               # 注册表
│   │   └── types.ts                  # ChatRequest/ChatResponse
│   │
│   ├── tool/                         # Tool 抽象
│   │   ├── contract.ts               # ITool 接口
│   │   ├── base.ts                   # 抽象基类
│   │   ├── registry.ts               # 注册表
│   │   └── types.ts                  # JSON Schema 类型
│   │
│   ├── skill/                        # Skill 抽象
│   │   ├── contract.ts               # ISkill 接口
│   │   ├── loader.ts                 # 加载器基类
│   │   └── registry.ts               # 注册表
│   │
│   ├── channel/                      # Channel 抽象
│   │   ├── contract.ts               # IChannel 接口
│   │   ├── base.ts                   # 抽象基类
│   │   └── manager.ts                # 消息通道管理器
│   │
│   ├── memory/                       # Memory 抽象
│   │   ├── contract.ts               # IMemory 接口
│   │   ├── base.ts                   # 抽象基类
│   │   └── types.ts                  # 记忆类型
│   │
│   ├── session/                      # Session 管理
│   │   ├── manager.ts                # 会话管理器
│   │   ├── context-builder.ts        # 上下文构建器
│   │   └── types.ts                  # Session 类型
│   │
│   └── bus/                          # 消息总线
│       ├── events.ts                 # 事件类型
│       └── queue.ts                  # 消息队列
│
└── applications/                     # 应用层（依赖 runtime）
    │
    ├── cli/                          # CLI 入口（专属）
    │   ├── index.ts                  # CLI 入口
    │   └── options/                  # CLI 选项实现
    │       ├── start.ts
    │       ├── status.ts
    │       └── config.ts
    │
    ├── providers/                    # Provider 具体实现
    │   ├── openai.ts
    │   ├── anthropic.ts
    │   └── openrouter.ts
    │
    ├── tools/                        # Tool 具体实现
    │   ├── filesystem.ts
    │   ├── shell.ts
    │   └── web.ts
    │
    ├── skills/                       # Skill 具体实现
    │   ├── weather/
    │   ├── memory/
    │   └── github/
    │
    ├── channels/                     # Channel 具体实现
    │   ├── qq.ts
    │   ├── feishu.ts
    │   ├── wechat-work.ts
    │   └── dingtalk.ts
    │
    ├── commands/                     # 消息平台指令处理
    │   ├── base.ts                   # 指令基类
    │   └── registry.ts               # 指令注册表
    │
    ├── config/                       # 配置管理
    │   ├── loader.ts                 # 配置加载器
    │   ├── schema.ts                 # Zod Schema 定义
    │   ├── env-resolver.ts           # 环境变量替换
    │   └── errors.ts                 # 配置错误类型
    │
    ├── configs/                      # 配置文件（运行时加载）
    │   ├── providers.yaml            # Provider 配置
    │   └── channels.yaml             # Channel 配置
    │
    ├── prompts/                      # 提示词模板（避免硬编码）
    │   ├── system-prompt.ts          # 系统提示词构建
    │   ├── memory-prompt.ts          # 记忆整合提示词
    │   ├── heartbeat-prompt.ts       # 心跳决策提示词
    │   └── error-messages.ts         # 错误消息模板
    │
    ├── templates/                    # 用户模板（启动时复制到 workspace/.agent/）
    │   ├── AGENTS.md                 # Agent 角色定义模板
    │   ├── SOUL.md                   # 个性/价值观模板
    │   ├── USER.md                   # 用户偏好模板
    │   ├── TOOLS.md                  # 工具使用指南模板
    │   ├── HEARTBEAT.md              # 心跳任务模板
    │   ├── MEMORY.md                 # 长期记忆模板
    │   ├── settings.example.yaml             # 用户配置文件
    │   └── mcp.json                  # MCP 服务器配置模板
    │
    ├── builder/                      # Agent 构建器
    │   └── agent-builder.ts
    │
    └── shared/                       # 应用层共享模块
        ├── logger.ts                 # 日志工具
        └── constants.ts              # 常量定义
```

## 关键设计决策

| 决策 | 选择 | 原因 |
|------|------|------|
| 框架选型 | 自研轻量级 | 避免第三方依赖，符合零外部依赖原则 |
| 状态管理 | 借鉴 LangGraph 状态图 | 支持 ReAct 循环、条件分支 |
| 工具扩展 | 支持 MCP 协议 | 可复用 MCP 开放工具生态 |
| 架构模式 | 注册表模式 | Provider/Tool/Skill 统一使用注册表 |
| 消息解耦 | 发布-订阅模式 | MessageBus 解耦消息通道与核心 |
| 技能加载 | 渐进式披露 | 元数据始终加载，内容按需加载 |
| 记忆整合 | LLM 驱动 | 使用工具调用提取摘要和更新 |

---

## 模板与提示词管理

### 运行时目录初始化

首次启动时，MicroAgent 会自动初始化 `~/.micro-agent/` 目录：

```

启动流程:
┌─────────────────────────────────────────────────────────────┐
│  1. 创建根目录                                               │
│     ~/.micro-agent/                                          │
│     ~/.micro-agent/sessions/                                 │
│     ~/.micro-agent/logs/                                     │
│                                                             │
│  2. 创建工作目录                                             │
│     ~/.micro-agent/workspace/                                │
│     ~/.micro-agent/workspace/.agent/                         │
│     ~/.micro-agent/workspace/.agent/skills/                  │
│                                                             │
│  3. 复制模板文件（仅首次，已存在则跳过）                       │
│     templates/AGENTS.md    → workspace/.agent/AGENTS.md      │
│     templates/SOUL.md      → workspace/.agent/SOUL.md        │
│     templates/USER.md      → workspace/.agent/USER.md        │
│     templates/TOOLS.md     → workspace/.agent/TOOLS.md       │
│     templates/HEARTBEAT.md → workspace/.agent/HEARTBEAT.md   │
│     templates/MEMORY.md    → workspace/.agent/MEMORY.md      │
│     templates/settings.example.yaml → workspace/.agent/settings.yaml │
│     templates/mcp.json     → workspace/.agent/mcp.json       │
│                                                             │
│  4. 创建运行时目录                                           │
│     workspace/.agent/history/  (历史日志目录)                │
└─────────────────────────────────────────────────────────────┘

```

**工作区隔离**：

- Agent 执行文件操作时仅允许访问 `workspace/` 目录
- 防止 Agent 意外修改或删除系统配置文件
- `.agent/` 目录存放 Agent 专属配置，对用户工作透明

### 模板文件说明

| 文件 | 路径 | 用途 | 修改建议 |
|------|------|------|----------|
| `AGENTS.md` | `.agent/AGENTS.md` | Agent 角色定义、行为准则 | 根据使用场景定制 |
| `SOUL.md` | `.agent/SOUL.md` | 个性、价值观、说话风格 | 个性化定制 |
| `USER.md` | `.agent/USER.md` | 用户偏好、常用信息 | 填写个人偏好 |
| `TOOLS.md` | `.agent/TOOLS.md` | 工具使用指南和技巧 | 按需扩展 |
| `HEARTBEAT.md` | `.agent/HEARTBEAT.md` | 定时任务和检查项 | 配置日常提醒 |
| `MEMORY.md` | `.agent/MEMORY.md` | 长期记忆存储 | 系统自动维护 |
| `history/` | `.agent/history/` | 历史日志（按日期分文件） | 系统自动维护 |
| `settings.yaml` | `.agent/settings.yaml` | 用户配置文件 | 配置 API Key、模型等 |
| `mcp.json` | `.agent/mcp.json` | MCP 服务器配置 | 配置外部工具 |

### 提示词管理

**设计原则**：避免在代码中硬编码提示词，统一在 `prompts/` 目录管理。

```

prompts/
├── system-prompt.ts      # 系统提示词构建逻辑
├── memory-prompt.ts      # 记忆整合提示词
├── heartbeat-prompt.ts   # 心跳决策提示词
└── error-messages.ts     # 错误消息模板

```

---

## 运行时数据管理

### 会话存储

- **存储路径**：`~/.micro-agent/sessions/YYYY-MM-DD.jsonl`
- **格式**：每行一个 JSON 对象，追加式写入
- 按日期分文件，便于清理和归档
- 同一天的多个会话写入同一文件
- 跨天会话在写入时自动切换文件

### 日志管理

- **存储路径**：`~/.micro-agent/logs/YYYY-MM-DD[-<iterator>].log`
- **滚动策略**：单文件上限 10 MB，保留 7 天
- **格式**：结构化 JSON，每行一条日志

### 历史日志

- **存储路径**：`~/.micro-agent/workspace/.agent/history/YYYY-MM-DD.md`
- **格式**：Markdown 格式，便于阅读和搜索
- 永久保留（用户可手动清理）

---

## 配置验证

**设计原则**：

- Zod 作为 CLI 层依赖，不引入 Runtime 层
- 分层 Schema 模块，按功能域拆分
- 严格模式防止未知字段

**依赖说明**：

| 依赖 | 层级 | 用途 | 原因 |
|------|------|------|------|
| `zod` | Applications 层 | 配置验证 | 类型安全 + 运行时校验 |
| `yaml` | Applications 层 | YAML 解析 | 支持注释、更友好的配置格式 |

**零外部依赖原则例外**：

- Runtime 层：零外部依赖
- Applications 层：允许必要的开发依赖（Zod、YAML 解析器等）
