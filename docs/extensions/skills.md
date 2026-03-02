# 技能扩展

## 概述

技能扩展位于 `extensions/skills/`，每个技能是一个包含 SKILL.md 的目录。

## 三级渐进式披露

技能系统采用三级渐进式披露架构，根据上下文动态加载技能内容：

| 级别 | 加载条件 | 内容 | Token 限制 |
|------|----------|------|------------|
| Level 1 | 默认 | 摘要（name, description, location） | ~100 |
| Level 2 | 需要时 | SKILL.md 正文 | 500-2000 |
| Level 3 | 执行时 | scripts/ 脚本 | 按需 |

**优先级**：builtin < user < workspace

**always 属性**：设置为 true 时，Level 2 内容直接注入上下文

## SKILL.md 格式

```yaml
---
name: skill-name           # 必填：技能名称（小写字母、数字、连字符）
description: 技能描述       # 必填：触发描述
dependencies:              # 可选：依赖列表
  - bun>=1.0
compatibility: bun         # 可选：运行环境要求
always: false              # 可选：是否自动加载完整内容（默认 false）
allowed-tools:             # 可选：预批准工具列表
  - read_file
  - exec
license: MIT               # 可选：许可证
metadata:                  # 可选：元数据
  emoji: ⏰
  requires:
    - bun
---

# 技能内容

技能的详细说明和使用方法...
```

### Frontmatter 字段说明

| 字段 | 必填 | 类型 | 说明 |
|------|------|------|------|
| name | 是 | string | 技能名称，格式：`^[a-z0-9]+(-[a-z0-9]+)*$` |
| description | 是 | string | 技能描述，用于触发匹配 |
| dependencies | 否 | string[] | 依赖包列表 |
| compatibility | 否 | string | 环境兼容性要求 |
| always | 否 | boolean | 是否自动加载完整内容 |
| allowed-tools | 否 | string[] | 预批准工具列表，无需用户确认 |
| license | 否 | string | 许可证 |
| metadata | 否 | object | 自定义元数据 |

## 内置技能

### time 技能

提供时间相关功能：

- 时间格式转换
- 时区处理
- 时间差计算

### sysinfo 技能

提供系统信息：

- CPU 使用率（实时）
- 内存状态
- 磁盘空间
- 网络状态
- 进程信息

## 创建技能

1. 创建目录: `skills/my-skill/`
2. 创建 SKILL.md 文件
3. 创建脚本目录: `skills/my-skill/scripts/`
4. 添加技能内容

```markdown
---
name: my-skill
description: 我的自定义技能
dependencies:
  - bun>=1.0
---

# 使用方法

这个技能用于...
```
