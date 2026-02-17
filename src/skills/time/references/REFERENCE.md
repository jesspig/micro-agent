# 时间工具参考

## 完整命令行选项

```
用法: node time.js [选项]

选项:
  --timezone <tz>     指定时区 (如 Asia/Tokyo)
  --format <fmt>      自定义格式 (如 YYYY/MM/DD HH:mm:ss)
  --diff <date>       计算时间差 (如 2026-12-31 或 "2026-12-31 23:59:59")
  --timestamp <ts>    时间戳转日期 (秒或毫秒)
  --unix              获取当前 Unix 时间戳
```

## 格式说明符完整列表

| 符号 | 含义 | 示例输出 |
|------|------|----------|
| YYYY | 四位年份 | 2026 |
| YY | 两位年份 | 26 |
| MM | 两位月份 | 01-12 |
| M | 月份 | 1-12 |
| DD | 两位日期 | 01-31 |
| D | 日期 | 1-31 |
| HH | 24小时制 | 00-23 |
| H | 24小时制 | 0-23 |
| hh | 12小时制 | 01-12 |
| h | 12小时制 | 1-12 |
| mm | 分钟 | 00-59 |
| m | 分钟 | 0-59 |
| ss | 秒 | 00-59 |
| s | 秒 | 0-59 |
| SSS | 毫秒 | 000-999 |
| dddd | 星期全称 | 星期一 |
| ddd | 星期简称 | 周一 |
| A | AM/PM 大写 | AM/PM |
| a | am/pm 小写 | am/pm |

## 时区列表

### 亚洲
| 城市 | 时区标识 |
|------|----------|
| 北京 | Asia/Shanghai |
| 上海 | Asia/Shanghai |
| 香港 | Asia/Hong_Kong |
| 台北 | Asia/Taipei |
| 东京 | Asia/Tokyo |
| 首尔 | Asia/Seoul |
| 新加坡 | Asia/Singapore |
| 曼谷 | Asia/Bangkok |
| 迪拜 | Asia/Dubai |
| 孟买 | Asia/Kolkata |

### 欧洲
| 城市 | 时区标识 |
|------|----------|
| 伦敦 | Europe/London |
| 巴黎 | Europe/Paris |
| 柏林 | Europe/Berlin |
| 莫斯科 | Europe/Moscow |

### 美洲
| 城市 | 时区标识 |
|------|----------|
| 纽约 | America/New_York |
| 洛杉矶 | America/Los_Angeles |
| 芝加哥 | America/Chicago |
| 多伦多 | America/Toronto |
| 温哥华 | America/Vancouver |
| 圣保罗 | America/Sao_Paulo |

### 大洋洲
| 城市 | 时区标识 |
|------|----------|
| 悉尼 | Australia/Sydney |
| 墨尔本 | Australia/Melbourne |
| 奥克兰 | Pacific/Auckland |

## 时间差计算

支持多种日期格式：
- `2026-12-31`
- `2026-12-31 23:59:59`
- `2026/12/31`
- 下周一、下个月、明年 等相对日期（需 Agent 解析）

## 示例

```bash
# 基本用法
$ node time.js
系统时间: 2026-02-17 16:30:45
UTC 时间: 2026-02-17 08:30:45

# 指定时区
$ node time.js --timezone Asia/Tokyo
系统时间: 2026-02-17 17:30:45
Asia/Tokyo: 2026-02-17 17:30:45

# 自定义格式
$ node time.js --format "YYYY年MM月DD日 dddd"
系统时间: 2026年02月17日 星期一

# 时间戳
$ node time.js --unix
当前时间戳: 1739782245

# 时间戳转日期
$ node time.js --timestamp 1700000000
2023-11-14 22:13:20

# 计算时间差
$ node time.js --diff "2026-12-31"
距离 2026-12-31 00:00:00 还有 317 天
```