# MicroAgent 开发指南

## 项目概述

**MicroAgent** 是基于 Bun + TypeScript 的超轻量级个人 AI 助手框架，定位为 LLM/Agent 双向网关 + 可扩展 Agent 运行时。

- **版本**: 0.2.1
- **运行时**: Bun >= 1.0.0（不支持 Node.js）
- **语言**: TypeScript 5.9+
- **包管理器**: Bun
- **架构**: 8 层 Monorepo

---

## 语言规范

**重要声明**：所有对话、注释、问答、思考过程等都必须严格使用中文。

---

## 项目结构

```
micro-agent/
├── packages/                    # 核心包（Monorepo）
│   ├── types/                   # 核心类型定义
│   ├── runtime/                 # 运行时引擎
│   ├── config/                  # 三级配置系统
│   ├── storage/                 # 会话存储
│   ├── providers/               # LLM Provider 抽象
│   ├── extension-system/        # 扩展发现、加载、热重载
│   ├── sdk/                     # 聚合 SDK
│   └── server/                  # 服务层
├── apps/
│   ├── cli/                     # CLI 应用入口
│   └── prompts/                 # Prompt 模板
├── extensions/                  # 扩展模块
│   ├── tool/                    # 工具扩展
│   ├── channel/                 # 通道扩展
│   └── skills/                  # 技能扩展
├── tests/                       # 测试文件
├── docs/                        # VitePress 文档
└── templates/                   # 配置模板
```

---

## 架构层次

依赖方向: Types → Runtime/Config/Storage → SDK/Providers/Extension-System → Server → CLI

**架构特点**:
- 8 层 Monorepo 设计，职责清晰
- 事件驱动，模块解耦
- 支持热重载，开发体验友好

---

## 常用命令

```bash
# 开发
bun run dev              # 开发模式启动
bun start                # 生产模式启动

# 测试
bun test                 # 运行所有测试
bun test:unit            # 单元测试
bun test:integration     # 集成测试
bun test:e2e             # 端到端测试
bun test:container       # 容器测试
bun test:config          # 配置测试

# 代码质量
bun run typecheck        # 类型检查
bun run prepare          # 链接 CLI 命令
```

---

## 核心类型

### 模型标识格式

```typescript
// 格式：<provider>/<model>
"ollama/qwen3"
"deepseek/deepseek-chat"
```

### Agent 模型配置

```typescript
interface ModelsConfig {
  chat?: string;    // 对话模型（必填）
  check?: string;   // 检查模型
  tool?: string;    // 工具调用模型
  embed?: string;   // 嵌入模型
  vision?: string;  // 视觉模型
  coder?: string;   // 编程模型
}
```

### Agent 状态

```typescript
type AgentState = 'idle' | 'thinking' | 'executing' | 'waiting' | 'error';
```

### 工具定义（MCP 兼容）

```typescript
interface Tool {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
}
```

### 上下文类型

```typescript
interface AgentContext {
  sessionKey: string;
  workspace: string;
  currentDir: string;
  channel: string;
  chatId: string;
  messages: LLMMessage[];
  tools: Map<string, Tool>;
  executeTool: (name: string, input: unknown) => Promise<ToolResult>;
  sendMessage: (content: string) => Promise<void>;
}
```

---

## 扩展开发

### 工具扩展

```typescript
import { defineTool } from '@micro-agent/sdk';

export default defineTool({
  name: 'my_tool',
  description: '工具描述',
  inputSchema: {
    type: 'object',
    properties: {
      param: { type: 'string', description: '参数描述' }
    },
    required: ['param']
  },
  handler: async (params, context) => {
    return { result: 'success' };
  }
});
```

### 通道扩展

```typescript
import { defineChannel, type InboundMessageParams } from '@micro-agent/sdk';

export default defineChannel({
  name: 'my_channel',
  init: async (config) => {
    return { connected: true };
  },
  onMessage: async (params: InboundMessageParams) => {
    const { content, sessionKey, chatId } = params;
  },
  send: async (message) => {
  },
  close: async () => {
  }
});
```

### 技能扩展

```markdown
---
name: my_skill
description: 技能描述
version: 1.0.0
triggers:
  - pattern: "触发关键词"
---

# 技能说明
```

### 热重载

