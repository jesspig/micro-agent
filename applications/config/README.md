# Config

配置管理模块 - 应用配置和提示词模板。

## 结构

```
applications/config/
├── settings.ts        # 应用配置（模型选择、Token 预算等）
└── prompts/           # 提示词模板
    └── index.ts
```

## 配置项

```typescript
interface AppConfig {
  // 模型配置
  model: {
    provider: 'openai' | 'anthropic' | 'local';
    name: string;
  };
  
  // Token 预算
  tokenBudget: {
    maxInput: number;
    maxOutput: number;
  };
  
  // 超时设置
  timeout: {
    request: number;
    tool: number;
  };
}
```

## 用途

配置项通过 SDK API 传递给 Agent Service，不在运行时持久化。
