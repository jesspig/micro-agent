# MicroAgent 开发指南

**MicroAgent** 是基于 Bun + TypeScript 的超轻量级个人 AI 助手框架。所有对话、注释、问答、思考过程等都必须严格使用中文。

---

## 常用命令

```bash
bun run dev       # 开发模式
bun start         # 生产模式
bun test          # 运行测试
bun run typecheck # 类型检查
```

---

## 设计原则

| 优先级 | 原则 |
|--------|------|
| P0 | 单一职责、代码即文档、显式优于隐式 |
| P1 | 失败快速、组合优于继承、开放封闭、依赖倒置 |
| P2 | 接口隔离、最小惊讶 |
| P3 | 轻量化（文件≤300行，方法≤25行，嵌套≤3层）、零技术债务 |

---

## 开发规范

| 类型 | 规范 | 示例 |
|------|------|------|
| 接口/类名 | 帕斯卡命名法 | `UserService` |
| 方法/变量 | 驼峰命名法 | `getUserById` |
| 常量 | 大写蛇形命名法 | `MAX_COUNT` |
| 文件名 | 短横线命名法 | `my-tool.ts` |
| 提交 | `feat/fix/refactor/docs/chore(scope): subject` | |

---

## 关键约束

- **禁止 Node.js API**: 完全使用 Bun API，避免兼容性问题
- **并发控制**: subagent 最大并发数限制为 2，多任务可分批并行
