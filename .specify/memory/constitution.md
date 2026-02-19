<!--
  Sync Impact Report
  ===================
  Version change: 1.0.0 → 1.0.1
  Modified sections:
    - Governance: 新增分支命名规范
  Added sections:
    - Branch Naming Convention (under Governance)
  Removed sections: None
  Templates requiring updates:
    - .specify/templates/plan-template.md: ✅ Compatible (需更新示例)
    - .specify/templates/spec-template.md: ✅ Compatible (需更新示例)
    - .specify/templates/tasks-template.md: ✅ Compatible
  Scripts requiring updates:
    - .specify/scripts/bash/common.sh: ⚠ pending (check_feature_branch 正则需更新)
  Follow-up TODOs: None
-->

# microbot Constitution

## Core Principles

### I. 代码即文档

TypeScript 类型系统必须自解释。代码 SHOULD 具备以下特性：

- **可读性优先**：简单明了优于"聪明"的写法
- **不滥用设计模式**：只在解决具体问题时使用，不过度抽象
- **不滥用语法糖**：避免晦涩链式调用，拆分为可读步骤

**Rationale**：代码是开发者阅读频率最高的文档。可读性差的代码增加维护成本，降低团队协作效率。

### II. 组合优于继承（NON-NEGOTIABLE）

MUST 使用 **接口 + 依赖注入 + 事件总线** 架构，禁止使用继承解决组件复用问题。

| 继承问题 | 组合解决方案 |
|----------|--------------|
| 父类修改影响所有子类 | 接口稳定，实现可替换 |
| 多继承复杂度 | 多接口组合，职责单一 |
| 循环依赖风险 | DI + 事件总线解耦 |
| 测试困难 | 接口 mock 简单 |

```typescript
// ❌ 禁止：继承导致循环依赖
class BaseChannel { protected agent: Agent; }

// ✅ 要求：接口 + 依赖注入
class FeishuChannel implements IChannel {
  constructor(private readonly eventBus: IEventBus) {}
}
```

**Rationale**：继承是 TypeScript 项目循环依赖的主要来源。组合模式通过接口隔离和依赖注入实现松耦合，提高可测试性和可维护性。

### III. 开放封闭原则（OCP）

**对扩展开放，对修改封闭**。核心扩展机制：

| 扩展点 | 方式 |
|--------|------|
| 新增通道 | 实现 `Channel` 接口，注册到 `ChannelRegistry` |
| 新增工具 | 实现 `Tool` 接口，注册到 `ToolRegistry` |
| 新增技能 | 放置 `SKILL.md` 到 skills 目录 |
| 新增中间件 | 注册到消息处理管道 |

**Rationale**：OCP 确保核心逻辑稳定，扩展功能无需修改现有代码，降低回归风险。

### IV. 轻量化设计

代码规模限制：

| 限制 | 阈值 | 原因 |
|------|------|------|
| 单文件行数 | ≤ 300 行 | 保持可读性，便于维护 |
| 单方法行数 | ≤ 25 行 | 单一职责，易于理解 |
| 方法嵌套层级 | ≤ 3 层 | 避免复杂度爆炸 |
| 方法参数数量 | ≤ 4 个 | 过多参数应封装为对象 |

**Rationale**：大型文件和方法增加认知负担，降低代码审查效率。小文件、小方法更易于测试、复用和维护。

### V. 本地优先

LLM Provider 设计 MUST 遵循本地优先原则：

- **默认本地**：Ollama/LM Studio/vLLM 无需 API Key
- **云服务接入**：通过 OpenAI Compatible 接入任意云服务商
- **隐私保护**：敏感数据优先本地处理

**Rationale**：本地优先降低使用门槛，保护用户隐私，减少对外部服务的依赖。

## Architecture Standards

### 依赖注入容器

MUST 使用轻量级自实现容器（~50 行代码），禁止引入第三方 DI 库。

```typescript
// 容器接口
interface IContainer {
  register<T>(token: string, factory: () => T): void;
  singleton<T>(token: string, factory: () => T): void;
  resolve<T>(token: string): T;
}
```

### 事件系统

MUST 使用 `mitt`（200b）或自实现事件总线。禁止引入重型事件库。

### 文件结构

```
src/
├── types/
│   └── interfaces.ts      # 所有接口定义（零依赖）
├── container.ts           # DI 容器（无业务依赖）
├── bus/
│   └── events.ts          # 事件总线（依赖 types）
├── channels/              # 通道实现（依赖 interfaces）
├── agent/                 # Agent 实现（依赖 interfaces）
└── index.ts               # 模块组装（唯一依赖所有模块）
```

**关键规则**：`types/interfaces.ts` 必须零依赖，避免循环依赖。

## Quality Standards

### 命名规范

| 类型 | 规范 | 示例 |
|------|------|------|
| 文件名 | kebab-case | `tool-registry.ts` |
| 类名 | PascalCase | `ToolRegistry` |
| 函数/变量 | camelCase | `registerTool` |
| 常量 | UPPER_SNAKE_CASE | `MAX_ITERATIONS` |
| 接口 | 无 I 前缀 | `Channel`（非 `IChannel`） |
| 私有属性 | 下划线前缀 | `_cache` |

### 注释要求

- **类**：XML 文档注释 + 用途说明
- **方法**：XML 文档注释 + 参数/返回值说明
- **复杂逻辑**：行间注释说明意图
- **字段/属性**：行间用途说明

### 反模式禁止

```typescript
// ❌ 禁止：过度抽象
const process = (x) => (f) => f(x);

// ✅ 要求：简单明了
const transformed = transform(data);
const result = validate(transformed);

// ❌ 禁止：过度使用语法糖
const fn = users?.filter(u => u.active)?.map(u => u.name)?.join(',') ?? 'none';

// ✅ 要求：可读性优先
const activeUsers = users.filter(u => u.active);
const names = activeUsers.map(u => u.name);
const result = names.length > 0 ? names.join(',') : 'none';
```

## Governance

### 分支命名规范

分支命名 MUST 遵循以下规范：

| 分支类型 | 格式 | 示例 |
|----------|------|------|
| 功能分支 | `feature/<name>` | `feature/extensions-sdk` |
| 修复分支 | `fix/<name>` | `fix/memory-leak` |
| 重构分支 | `refactor/<name>` | `refactor/config-system` |
| 文档分支 | `docs/<name>` | `docs/api-reference` |
| 主分支 | `main` / `develop` | - |

**Rationale**：简洁的分支命名便于识别分支用途，避免数字前缀带来的维护负担。

### 修订流程

1. 宪法修订 MUST 通过文档评审
2. 修订 MUST 更新 `LAST_AMENDED_DATE` 和 `CONSTITUTION_VERSION`
3. 版本号遵循语义化版本：
   - **MAJOR**：向后不兼容的原则删除或重定义
   - **MINOR**：新增原则或 materially 扩展指导
   - **PATCH**：澄清、措辞、错字修复

### 合规检查

- 所有 PR/reviews MUST 验证宪法合规性
- 复杂度 MUST 有明确理由（见 plan.md Complexity Tracking）
- 运行时开发指导见 `IFLOW.md`

### 宪法优先级

本宪法优先级高于所有其他实践文档。冲突时以宪法为准。

**Version**: 1.0.1 | **Ratified**: 2026-02-16 | **Last Amended**: 2026-02-17