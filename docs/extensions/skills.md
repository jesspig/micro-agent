# 技能扩展

## 概述

技能扩展位于 `extensions/skill/`，每个技能是一个包含 SKILL.md 的目录。

## 内置技能

### time 技能

提供时间相关功能：

- 时间格式转换
- 时区处理
- 时间差计算

### sysinfo 技能

提供系统信息：

- CPU 使用率
- 内存状态
- 磁盘空间
- 网络状态

## 创建技能

1. 创建目录: `extensions/skill/my-skill/`
2. 创建 SKILL.md 文件
3. 添加技能内容

```markdown
---
name: my-skill
description: 我的自定义技能
always: false
allowed-tools:
  - read_file
---

# 使用方法

这个技能用于...
```