扩展系统支持文件变更自动重载：
- 监听 `extensions/` 目录变更
- 防抖处理（500ms）
- 优雅关闭旧扩展
- 自动加载新扩展

---

## 配置系统

### 三级配置优先级

```
directory < project < user
```

### 配置示例

```yaml
workspace: ~/.micro-agent/workspace

models:
  chat: ollama/qwen3
  check: ollama/qwen3
  tool: ollama/qwen3
  embed: openai/text-embedding-3-small

memory:
  enabled: true
  autoSummarize: true

executor:
  maxIterations: 10
  loopDetection: true

providers:
  ollama:
    baseUrl: http://localhost:11434/v1
    models: [qwen3, qwen3-vl]
  deepseek:
    baseUrl: https://api.deepseek.com/v1
    apiKey: ${DEEPSEEK_API_KEY}
    models: [deepseek-chat]

channels:
  feishu:
    enabled: false
    appId: cli_xxx
    appSecret: xxx
  cli:
    enabled: true
```

---

## 设计原则

### P0 核心原则

1. **单一职责**：模块/组件只负责一个业务领域
2. **代码即文档**：接口/组件使用完整语义化命名
3. **显式优于隐式**：依赖通过参数显式传递

### P1 架构原则

4. **失败快速**：入口处进行参数校验
5. **组合优于继承**：模块间通过事件机制通信
6. **开放封闭**：使用注册表模式动态注册扩展
7. **依赖倒置**：依赖接口而非具体实现

### P2 API 设计原则

8. **接口隔离**：接口按职责拆分，保持精简
9. **最小惊讶**：函数/方法名准确描述行为

### P3 并发与状态管理

10. **并发控制**：subagent 最大并发数量限制为 2
11. **轻量化设计**：
    - 单文件行数 ≤ 300 行
    - 单方法行数 ≤ 25 行
    - 方法嵌套层级 ≤ 3 层
    - 方法参数 ≤ 4 个
12. **零技术债务**：重构后立即删除旧代码
13. **不可变性优先**：优先创建新对象而非修改对象

---

## 开发规范

### 命名规范

| 类型 | 规范 | 示例 |
|------|------|------|
| 接口/类名 | 帕斯卡命名法 | `UserService`、`LLMGateway` |
| 方法/变量 | 驼峰命名法 | `getUserById` |
| 常量 | 大写蛇形命名法 | `MAX_RETRY_COUNT` |
| 文件名 | 短横线命名法 | `my-tool.ts` |

### 注释规范

- **类和方法**：XML 文档注释，注明参数返回值
- **字段和属性**：行间注释说明用途
- **方法内部**：仅复杂逻辑需行间注释

### 提交规范

```
<type>(<scope>): <subject>

<body>
```

- `<type>`: feat | fix | refactor | docs | chore
- `<scope>`: 可选，模块名称
- `<subject>`: 简短描述，不超过 50 字符

---

## 测试规范

- **测试框架**: `bun:test`
- **测试文件**: `tests/` 目录，`*.test.ts` 后缀
- **测试数量**: 29 个测试套件
- **测试分类**: unit | integration | e2e

---

## 注意事项

1. **Bun 专有 API**: 使用 `Bun.serve()`、`Bun.spawn()`，不支持 Node.js
2. **模块解析**: 使用 `moduleResolution: bundler`，配置了路径别名
3. **MCP 兼容**: 工具定义遵循 Model Context Protocol 规范
4. **环境变量**: 配置支持 `${VAR_NAME}` 语法
5. **扩展隔离**: 扩展只能访问配置的工作区目录
6. **最佳实践**: 结合 Context7 MCP 和联网搜索确认最新文档和最佳实践
7. **并行任务优化**: 使用 subagent 并发处理，最大并发数限制为 2
8. **类型安全**: 严格 TypeScript 类型检查，使用 `zod` 进行运行时验证

---

## 核心 API

```typescript
// 定义扩展
import { defineTool, defineChannel, defineSkill } from '@micro-agent/sdk';

// 运行时核心
import { Container, EventBus, HookSystem } from '@micro-agent/runtime';

// 配置加载
import { ConfigLoader } from '@micro-agent/config';

// 存储服务
import { SessionStore } from '@micro-agent/storage';
```