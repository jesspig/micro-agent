# MicroAgent 开发指南

## 项目概述

**MicroAgent** 是基于 Bun + TypeScript 的超轻量级个人 AI 助手框架，定位为 LLM/Agent 双向网关 + 可扩展 Agent 运行时。

- **版本**: 0.2.1
- **运行时**: Bun >= 1.0.0（不支持 Node.js）
- **语言**: TypeScript 5.9+
- **包管理器**: Bun

---

## 语言规范

**重要声明**：所有对话、注释、问答、思考过程等都必须严格使用中文。

---

## 项目结构

```
micro-agent/
├── packages/                    # 核心包（Monorepo）
│   ├── types/                   # 核心类型定义（MCP 兼容）
│   ├── runtime/                 # 运行时引擎（Container、EventBus、HookSystem、Gateway）
│   ├── config/                  # 三级配置系统（user < project < directory）
│   ├── storage/                 # 会话存储（JSONL）、记忆存储
│   ├── providers/               # LLM Provider 抽象、Gateway、路由
│   ├── extension-system/        # 扩展发现、加载、热重载
│   ├── sdk/                     # 聚合 SDK，统一开发接口
│   └── server/                  # 服务层（Channel、Queue、Events）
├── apps/
│   ├── cli/                     # CLI 应用入口
│   ├── prompts/                 # Prompt 模板
│   └── tui/                     # 终端 UI
├── extensions/                  # 扩展模块
│   ├── tool/                    # 工具扩展（filesystem、shell、web、message）
│   ├── channel/                 # 通道扩展（cli、feishu、acp）
│   └── skills/                  # 技能扩展（time、sysinfo、skill-creator）
├── tests/                       # 测试文件
├── docs/                        # VitePress 文档
├── templates/                   # 配置模板、Prompt 模板
└── specs/                       # 设计规格
```

---

## 架构层次

依赖方向: Types → Runtime/Config/Storage → SDK/Providers/Extension-System → Server → CLI

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
"glm/glm-5"
```

### Agent 模型配置

```typescript
interface ModelsConfig {
  chat?: string;    // 对话模型（必填）
  tool?: string;    // 工具调用模型
  embed?: string;   // 嵌入模型（向量检索）
  vision?: string;  // 视觉模型（图片识别）
  coder?: string;   // 编程模型
  intent?: string;  // 意图识别模型
}
```

### 工具定义（MCP 兼容）

```typescript
interface Tool {
  name: string;           // 工具名称
  description: string;    // 工具描述
  inputSchema: {          // 输入 Schema（JSON Schema）
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
}
```

---

## 扩展开发

### 工具扩展

```typescript
// extensions/tool/my-tool/index.ts
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
// extensions/channel/my-channel/channel.ts
import { defineChannel, type InboundMessageParams } from '@micro-agent/sdk';

export default defineChannel({
  name: 'my_channel',
  init: async (config) => { /* 初始化连接 */ },
  onMessage: async (params: InboundMessageParams) => { /* 处理入站消息 */ },
  send: async (message) => { /* 发送消息 */ }
});
```

### 技能扩展

```markdown
<!-- extensions/skills/my-skill/SKILL.md -->
---
name: my_skill
description: 技能描述
version: 1.0.0
triggers:
  - pattern: "触发关键词"
---

# 技能说明

技能的详细说明和使用方法...
```

---

## 配置系统

### 三级配置优先级

```
directory < project < user
```

- **directory**: 当前目录 `.micro-agent.yaml`
- **project**: 项目根目录 `micro-agent.yaml`
- **user**: 用户目录 `~/.micro-agent/settings.yaml`

### 配置文件结构

```yaml
agents:
  workspace: ~/.micro-agent/workspace
  models:
    chat: ollama/qwen3    # 必填
    tool: ollama/qwen3
    embed: openai/text-embedding-3-small
  memory:
    enabled: true
    autoSummarize: true
  maxTokens: 512
  temperature: 0.7

providers:
  ollama:
    baseUrl: http://localhost:11434/v1
    models:
      - qwen3
      - qwen3-vl
  deepseek:
    baseUrl: https://api.deepseek.com/v1
    apiKey: ${DEEPSEEK_API_KEY}
    models:
      - deepseek-chat

channels:
  feishu:
    enabled: false
    appId: cli_xxx
    appSecret: xxx

workspaces:
  - ~/projects/my-project
```

---

## 设计原则

### P0 核心原则（所有代码）

1. **单一职责**：模块/组件只负责一个业务领域，方法只完成一个明确目标
2. **代码即文档**：接口/组件使用完整语义化命名，避免缩写（LLM/API/URL/MCP 除外）
3. **显式优于隐式**：依赖通过参数显式传递，避免全局变量和隐式上下文

### P1 架构原则

4. **失败快速**：入口处进行参数校验，必要条件不满足时立即抛出异常
5. **组合优于继承**：模块间通过事件机制通信，依赖通过 Container 获取实例
6. **开放封闭**：使用注册表模式动态注册扩展，扩展功能不修改现有代码
7. **依赖倒置**：依赖接口而非具体实现，通过构造函数注入依赖

### P2 API 设计原则

8. **接口隔离**：接口按职责拆分，保持精简，避免"上帝接口"
9. **最小惊讶**：函数/方法名准确描述行为，参数和返回值符合直觉

### P3 并发与状态管理原则

10. **并发控制**：subagent 最大并发数量限制为 2，防止资源过载
11. **轻量化设计**：方法不超过 25 行，嵌套不超过 3 层，≤3 行代码不创建函数
12. **零技术债务**：重构后立即删除旧代码，不保留"兼容层"
13. **不可变性优先**：优先创建新对象而非修改现有对象，减少副作用

---

## 开发规范

### 命名规范

| 类型 | 规范 | 示例 |
|------|------|------|
| 接口/类名 | 帕斯卡命名法 | `UserService`、`LLMGateway` |
| 方法/变量 | 驼峰命名法 | `getUserById`、`parseResponse` |
| 常量 | 大写蛇形命名法 | `MAX_RETRY_COUNT`、`DEFAULT_TIMEOUT` |
| 文件名 | 短横线命名法 | `my-tool.ts`、`openai-compatible.ts` |

### 注释规范

| 位置 | 要求 |
|------|------|
| 类和方法 | XML 文档注释，注明参数返回值 |
| 字段和属性 | 行间注释说明用途 |
| 方法内部 | 仅复杂逻辑需行间注释 |

### 提交规范

```
<type>(<scope>): <subject>
<BLANK LINE>
<body>
```

**Header**：
- `<type>`: feat | fix | refactor | docs | chore
- `<scope>`: 可选，模块名称
- `<subject>`: 简短描述，不超过 50 字符，动词原形开头，首字母小写，不加句号

**Body**：
- 详细说明修改内容
- 说明为什么修改，做了什么修改
- 每行不超过 72 字符

---

## 测试规范

- 测试框架: `bun:test`
- 测试文件: `tests/` 目录，`*.test.ts` 后缀
- 测试分类: `tests/unit/`、`tests/integration/`、`tests/e2e/`

---

## 注意事项

1. **Bun 专有 API**: 使用 `Bun.serve()`、`Bun.spawn()`，不支持 Node.js
2. **模块解析**: 使用 `moduleResolution: bundler`，配置了路径别名
3. **MCP 兼容**: 工具定义遵循 Model Context Protocol 规范
4. **环境变量**: 配置支持 `${VAR_NAME}` 语法
5. **扩展隔离**: 扩展只能访问配置的工作区目录
