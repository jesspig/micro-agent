# Agent 开发指南

## 设计原则

### I. 代码即文档

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

---

### II. 组合优于继承

**核心理念**：通过接口 + 事件总线解耦，避免继承链导致的循环依赖。

```typescript
// ❌ 继承导致循环依赖
class BaseChannel {
  protected agent: Agent;
}
class Agent {
  channels: BaseChannel[];
}

// ✅ 组合 + 事件总线解耦
class FeishuChannel implements Channel {
  constructor(private eventBus: EventBus) {
    this.eventBus.on('message:outbound', this.send.bind(this));
    this.eventBus.emit('message:received', inbound);
  }
}
```

**实践要点**：
- 模块间通过 `EventBus` 通信，不直接引用
- 依赖注入通过 `Container` 获取实例
- 接口定义契约，实现类可替换

---

### III. 开放封闭原则

**核心理念**：对扩展开放，对修改封闭。使用注册表模式实现插件式扩展。

```typescript
class ToolRegistry {
  private tools = new Map<string, Tool>();
  
  register(tool: Tool): void {
    this.tools.set(tool.name, tool);
  }
  
  get(name: string): Tool | undefined {
    return this.tools.get(name);
  }
}
```

**扩展机制**：

| 机制 | 用途 | 示例 |
|------|------|------|
| 依赖注入 | 解耦组件 | `container.resolve<ToolRegistry>()` |
| 事件系统 | 松耦合通信 | `eventBus.on('tool:beforeExecute')` |
| 钩子系统 | 注入前置/后置逻辑 | `hookSystem.register('pre:llm', hook)` |
| 注册表模式 | 动态注册扩展 | `toolRegistry.register(new MyTool())` |

---

### IV. 轻量化设计

**核心理念**：最小依赖，最小抽象，无过度工程。

**代码约束**：

| 约束 | 阈值 | 原因 |
|------|------|------|
| 单文件行数 | ≤ 300 行 | 保持可读性，便于审查 |
| 单方法行数 | ≤ 25 行 | 单一职责，易于测试 |
| 方法嵌套层级 | ≤ 3 层 | 避免复杂度爆炸 |
| 方法参数 | ≤ 4 个 | 过多应封装为对象 |
| 抽象层 | ≤ 2 层 | 不创建不必要的基类/接口 |

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

---

### V. 零技术债务

**核心理念**：及时清除遗留代码和弃用代码，避免新旧代码共存导致隐患。

```typescript
// ❌ 新旧代码共存
function process(data: unknown, legacy?: boolean) {
  if (legacy) {
    // 旧逻辑 - 已弃用但未删除
    return legacyProcess(data);
  }
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
- 测试代码中的调试日志、临时代码及时清除
- 重构时同步更新所有调用点，不留"过渡期"

**代码健康检查**：

| 检查项 | 处理方式 |
|--------|----------|
| 未使用的导入 | 立即删除 |
| 注释掉的代码 | 立即删除 |
| `// TODO` / `// FIXME` | 要么修复，要么删除 |
| 废弃的函数/类 | 立即删除所有引用并移除 |
| 重复的逻辑 | 合并后删除冗余版本 |

---

### VI. 本地优先

**核心理念**：默认本地存储和隐私保护，无云存储依赖。

**存储策略**：

| 数据 | 存储 | 位置 |
|------|------|------|
| 会话 | JSONL | `~/.microbot/sessions/` |

**LLM 优先级**：

```yaml
llm:
  gateway:
    defaultProvider: ollama  # 本地优先
    providers:
      ollama:
        baseUrl: http://localhost:11434/v1
        priority: 1
      deepseek:
        baseUrl: https://api.deepseek.com/v1
        priority: 2
```

---

## 开发规范

### 命名规范
- 接口/类名：PascalCase
- 方法/变量：camelCase
- 常量：UPPER_SNAKE_CASE
- 避免缩写，除业界共识（LLM、API、URL）

### 注释规范
- 类和方法添加 XML 文档注释
- 字段和属性添加行间注释
- 方法内仅复杂逻辑需行间注释
- 拒绝冗余注释，代码即文档

### 提交规范

```
<type>(<scope>): <subject>

<body>
```

**类型**: `feat` | `fix` | `refactor` | `docs` | `chore`