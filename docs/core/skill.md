# Skill - 技能系统

## 概述

技能是扩展 Agent 能力的 Markdown 文档，基于 Agent Skills 规范。

## SKILL.md 格式

```markdown
---
name: my-skill
description: 技能描述
license: MIT
compatibility: microbot@>=1.0.0
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
2. **用户技能**: `~/.microbot/skills/`
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

- 加载器: `packages/extension-system/src/skill/loader.ts`
- 类型定义: `packages/types/src/skill.ts`
