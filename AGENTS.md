# MicroAgent 开发指南

**MicroAgent** 是基于 Bun + TypeScript 的超轻量级个人 AI 助手框架。

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
| CLI 层例外 | 允许引入必要开发依赖 | Zod（验证）、YAML 解析器等 |

### 并发控制

| 场景 | 限制 | 策略 |
|------|------|------|
| subagent 并发 | 单批次最多 5 个并行 | 避免资源耗尽 |
| 复杂任务 | 必须拆分 | 拆分为独立子任务，多批次并行执行 |
| 批次优化 | 优先最大化批次数量 | 提高并发效率 |

---

## 架构概览

### 项目结构

**组织方式**：二层架构为同一仓库下的两个独立子项目，各自独立发布 npm 包。

**禁止使用 monorepo 工具**（如 Nx、Turborepo 等）。

```
项目根目录/
├── runtime/            (子项目) ──► @microagent/runtime
└── cli/                (子项目) ──► @microagent/cli

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
│                    Applications (CLI)                           │  应用层
│                                                                 │
│  ├── 用户交互（命令行、REPL）                                    │
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
| Applications | 应用层 | 用户交互、具体实现、配置组装、可选增强 | 可引入第三方库，依赖 Runtime |
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
| Bus | 消息总线 | 异步消息队列，解耦渠道与核心 |

### 依赖规则

| 规则 | 说明 | 违反后果 |
|------|------|----------|
| 独立子项目 | 二层架构为独立子项目，各自发布 npm 包 | 耦合混乱，难以维护 |
| 单向依赖 | Applications → Runtime | 循环依赖，编译失败 |
| 接口实现分离 | Runtime 定义接口，Applications 实现接口 | 破坏封装，增加耦合 |
| 零外部依赖 | Runtime 层禁止引入第三方库 | 增加攻击面，违背轻量化 |
| 扩展自由 | Applications 可自由组合 Runtime 能力 | - |

---

## 详细目录结构

```
microagent/
├── runtime/                          # @microagent/runtime
│   ├── package.json
│   ├── tsconfig.json
│   │
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
│   │   └── manager.ts                # 渠道管理器
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
└── cli/                              # @microagent/cli
    ├── package.json
    ├── tsconfig.json
    │
    ├── index.ts                      # CLI 入口
    │
    ├── options/                      # CLI 选项实现
    │   ├── start.ts
    │   ├── status.ts
    │   └── config.ts
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
    │   ├── settings.yaml             # 用户配置文件
    │   └── mcp.json                  # MCP 服务器配置模板    │
    └── builder/                      # Agent 构建器
        └── agent-builder.ts
```

---

## 核心模块设计

### ReAct AgentLoop

```typescript
// runtime/kernel/agent-loop.ts
export class AgentLoop {
  private maxIterations = 40;

  async run(initialMessages: Message[]): Promise<AgentResult> {
    const messages = [...initialMessages];

    for (let i = 0; i < this.maxIterations; i++) {
      // 1. 调用 LLM
      const response = await this.provider.chat({
        messages,
        tools: this.tools.getDefinitions(),
      });

      // 2. 无工具调用 → 返回最终结果
      if (!response.hasToolCalls) {
        return { content: response.content, messages };
      }

      // 3. 执行工具调用
      for (const call of response.toolCalls) {
        const result = await this.tools.execute(call.name, call.arguments);
        messages.push({
          role: "tool",
          toolCallId: call.id,
          name: call.name,
          content: result,
        });
      }
    }

    return { content: null, messages, error: "Max iterations reached" };
  }
}
```

### Provider 注册表

```typescript
// runtime/provider/registry.ts
export interface ProviderSpec {
  name: string;
  keywords: string[];
  envKey: string;
  litellmPrefix?: string;
  isGateway?: boolean;
  supportsPromptCaching?: boolean;
}

export const PROVIDERS: ProviderSpec[] = [
  { name: "openai", keywords: ["gpt"], envKey: "OPENAI_API_KEY" },
  { name: "anthropic", keywords: ["claude"], envKey: "ANTHROPIC_API_KEY", supportsPromptCaching: true },
  { name: "openrouter", keywords: ["openrouter"], envKey: "OPENROUTER_API_KEY", isGateway: true },
  // ...
];

