# 技能扩展

## 概述

技能扩展位于 `skills/`，每个技能是一个包含 SKILL.md 的目录。

## SKILL.md 格式

```yaml
---
name: skill-name
description: 技能描述
dependencies:        # 可选，依赖列表
  - bun>=1.0
compatibility: bun   # 可选，运行环境
always: false        # 可选，是否始终加载
allowed-tools:       # 可选，允许使用的工具
  - read_file
---

# 技能内容

技能的详细说明和使用方法...
```

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
