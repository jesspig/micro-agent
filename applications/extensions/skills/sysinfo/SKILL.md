---
name: sysinfo
description: 系统信息工具 - 获取 CPU/内存/磁盘/网络/进程等系统信息
dependencies:
  - bun>=1.0
compatibility: bun
always: true
allowed-tools: []
---

# 系统信息工具

多功能系统监控工具，支持获取各类系统资源信息。

**脚本目录: `<skill-dir>/scripts/`**

## 目录结构

```
sysinfo/
├── SKILL.md
└── scripts/
    ├── index.ts     # 主入口，路由到各子模块
    ├── shared.ts    # 共享工具函数
    ├── cpu.ts       # CPU 信息
    ├── mem.ts       # 内存信息
    ├── disk.ts      # 磁盘信息
    ├── network.ts   # 网络信息
    ├── process.ts   # 进程信息
    └── sys.ts       # 系统信息
```

## 执行方式

```bash
# 主入口（推荐）
bun <skill-dir>/scripts/index.ts
bun <skill-dir>/scripts/index.ts --type cpu
bun <skill-dir>/scripts/index.ts --type mem

# 直接运行子模块
bun <skill-dir>/scripts/cpu.ts
bun <skill-dir>/scripts/mem.ts
bun <skill-dir>/scripts/disk.ts
```

## 命令行选项

| 选项 | 说明 |
|------|------|
| `--type, -t` | 信息类型: cpu/mem/disk/network/process/sys/all |
| `--json, -j` | JSON 格式输出 |

## 输出示例

### CPU 信息
```
CPU:
  cores: 8
  model: AMD Ryzen 7 5800X
  usage: 35.2%
  loadavg: 1.5,1.2,0.9
```

### 内存信息
```
内存:
  total: 32.00 GB
  used: 16.50 GB
  free: 15.50 GB
  usage: 51.6%
```

### 磁盘信息
```
磁盘:
  [0] {"drive":"C:","total":"500.00 GB","used":"320.50 GB","free":"179.50 GB","usage":"64.1%"}
```