export function findByModel(model: string): ProviderSpec | undefined {
  return PROVIDERS.find(p => 
    !p.isGateway && p.keywords.some(k => model.toLowerCase().includes(k))
  );
}
```

### Tool 抽象基类

```typescript
// runtime/tool/base.ts
export abstract class Tool<TParams = Record<string, unknown>> {
  abstract readonly name: string;
  abstract readonly description: string;
  abstract readonly parameters: JSONSchema;

  abstract execute(params: TParams): Promise<string>;

  toSchema(): OpenAIToolSchema {
    return {
      type: "function",
      function: {
        name: this.name,
        description: this.description,
        parameters: this.parameters,
      },
    };
  }
}
```

### 双层记忆系统

```typescript
// runtime/memory/base.ts
export abstract class MemoryStore {
  abstract getMemoryContext(): string;
  abstract appendHistory(entry: string): Promise<void>;
  abstract writeLongTerm(content: string): Promise<void>;

  async consolidate(session: Session, provider: IProvider): Promise<void> {
    // 1. 提取未合并消息
    // 2. LLM 工具调用整合
    // 3. 更新记忆文件
  }
}
```

### Skills 渐进式加载

```typescript
// runtime/skill/loader.ts
export abstract class SkillLoader {
  abstract listSkills(): Promise<Skill[]>;
  abstract loadSkillContent(name: string): Promise<string | null>;
  
  async buildSkillsSummary(): Promise<string> {
    const skills = await this.listSkills();
    const summaries = skills.map(s => `- ${s.name}: ${s.description}`);
    return `<skills>\n${summaries.join("\n")}\n</skills>`;
  }
}
```

---

## 实现路线图

### Phase 1: 核心运行时基础

| 模块 | 文件 | 预估行数 |
|------|------|----------|
| 核心类型 | `types.ts`, `contracts.ts`, `errors.ts` | ~200 |
| Provider 抽象 | `provider/*.ts` | ~250 |
| Tool 抽象 | `tool/*.ts` | ~200 |
| AgentLoop | `kernel/agent-loop.ts` | ~200 |
| Session 管理 | `session/*.ts` | ~150 |
| **小计** | | **~1000** |

### Phase 2: 核心运行时完善

| 模块 | 文件 | 预估行数 |
|------|------|----------|
| Memory 抽象 | `memory/*.ts` | ~150 |
| Skill 抽象 | `skill/*.ts` | ~100 |
| Channel 抽象 | `channel/*.ts` | ~150 |
| 消息总线 | `bus/*.ts` | ~100 |
| **小计** | | **~500** |

### Phase 3: CLI 应用

| 模块 | 文件 | 预估行数 |
|------|------|----------|
| CLI 入口 | `index.ts`, `commands/*.ts` | ~300 |
| Provider 实现 | `providers/*.ts` | ~400 |
| Tool 实现 | `tools/*.ts` | ~400 |
| Channel 实现 | `channels/*.ts` | ~300 |
| 配置管理 | `config/*.ts` | ~150 |
| Agent Builder | `builder/*.ts` | ~150 |
| **小计** | | **~1700** |

### Phase 4: 可选增强

| 模块 | 文件 | 预估行数 |
|------|------|----------|
| Skills 实现 | `skills/*/SKILL.md` | ~200 |
| RAG Pipeline | 可选模块 | ~250 |
| 高级 Memory | 可选模块 | ~150 |
| **小计** | | **~600** |

### 总代码量预估

| 层级 | 行数 |
|------|------|
| Runtime | ~1500 行 |
| CLI | ~2300 行 |
| **总计** | **~3800 行** |

---

## 关键设计决策

| 决策 | 选择 | 原因 |
|------|------|------|
| 框架选型 | 自研轻量级 | 避免第三方依赖，符合零外部依赖原则 |
| 状态管理 | 借鉴 LangGraph 状态图 | 支持 ReAct 循环、条件分支 |
| 工具扩展 | 支持 MCP 协议 | 可复用 Claude Desktop 工具生态 |
| 架构模式 | 注册表模式 | Provider/Tool/Skill 统一使用注册表 |
| 消息解耦 | 发布-订阅模式 | MessageBus 解耦渠道与核心 |
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
│     templates/settings.yaml → workspace/.agent/settings.yaml │
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

**提示词加载示例**：

```typescript
// cli/prompts/system-prompt.ts
export function buildSystemPrompt(options: {
  agentsMd: string;
  soulMd: string;
  userMd: string;
  toolsMd: string;
  memoryContext: string;
  skillsSummary: string;
}): string {
  return `
## Identity
${options.agentsMd}

## Personality
${options.soulMd}

## User Preferences
${options.userMd}

## Tools Guide
${options.toolsMd}

## Memory
${options.memoryContext}

## Skills
${options.skillsSummary}
`.trim();
}
```

**工作区路径常量**：

```typescript
// cli/config/paths.ts
import { homedir } from 'os';
import { join } from 'path';

