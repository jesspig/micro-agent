# 系统信息工具参考

## 完整命令行选项

```
用法: node sysinfo.js [选项]

选项:
  --type <类型>      信息类型: cpu|mem|disk|network|process|sys|all
  --json             JSON 格式输出
  --watch            监控模式（持续输出）
  --interval <秒>    监控间隔（默认 5 秒）
```

## 信息类型详解

### CPU (cpu)
```json
{
  "cores": 8,
  "model": "AMD Ryzen 7 5800X",
  "usage": "35.2%",
  "loadavg": [1.5, 1.2, 0.9]
}
```

### 内存 (mem)
```json
{
  "total": "32.00 GB",
  "used": "16.50 GB",
  "free": "15.50 GB",
  "usage": "51.6%"
}
```

### 磁盘 (disk)
```json
[
  {
    "drive": "C:",
    "total": "500.00 GB",
    "used": "320.50 GB",
    "free": "179.50 GB",
    "usage": "64.1%"
  }
]
```

### 网络 (network)
```json
[
  {
    "interface": "以太网",
    "ip": "192.168.1.100",
    "mac": "00:1A:2B:3C:4D:5E"
  }
]
```

### 系统 (sys)
```json
{
  "platform": "win32",
  "arch": "x64",
  "hostname": "DESKTOP-ABC123",
  "uptime": "5 天 12 小时 30 分钟",
  "type": "Windows_NT",
  "release": "10.0.26200"
}
```

## 平台特定命令

### Windows PowerShell

```powershell
# CPU 信息
Get-CimInstance Win32_Processor | Select-Object Name, NumberOfCores
Get-Counter '\Processor(_Total)\% Processor Time'

# 内存信息
Get-CimInstance Win32_OperatingSystem | 
  Select-Object TotalVisibleMemorySize, FreePhysicalMemory

# 磁盘信息
Get-CimInstance Win32_LogicalDisk | 
  Select-Object DeviceID, Size, FreeSpace

# 网络信息
Get-NetIPAddress -AddressFamily IPv4 | 
  Where-Object { $_.InterfaceAlias -notlike "*Loopback*" }

# 进程信息
Get-Process | Sort-Object WorkingSet -Descending | 
  Select-Object -First 10 Name, Id, CPU, WorkingSet

# 系统信息
Get-ComputerInfo | Select-Object OsName, WindowsVersion, CsName
```

### Linux/macOS Bash

```bash
# CPU 信息
lscpu | grep -E 'Model name|CPU\(s\)'
cat /proc/loadavg  # Linux
sysctl -n hw.ncpu  # macOS

# 内存信息
free -h            # Linux
vm_stat            # macOS

# 磁盘信息
df -h

# 网络信息
ip addr show       # Linux
ifconfig           # macOS

# 进程信息
ps aux --sort=-%mem | head -10
top -b -n 1 | head -20

# 系统信息
uname -a
uptime
```

## 使用示例

```bash
# 完整系统信息
$ node sysinfo.js

# JSON 输出（便于解析）
$ node sysinfo.js --json

# 仅 CPU 信息
$ node sysinfo.js --type cpu

# 仅内存信息
$ node sysinfo.js --type mem

# 仅磁盘信息
$ node sysinfo.js --type disk

# 进程 Top 10
$ node sysinfo.js --type process
```

## 注意事项

- Windows 上 CPU 负载不可用（loadavg 返回 [0, 0, 0]）
- 某些信息需要管理员/root 权限
- 网络信息可能显示多个接口
- 进程信息格式因平台而异