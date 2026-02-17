---
name: sysinfo
description: 系统信息工具 - 获取 CPU/内存/磁盘/网络/进程等系统信息
compatibility: Requires node/bun with os module, or system commands
always: true
allowed-tools: []
---

# 系统信息工具

多功能系统监控工具，支持获取各类系统资源信息。

## 功能概览

| 类型 | 说明 | 内容 |
|------|------|------|
| cpu | CPU 信息 | 核心数、型号、使用率、负载 |
| mem | 内存信息 | 总量、已用、可用、使用率 |
| disk | 磁盘信息 | 各分区容量、使用情况 |
| network | 网络信息 | IP 地址、网络接口 |
| process | 进程信息 | 内存占用 Top 10 进程 |
| sys | 系统信息 | 平台、架构、主机名、运行时间 |

## 脚本执行

### Node.js / Bun（推荐）
```bash
# 完整系统信息
node scripts/sysinfo.js

# 指定信息类型
node scripts/sysinfo.js --type cpu
node scripts/sysinfo.js --type mem
node scripts/sysinfo.js --type disk
node scripts/sysinfo.js --type network
node scripts/sysinfo.js --type process

# JSON 格式输出
node scripts/sysinfo.js --json
node scripts/sysinfo.js --type cpu --json
```

### Python（需安装 psutil）
```bash
pip install psutil
python scripts/sysinfo.py --type cpu
python scripts/sysinfo.py --json
```

### Shell (Linux/macOS)
```bash
./scripts/sysinfo.sh
./scripts/sysinfo.sh --type cpu
./scripts/sysinfo.sh --type mem
```

### PowerShell (Windows)
```powershell
./scripts/sysinfo.ps1
./scripts/sysinfo.ps1 -Type cpu
./scripts/sysinfo.ps1 -Json
```

### CMD (Windows)
```cmd
scripts\sysinfo.cmd        :: 完整信息
scripts\sysinfo.cmd cpu    :: CPU 信息
scripts\sysinfo.cmd mem    :: 内存信息
scripts\sysinfo.cmd disk   :: 磁盘信息
```

## 命令行选项

| 选项 | 说明 |
|------|------|
| `--type, -t` | 信息类型: cpu/mem/disk/network/process/sys/all |
| `--json, -j` | JSON 格式输出 |

## 输出示例

### CPU 信息
```
核心数: 8
型号: AMD Ryzen 7 5800X
使用率: 35.2%
负载: 1.5 1.2 0.9
```

### 内存信息
```
总量: 32.00 GB
已用: 16.50 GB
可用: 15.50 GB
使用率: 51.6%
```

### 磁盘信息
```
C:: 总量 500.00 GB, 已用 320.50 GB, 使用率 64.1%
D:: 总量 1000.00 GB, 已用 750.00 GB, 使用率 75.0%
```

## 参考文档

详细输出格式和平台特定命令请参阅 `references/REFERENCE.md`。