export const MICRO_AGENT_DIR = join(homedir(), '.micro-agent');
export const WORKSPACE_DIR = join(MICRO_AGENT_DIR, 'workspace');
export const AGENT_DIR = join(WORKSPACE_DIR, '.agent');
export const SESSIONS_DIR = join(MICRO_AGENT_DIR, 'sessions');
export const LOGS_DIR = join(MICRO_AGENT_DIR, 'logs');

// Agent 配置文件路径
export const SETTINGS_FILE = join(AGENT_DIR, 'settings.yaml');
export const MCP_CONFIG_FILE = join(AGENT_DIR, 'mcp.json');
export const AGENTS_MD = join(AGENT_DIR, 'AGENTS.md');
export const SOUL_MD = join(AGENT_DIR, 'SOUL.md');
export const USER_MD = join(AGENT_DIR, 'USER.md');
export const TOOLS_MD = join(AGENT_DIR, 'TOOLS.md');
export const HEARTBEAT_MD = join(AGENT_DIR, 'HEARTBEAT.md');
export const MEMORY_MD = join(AGENT_DIR, 'MEMORY.md');
export const HISTORY_DIR = join(AGENT_DIR, 'history');
export const SKILLS_DIR = join(AGENT_DIR, 'skills');
```

---

## 运行时数据管理

### 会话存储

**存储路径**：`~/.micro-agent/sessions/YYYY-MM-DD.jsonl`

**格式**：每行一个 JSON 对象，追加式写入

```jsonl
{"_type":"metadata","sessionKey":"qq:123456","createdAt":"2026-03-12T10:30:00Z"}
{"role":"user","content":"你好","timestamp":"2026-03-12T10:30:05Z"}
{"role":"assistant","content":"你好！有什么可以帮助你的？","timestamp":"2026-03-12T10:30:08Z"}
{"role":"user","content":"帮我查天气","timestamp":"2026-03-12T10:31:00Z"}
{"role":"assistant","toolCalls":[{"id":"call_1","name":"get_weather","arguments":{"city":"北京"}}],"timestamp":"2026-03-12T10:31:02Z"}
{"role":"tool","toolCallId":"call_1","name":"get_weather","content":"北京今天晴，15°C","timestamp":"2026-03-12T10:31:03Z"}
```

**会话管理**：
- 按日期分文件，便于清理和归档
- 同一天的多个会话写入同一文件
- 跨天会话在写入时自动切换文件

### 日志管理

**存储路径**：`~/.micro-agent/logs/YYYY-MM-DD[-<iterator>].log`

**滚动策略**：

| 规则 | 值 |
|------|-----|
| 单文件大小上限 | 10 MB |
| 文件命名 | `YYYY-MM-DD.log` → `YYYY-MM-DD-1.log` → `YYYY-MM-DD-2.log` ... |
| 保留天数 | 7 天 |
| 清理时机 | 每次启动时自动清理过期日志 |

**日志格式**：结构化 JSON，每行一条日志

```jsonl
{"ts":"2026-03-12T10:30:05.123Z","level":"INFO","module":"AgentLoop","msg":"Processing message","sessionKey":"qq:123456"}
{"ts":"2026-03-12T10:30:08.456Z","level":"DEBUG","module":"Provider","msg":"LLM response received","tokens":150}
{"ts":"2026-03-12T10:31:02.789Z","level":"WARN","module":"Tool","msg":"Tool timeout, retrying","tool":"get_weather","attempt":1}
{"ts":"2026-03-12T10:31:03.012Z","level":"ERROR","module":"Channel","msg":"Failed to send message","error":"connection lost","stack":"..."}
```

**字段说明**：

| 字段 | 类型 | 说明 |
|------|------|------|
| `ts` | string | ISO 8601 时间戳 |
| `level` | string | 日志级别 (DEBUG/INFO/WARN/ERROR) |
| `module` | string | 模块名称 |
| `msg` | string | 日志消息 |
| `*` | any | 上下文相关字段（可选） |

**日志级别**：

| 级别 | 用途 |
|------|------|
| `DEBUG` | 详细调试信息（开发模式） |
| `INFO` | 正常运行事件 |
| `WARN` | 警告但不影响运行 |
| `ERROR` | 错误需要关注 |

### 历史日志管理

**存储路径**：`~/.micro-agent/workspace/.agent/history/YYYY-MM-DD.md`

**格式**：Markdown 格式，便于阅读和搜索

```markdown
# 2026-03-12

