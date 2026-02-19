# 核心模块

Core 模块位于 `packages/core/src/`，提供框架的核心功能。

## 模块列表

- [Container](container) - 依赖注入容器
- [Provider](provider) - LLM 提供商接口
- [Agent](agent) - Agent 循环实现
- [Tool](tool) - 工具系统
- [Channel](channel) - 消息通道
- [Storage](storage) - 存储层
- [Skill](skill) - 技能系统
- [Service](service) - 后台服务

## 导出

Core 模块通过以下路径导出：

```typescript
import { Container, EventBus, HookSystem } from '@microbot/sdk';
import { AgentLoop } from '@microbot/sdk/agent';
import { SessionStore, MemoryStore } from '@microbot/sdk/storage';
```
