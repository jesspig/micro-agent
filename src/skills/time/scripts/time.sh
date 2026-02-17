#!/bin/bash
# 时间工具 - Bash 多功能版本
# 用法: ./time.sh [--timezone TZ] [--format FMT] [--diff DATE] [--timestamp TS] [--unix]

WEEKDAYS=("星期日" "星期一" "星期二" "星期三" "星期四" "星期五" "星期六")
WEEKDAYS_SHORT=("周日" "周一" "周二" "周三" "周四" "周五" "周六")

# 默认值
TIMEZONE=""
FORMAT="%Y-%m-%d %H:%M:%S"
DIFF=""
TIMESTAMP=""
UNIX=false

# 解析参数
while [[ $# -gt 0 ]]; do
    case $1 in
        --timezone|-tz)
            TIMEZONE="$2"
            shift 2
            ;;
        --format|-f)
            FORMAT="$2"
            shift 2
            ;;
        --diff|-d)
            DIFF="$2"
            shift 2
            ;;
        --timestamp|-ts)
            TIMESTAMP="$2"
            shift 2
            ;;
        --unix|-u)
            UNIX=true
            shift
            ;;
        *)
            shift
            ;;
    esac
done

# 当前时间戳
if [ "$UNIX" = true ]; then
    echo "当前时间戳: $(date +%s)"
    exit 0
fi

# 时间戳转日期
if [ -n "$TIMESTAMP" ]; then
    if [ "$TIMESTAMP" -lt 10000000000 ]; then
        # 秒
        date -d "@$TIMESTAMP" "+%Y-%m-%d %H:%M:%S" 2>/dev/null || date -r "$TIMESTAMP" "+%Y-%m-%d %H:%M:%S"
    else
        # 毫秒
        date -d "@$((TIMESTAMP/1000))" "+%Y-%m-%d %H:%M:%S" 2>/dev/null
    fi
    exit 0
fi

# 计算时间差
if [ -n "$DIFF" ]; then
    target=$(date -d "$DIFF" +%s 2>/dev/null || date -j -f "%Y-%m-%d" "$DIFF" +%s 2>/dev/null)
    if [ -z "$target" ]; then
        echo "无效日期格式，请使用 YYYY-MM-DD"
        exit 1
    fi
    
    now=$(date +%s)
    diff=$((target - now))
    abs_diff=${diff#-}
    
    days=$((abs_diff / 86400))
    hours=$(((abs_diff % 86400) / 3600))
    minutes=$(((abs_diff % 3600) / 60))
    
    if [ $diff -gt 0 ]; then
        echo -n "距离 $DIFF"
    else
        echo -n "$DIFF 已过去"
    fi
    
    [ $days -gt 0 ] && echo -n " 还有 $days 天"
    [ $hours -gt 0 ] && echo -n " $hours 小时"
    [ $minutes -gt 0 ] && [ $days -eq 0 ] && echo -n " $minutes 分钟"
    echo
    exit 0
fi

# 输出时间
echo "系统时间: $(date "+$FORMAT")"
echo "UTC 时间: $(date -u "+$FORMAT")"

if [ -n "$TIMEZONE" ]; then
    if TZ="$TIMEZONE" date >/dev/null 2>&1; then
        echo "$TIMEZONE: $(TZ="$TIMEZONE" date "+$FORMAT")"
    else
        echo "无效时区: $TIMEZONE"
        echo "常用时区: Asia/Shanghai, Asia/Tokyo, America/New_York, Europe/London"
    fi
fi