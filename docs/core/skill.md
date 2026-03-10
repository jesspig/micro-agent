# Skill - 技能系统

## 概述

技能是扩展 Agent 能力的 Markdown 文档，基于 Agent Skills 规范。

## SKILL.md 格式

```markdown
---
name: my-skill
description: 技能描述
license: MIT
compatibility: micro-agent@>=1.0.0
always: false
allowed-tools:
  - read_file
  - write_file
metadata:
  author: username
---

# 技能内容

这里是技能的详细说明和使用方法。
```

## 字段说明

| 字段 | 类型 | 说明 |
|------|------|------|
| name | string | 技能名称（必须与目录名一致） |
| description | string | 技能描述 |
| license | string | 开源许可证 |
| compatibility | string | 兼容版本 |
| always | boolean | 是否始终加载 |
| allowed-tools | string[] | 允许使用的工具 |
| metadata | object | 自定义元数据 |

## 加载优先级

1. **项目技能**: `./workspace/skills/`
2. **用户技能**: `~/.micro-agent/skills/`
3. **内置技能**: `extensions/skill/`

## 渐进式披露

- 启动时加载技能摘要
- 按需加载完整内容

```typescript
// 获取摘要列表
const summaries = skillsLoader.getSummaries();

// 获取完整技能
const skill = skillsLoader.get('skill-name');
```

## 源码位置

- 技能加载器: `agent-service/runtime/capability/skill-system/`
- SDK 封装: `sdk/src/skill/`

## SDK 定义

SDK 提供 `defineSkill` 函数用于代码定义技能：

```typescript
import { defineSkill } from '@micro-agent/sdk';

const mySkill = defineSkill({
  name: 'my-skill',
  description: '我的自定义技能',
  dependencies: ['bun>=1.0'],
  compatibility: 'bun',
  always: false,
  allowedTools: ['read', 'write'],
  content: `
# My Skill

这个技能可以做什么...

## 使用方式

\`\`\`bash
bun scripts/index.ts
\`\`\`\n  `,
});
```

### 字段说明

| 字段 | 类型 | 说明 |
|------|------|------|
| name | string | 技能名称（小写字母、数字、连字符） |
| description | string | 技能描述 |
| dependencies | string[] | 依赖包列表 |
| license | string | 许可证 |
| compatibility | string | 环境兼容性要求 |
| always | boolean | 是否自动加载完整内容 |
| allowedTools | string[] | 预批准工具列表 |
| content | string | 技能内容（Markdown） |
