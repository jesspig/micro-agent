# Templates

模板模块 - 配置模板和提示词模板。

## 结构

```
applications/templates/
├── configs/           # 配置模板
│   └── settings.example.yaml
├── prompts/           # 提示词模板
│   └── system.md
└── index.ts           # 模块入口
```

## 配置模板

`configs/settings.example.yaml` 提供配置示例，用户可复制并修改。

## 提示词模板

`prompts/system.md` 系统提示词模板，支持变量替换。

## 用法

```typescript
import { loadTemplate } from '@micro-agent/templates';

const systemPrompt = loadTemplate('system', {
  agentName: 'MyAgent',
  capabilities: ['tool', 'memory']
});
```
