---
name: time
description: 时间处理工具 - 获取时间、时区转换、时间差计算、时间戳转换
dependencies:
  - bun>=1.0
compatibility: bun
always: true
allowed-tools: []
---

# 时间处理工具

多功能时间工具，支持时区转换、时间差计算、时间戳转换等。

**脚本目录: `<skill-dir>/scripts/`**

## 目录结构

```
time/
├── SKILL.md
└── scripts/
    ├── index.ts     # 主入口，路由到各子模块
    ├── shared.ts   # 共享常量和工具函数
    ├── format.ts   # 时间格式化
    ├── diff.ts     # 时间差计算
    ├── timestamp.ts # 时间戳转换
    └── timezone.ts # 时区转换
```

## 执行方式

```bash
# 主入口（推荐）
bun <skill-dir>/scripts/index.ts
bun <skill-dir>/scripts/index.ts --timezone Asia/Tokyo
bun <skill-dir>/scripts/index.ts --format "YYYY年MM月DD日 dddd"
bun <skill-dir>/scripts/index.ts --diff "2026-12-31"
bun <skill-dir>/scripts/index.ts --timestamp 1700000000
bun <skill-dir>/scripts/index.ts --unix

# 直接运行子模块
bun <skill-dir>/scripts/format.ts
bun <skill-dir>/scripts/diff.ts --diff "2026-12-31"
bun <skill-dir>/scripts/timestamp.ts --timestamp 1700000000
bun <skill-dir>/scripts/timestamp.ts --unix
bun <skill-dir>/scripts/timezone.ts --timezone Asia/Tokyo
```

## 命令行选项

| 选项 | 说明 |
|------|------|
| `--timezone` | 指定时区 (如: Asia/Shanghai, America/New_York) |
| `--format` | 自定义格式 |
| `--diff` | 计算时间差 (日期字符串) |
| `--timestamp` | 时间戳转日期 |
| `--unix` | 输出当前 Unix 时间戳 |

## 格式占位符

| 占位符 | 说明 |
|--------|------|
| YYYY | 四位年份 |
| YY | 两位年份 |
| MM | 月份 (01-12) |
| DD | 日期 (01-31) |
| HH | 小时 (00-23) |
| mm | 分钟 (00-59) |
| ss | 秒 (00-59) |
| SSS | 毫秒 |
| dddd | 星期几 (星期一) |
| ddd | 星期几简写 (周一) |

## 常用时区

- `Asia/Shanghai` - 中国
- `Asia/Tokyo` - 日本
- `America/New_York` - 美国东部
- `America/Los_Angeles` - 美国西部
- `Europe/London` - 英国
- `Europe/Paris` - 法国

## 输出示例

```
系统时间: 2026-02-18 15:30:45
UTC 时间: 2026-02-18 07:30:45
```