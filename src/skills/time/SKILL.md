---
name: time
description: 时间工具 - 获取时间、格式化时间、计算时间差、时区转换、时间戳转换
compatibility: Requires node/bun, python, or shell runtime
always: true
allowed-tools: []
---

# 时间工具

多功能时间处理工具，支持各种时间相关操作。

## 功能概览

| 功能 | 说明 | 示例 |
|------|------|------|
| 获取当前时间 | 系统/UTC/指定时区时间 | "现在几点"、"东京时间" |
| 自定义格式 | 按指定格式输出 | "时间格式 YYYY/MM/DD" |
| 时间差计算 | 计算到目标时间差 | "今天到年底还有多久" |
| 时间戳转换 | Unix 时间戳与日期互转 | "时间戳 1700000000" |

## 脚本执行

### Node.js / Bun（推荐）
```bash
# 当前时间
node scripts/time.js

# 指定时区
node scripts/time.js --timezone Asia/Tokyo

# 自定义格式
node scripts/time.js --format "YYYY年MM月DD日 dddd"

# 计算时间差
node scripts/time.js --diff "2026-12-31"

# 时间戳转日期
node scripts/time.js --timestamp 1700000000

# 获取当前时间戳
node scripts/time.js --unix
```

### Python
```bash
python scripts/time.py --timezone Asia/Tokyo
python scripts/time.py --format "%Y/%m/%d"
python scripts/time.py --diff "2026-12-31"
```

### Shell (Linux/macOS)
```bash
./scripts/time.sh --timezone Asia/Tokyo
./scripts/time.sh --diff "2026-12-31"
```

### PowerShell (Windows)
```powershell
./scripts/time.ps1 -Timezone "Tokyo Standard Time"
./scripts/time.ps1 -Diff "2026-12-31"
```

### CMD (Windows)
```cmd
scripts\time.cmd          :: 当前时间
scripts\time.cmd unix     :: 当前时间戳
scripts\time.cmd timestamp 1700000000
```

## 命令行选项

| 选项 | 说明 |
|------|------|
| `--timezone, -tz` | 指定时区 (如 Asia/Tokyo) |
| `--format, -f` | 自定义格式 |
| `--diff, -d` | 计算时间差 |
| `--timestamp, -ts` | 时间戳转日期 |
| `--unix, -u` | 获取当前 Unix 时间戳 |

## 格式说明符

| 符号 | 含义 | 示例 |
|------|------|------|
| YYYY | 四位年份 | 2026 |
| MM | 两位月份 | 01-12 |
| DD | 两位日期 | 01-31 |
| HH | 24小时制 | 00-23 |
| mm | 分钟 | 00-59 |
| ss | 秒 | 00-59 |
| SSS | 毫秒 | 000-999 |
| dddd | 星期全称 | 星期一 |
| ddd | 星期简称 | 周一 |
| A/a | AM/PM | AM/am |

## 常用时区

| 城市 | 时区标识 |
|------|----------|
| 北京/上海 | Asia/Shanghai |
| 东京 | Asia/Tokyo |
| 纽约 | America/New_York |
| 伦敦 | Europe/London |
| 悉尼 | Australia/Sydney |

## 参考文档

详细格式说明符和时区列表请参阅 `references/REFERENCE.md`。