# 扩展概述

## 扩展架构

Microbot 采用插件式扩展架构，接口在 Core，实现在 Extensions。

```
packages/core/src/    # 接口定义
extensions/          # 实现
```

## 扩展类型

| 类型 | 位置 | 说明 |
|------|------|------|
| Tool | `extensions/tool/` | 工具扩展 |
| Skill | `extensions/skill/` | 技能扩展 |
| Channel | `extensions/channel/` | 通道扩展 |

## 扩展机制

- **注册表模式**: 动态注册工具、技能
- **事件系统**: 通过 EventBus 解耦
- **依赖注入**: 通过 Container 获取实例
