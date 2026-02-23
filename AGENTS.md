# Agent 开发指南

## 设计原则

### 原则优先级

| 优先级 | 原则 | 适用场景 |
|--------|------|----------|
| P0 | 单一职责、代码即文档、显式优于隐式 | 所有代码 |
| P1 | 依赖倒置、组合优于继承、失败快速、测试驱动 | 架构设计 |
| P2 | 接口隔离、开放封闭、最小惊讶 | API 设计 |
| P3 | 不可变性优先、轻量化设计 | 状态管理 |

---

### 核心原则

#### I. 代码即文档

**核心理念**：类型系统自解释，命名语义化，避免隐式逻辑。

```typescript
// ✅ 类型即文档
interface Tool {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: ZodSchema;
  execute(input: unknown, ctx: ToolContext): Promise<unknown>;
}

// ❌ 需要额外注释说明
interface Tool {
  n: string;
  d: string;
  schema: any;
  run(i: any, c: any): Promise<any>;
}
```

**实践要点**：
- 接口字段使用完整语义化命名
- 避免缩写，除非是业界共识（如 `LLM`、`API`）
- 类型定义即是最准确的文档

#### II. 单一职责原则

**核心理念**：一个模块只做一件事，一个函数只完成一个目标。

```typescript
// ❌ 职责混杂
class UserManager {
  createUser() { }
  sendEmail() { }
  logActivity() { }
}

// ✅ 职责分离
class UserService { createUser() { } }
class EmailService { send() { } }
class ActivityLogger { log() { } }
```

**实践要点**：
- 类/模块只负责一个业务领域
- 方法只完成一个明确的目标
- 拆分复杂函数为多个小函数

#### III. 显式优于隐式

**核心理念**：行为意图清晰可见，避免魔法和隐式约定。

```typescript
// ❌ 隐式行为
function process(data) {
  return data.map(transform); // transform 从哪来？
}

// ✅ 显式依赖
function process(data: Data[], transform: TransformFn) {
  return data.map(transform);
}
```

**实践要点**：
- 依赖关系通过参数显式传递
- 避免全局变量和隐式上下文
- 配置项通过对象参数传入

#### IV. 失败快速原则

**核心理念**：尽早暴露错误，避免错误传播。

```typescript
// ❌ 错误延迟暴露
async function execute(tool: Tool) {
  const result = await tool.run();
  if (!result) throw new Error('执行失败');
}

// ✅ 前置校验
function execute(tool: Tool) {
  if (!tool) throw new Error('工具不存在');
  if (!tool.execute) throw new Error('工具未实现 execute');
  return tool.execute();
}
```

**实践要点**：
- 入口处进行参数校验
- 必要条件不满足时立即抛出异常
- 不吞没错误，向上传递

---

### SOLID 原则

#### V. 组合优于继承

**核心理念**：通过组合 + 事件总线解耦，避免继承链导致的循环依赖。

```typescript
// ❌ 继承导致循环依赖
class BaseChannel { protected agent: Agent; }
class Agent { channels: BaseChannel[]; }

// ✅ 组合 + 事件总线解耦
class FeishuChannel implements Channel {
  constructor(private eventBus: EventBus) {
    this.eventBus.on('message:outbound', this.send.bind(this));
  }
}
```

**实践要点**：
- 模块间通过 `EventBus` 通信，不直接引用
- 依赖注入通过 `Container` 获取实例
- 接口定义契约，实现类可替换

#### VI. 开放封闭原则

**核心理念**：对扩展开放，对修改封闭，使用注册表模式实现插件式扩展。

```typescript
class ToolRegistry {
  private tools = new Map<string, Tool>();
  register(tool: Tool): void { this.tools.set(tool.name, tool); }
  get(name: string): Tool | undefined { return this.tools.get(name); }
}
```

**实践要点**：
- 使用注册表模式动态注册扩展
- 通过依赖注入解耦组件
- 通过事件系统实现松耦合通信

#### VII. 依赖倒置原则

**核心理念**：高层模块不依赖低层模块，两者都依赖抽象。

```typescript
// ❌ 高层依赖具体实现
class Agent { private llm = new OpenAIProvider(); }

// ✅ 依赖抽象接口
class Agent { constructor(private llm: LLMProvider) {} }
```

**实践要点**：
- 依赖接口而非具体实现
- 通过构造函数注入依赖
- 使用工厂模式创建实例

#### VIII. 接口隔离原则

**核心理念**：不应强迫客户端依赖它不使用的方法。

```typescript
// ❌ 臃肿接口
interface Worker { work(): void; eat(): void; sleep(): void; }

// ✅ 接口分离
interface Worker { work(): void; }
interface Eater { eat(): void; }
```

