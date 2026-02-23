# 扩展概述

## 扩展架构

Microbot 采用插件式扩展架构，接口在 Types，实现在 Extensions。

```
packages/types/           # 接口定义
packages/extension-system/  # 扩展发现、加载、热重载
extensions/               # 实现
```

## 扩展类型

| 类型 | 位置 | 说明 |
|------|------|------|
| tool | `extensions/tool/` | 工具扩展（文件系统、Shell、Web 等） |
| channel | `extensions/channel/` | 通道扩展（CLI、飞书等） |
| skill | `extensions/skills/` | 技能扩展（time、sysinfo 等） |
| agent | - | Agent 扩展 |
| workflow | - | 工作流扩展 |
| command | - | 命令扩展 |
| mcp-client | - | MCP 客户端 |
| mcp-server | - | MCP 服务端 |

## 扩展机制

- **注册表模式**: 动态注册工具、技能
- **事件系统**: 通过 EventBus 解耦
- **依赖注入**: 通过 Container 获取实例
- **热重载**: 开发模式下支持文件变更自动重载

## 清单文件

扩展通过清单文件描述：

```yaml
# extension.yaml
id: my-extension
name: My Extension
version: 1.0.0
type: tool
description: 扩展描述
main: index.ts
dependencies:
  - bun>=1.0
```

支持的清单文件名（按优先级）：
- `extension.yaml`
- `extension.yml`
- `extension.json`
- `package.json`（需包含 `microbot` 字段）