## 10:30 - 会话 qq:123456

**用户**: 帮我查一下北京今天的天气

**助手**: 我来帮你查询北京的天气信息。
[调用工具: get_weather(city="北京")]

**工具结果**: 北京今天晴，气温15°C，空气质量良好。

**助手**: 北京今天天气晴朗，气温15°C，空气质量良好。适合外出活动哦！

---

## 14:20 - 会话 feishu:ou_xxx

**用户**: 总结一下今天的工作

**助手**: 根据记录，今天的主要工作包括...
```

**写入策略**：

| 规则 | 说明 |
|------|------|
| 追加式写入 | 每次对话结束后追加到当天文件 |
| 按日期滚动 | 跨天自动创建新文件 |
| 无保留限制 | 历史文件永久保留（用户可手动清理） |
| 可搜索 | Markdown 格式便于 grep 搜索 |

### 用户自定义技能

**存储路径**：`~/.micro-agent/workspace/.agent/skills/<skill-name>/SKILL.md`

**优先级**：用户自定义技能 > 内置技能（同名覆盖）

```
workspace/.agent/skills/
├── my-workflow/
│   └── SKILL.md       # 用户自定义工作流技能
└── company-tools/
    └── SKILL.md       # 公司内部工具技能
```

**访问权限**：Agent 可通过 `read_file` 工具读取技能文件。

---

## 配置验证

### Zod Schema 定义

**设计原则**：
- Zod 作为 CLI 层依赖，不引入 Runtime 层
- 分层 Schema 模块，按功能域拆分
- 严格模式防止未知字段
- 敏感数据标记（脱敏处理）

```typescript
// cli/config/schema.ts
import { z } from "zod";

// ===== Provider Schema =====
export const ProviderSchema = z.object({
  id: z.string(),
  name: z.string(),
  baseUrl: z.string().url(),
  apiKey: z.string().min(1),
  models: z.array(z.string()).min(1),
}).strict();

// ===== Channel Schema =====
export const ChannelSchema = z.object({
  id: z.string(),
  type: z.enum(["qq", "feishu", "wechat-work", "dingtalk"]),
  enabled: z.boolean().default(true),
  config: z.record(z.unknown()),
}).strict();

// ===== Tool Schema =====
export const ToolSchema = z.object({
  name: z.string(),
  enabled: z.boolean().default(true),
  policy: z.object({
    allow: z.array(z.string()).optional(),
    deny: z.array(z.string()).optional(),
  }).optional(),
}).strict();

// ===== Memory Schema =====
export const MemorySchema = z.object({
  enabled: z.boolean().default(true),
  store: z.enum(["sqlite", "file"]).default("sqlite"),
  autoCapture: z.boolean().default(false),
  autoRecall: z.boolean().default(true),
  maxResults: z.number().int().min(1).max(20).default(5),
}).strict();