**实践要点**：
- 接口按职责拆分，保持精简
- 客户端只依赖需要的接口
- 避免创建"上帝接口"

---

### 实践原则

#### IX. 轻量化设计

**核心理念**：最小依赖，最小抽象，无过度工程。

| 约束 | 阈值 | 原因 |
|------|------|------|
| 单文件行数 | ≤ 300 行 | 保持可读性 |
| 单方法行数 | ≤ 25 行 | 单一职责 |
| 方法嵌套层级 | ≤ 3 层 | 避免复杂度爆炸 |
| 方法参数 | ≤ 4 个 | 过多应封装为对象 |
| 抽象层 | ≤ 2 层 | 不创建不必要的基类 |

```typescript
// ❌ 过度抽象
interface IBaseHandler { handle(): void; }
interface IMessageHandler extends IBaseHandler { parse(): void; }
abstract class AbstractHandler implements IMessageHandler { ... }
class HandlerImpl extends AbstractHandler { ... }

// ✅ 最小抽象
interface Handler { handle(msg: Message): void; }
class MessageHandler implements Handler { handle(msg) { ... } }
```

#### X. 零技术债务

**核心理念**：及时清除遗留代码和弃用代码，避免新旧代码共存。

```typescript
// ❌ 新旧代码共存
function process(data: unknown, legacy?: boolean) {
  if (legacy) return legacyProcess(data);
  return newProcess(data);
}

// ✅ 干净迁移
function process(data: unknown) {
  return newProcess(data);
}
```

**实践要点**：
- 重构后立即删除旧代码，不保留"兼容层"
- 废弃的导入、变量、函数立即清理
- 注释掉的代码块直接删除，不保留
- 重构时同步更新所有调用点，不留"过渡期"

#### XI. 最小惊讶原则

**核心理念**：API 行为应符合直觉预期，避免意外结果。

```typescript
// ❌ 意外行为
function getUser(id: string): User | null {
  if (!id) return createUser(); // 意料之外的创建
}

// ✅ 符合预期
function getUser(id: string): User | null {
  if (!id) return null;
}
```

**实践要点**：
- 函数名准确描述行为
- 参数和返回值符合直觉
- 避免副作用和隐藏状态

#### XII. 不可变性优先

**核心理念**：优先使用不可变数据，减少副作用。

```typescript
// ❌ 可变状态
const state = { count: 0 };
state.count += 1;

// ✅ 不可变更新
const state = { count: 0 } as const;
const newState = { ...state, count: state.count + 1 };
```

**实践要点**：
- 使用 `readonly` 修饰不可变字段
- 使用展开运算符创建新对象
- 避免直接修改数组/对象

#### XIII. 测试驱动

**核心理念**：先写测试，后写实现，用测试定义行为契约。

```typescript
// ✅ 测试先行 - 定义行为契约
describe('ToolRegistry', () => {
  it('应支持注册和获取工具', () => {
    const registry = new ToolRegistry();
    const tool = { name: 'test', execute: () => 'ok' };
    registry.register(tool);
    expect(registry.get('test')).toBe(tool);
  });
});

// 然后实现代码
class ToolRegistry {
  private tools = new Map<string, Tool>();
  register(tool: Tool): void { this.tools.set(tool.name, tool); }
  get(name: string): Tool | undefined { return this.tools.get(name); }
}
```

**实践要点**：
- 修改代码前先更新测试，确保测试覆盖新行为
- 测试失败时立即修复，不积累测试债务
- 保持测试简洁，一个测试只验证一个行为
- 重构代码时测试作为安全网，确保行为不变

---

## 开发规范

### 命名规范

| 类型 | 规范 | 示例 |
|------|------|------|
| 接口/类名 | PascalCase | `UserService` |
| 方法/变量 | camelCase | `getUserById` |
| 常量 | UPPER_SNAKE_CASE | `MAX_RETRY_COUNT` |
| 缩写 | 仅业界共识 | `LLM`、`API`、`URL` |

### 注释规范

| 位置 | 要求 |
|------|------|
| 类和方法 | XML 文档注释，注明参数返回值 |
| 字段和属性 | 行间注释说明用途 |
| 方法内部 | 仅复杂逻辑需行间注释 |

### 提交规范

```
<type>(<scope>): <subject>
```

**类型**: `feat` | `fix` | `refactor` | `docs` | `chore`

### 测试规范

| 要求 | 说明 |
|------|------|
| 测试先行 | 修改代码前先更新测试 |
| 测试覆盖 | 新增功能必须包含单元测试 |
| 测试简洁 | 一个测试只验证一个行为 |
| 测试独立 | 测试之间无依赖，可独立运行 |
| 测试债务 | 测试失败时立即修复，不积累 |