// ===== 主配置 Schema =====
export const SettingsSchema = z.object({
  version: z.string().default("1.0.0"),

  // Provider 配置
  provider: z.object({
    default: z.string(),
    providers: z.record(ProviderSchema),
  }),

  // Channel 配置
  channels: z.record(ChannelSchema).default({}),

  // Tool 配置
  tools: z.record(ToolSchema).default({}),

  // Memory 配置
  memory: MemorySchema.default({}),

  // 运行时配置
  runtime: z.object({
    maxIterations: z.number().int().min(1).max(100).default(40),
    defaultTimeout: z.number().int().min(1000).default(30000),
  }).default({}),
}).strict();
```

### 配置加载流程

```
┌─────────────────────────────────────────────────────────────────┐
│                      配置加载流程                                │
├─────────────────────────────────────────────────────────────────┤
│  1. 路径解析                                                     │
│     resolveConfigPath() → 支持环境变量覆盖                       │
├─────────────────────────────────────────────────────────────────┤
│  2. 文件读取                                                     │
│     YAML.parse(raw) → 解析 YAML 格式                            │
├─────────────────────────────────────────────────────────────────┤
│  3. 环境变量替换                                                 │
│     resolveEnvVars() → ${VAR} 语法替换                           │
│                      → 缺失变量降级为警告（不阻塞启动）            │
├─────────────────────────────────────────────────────────────────┤
│  4. Schema 验证                                                  │
│     SettingsSchema.parse() → Zod 验证                           │
│                             → 验证失败抛出详细错误信息            │
├─────────────────────────────────────────────────────────────────┤
│  5. 默认值应用                                                   │
│     Schema 内置 .default() → 自动填充缺失的可选字段              │
└─────────────────────────────────────────────────────────────────┘
```

### 环境变量替换

```typescript
// cli/config/env-resolver.ts
const ENV_VAR_PATTERN = /\$\{(\w+)\}/g;

export function resolveEnvVars(
  config: unknown,
  env: Record<string, string | undefined> = process.env,
): { config: unknown; missing: string[] } {
  const missing: string[] = [];

  function resolve(value: unknown): unknown {
    if (typeof value !== "string") return value;

    return value.replace(ENV_VAR_PATTERN, (_, key) => {
      const resolved = env[key];
      if (resolved === undefined) {
        missing.push(key);
        return ""; // 降级为空字符串，不阻塞启动
      }
      return resolved;
    });
  }

  function walk(obj: unknown): unknown {
    if (Array.isArray(obj)) return obj.map(walk);
    if (obj && typeof obj === "object") {
      return Object.fromEntries(
        Object.entries(obj).map(([k, v]) => [k, walk(v)])
      );
    }
    return resolve(obj);
  }

  return { config: walk(config), missing };
}
```

### 配置加载器实现

```typescript
// cli/config/loader.ts
import { parse as parseYaml } from "yaml";
import { SettingsSchema } from "./schema.js";
import { resolveEnvVars } from "./env-resolver.js";

export async function loadSettings(configPath: string): Promise<Settings> {
  // 1. 读取文件
  const raw = await Bun.file(configPath).text();

  // 2. 解析 YAML
  const parsed = parseYaml(raw);

  // 3. 环境变量替换
  const { config, missing } = resolveEnvVars(parsed);
  if (missing.length > 0) {
    console.warn(`[Config] Missing env vars: ${missing.join(", ")}`);
  }

  // 4. Schema 验证 + 默认值应用
  const settings = SettingsSchema.parse(config);

  return settings;
}

// 配置写入时保留 ${VAR} 语法
export async function saveSettings(
  configPath: string,
  settings: Settings,
): Promise<void> {
  // 不解析环境变量，直接写入
  const yaml = stringifyYaml(settings);
  await Bun.write(configPath, yaml);
}
```

### 错误处理

```typescript
// cli/config/errors.ts
import { ZodError } from "zod";

export class ConfigValidationError extends Error {
  constructor(
    public readonly issues: Array<{
      path: string;
      message: string;
    }>,
  ) {
    super(`Config validation failed:\n${issues.map(i => `  - ${i.path}: ${i.message}`).join("\n")}`);
    this.name = "ConfigValidationError";
  }

  static fromZodError(error: ZodError): ConfigValidationError {
    const issues = error.issues.map(issue => ({
      path: issue.path.join(".") || "root",
      message: issue.message,
    }));
    return new ConfigValidationError(issues);
  }
}

// 使用示例
try {
  const settings = await loadSettings(configPath);
} catch (error) {
  if (error instanceof ZodError) {
    throw ConfigValidationError.fromZodError(error);
  }
  throw error;
}
```

### 依赖说明

| 依赖 | 层级 | 用途 | 原因 |
|------|------|------|------|
| `zod` | CLI 层 | 配置验证 | 类型安全 + 运行时校验 |
| `yaml` | CLI 层 | YAML 解析 | 支持注释、更友好的配置格式 |

**零外部依赖原则例外**：
- Runtime 层：零外部依赖
- CLI 层：允许必要的开发依赖（Zod、YAML 解析器等）
