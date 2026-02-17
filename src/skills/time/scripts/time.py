#!/usr/bin/env python3
"""
时间工具 - Python 多功能版本

用法:
    python time.py                           # 当前时间
    python time.py --timezone Asia/Tokyo     # 指定时区
    python time.py --format "%Y/%m/%d"       # 自定义格式
    python time.py --diff "2026-12-31"       # 计算时间差
    python time.py --timestamp 1700000000    # 时间戳转日期
    python time.py --unix                    # 当前时间戳
"""

import argparse
from datetime import datetime, timezone
import sys

try:
    from zoneinfo import ZoneInfo
except ImportError:
    try:
        from backports.zoneinfo import ZoneInfo
    except ImportError:
        ZoneInfo = None

WEEKDAYS = ['星期一', '星期二', '星期三', '星期四', '星期五', '星期六', '星期日']
WEEKDAYS_SHORT = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']

def format_time(dt, fmt, tz=None):
    """格式化时间"""
    if tz and ZoneInfo:
        dt = dt.astimezone(ZoneInfo(tz))
    elif tz:
        # 回退到 UTC
        dt = dt.astimezone(timezone.utc)
    
    # Python strftime 格式
    result = fmt
    result = result.replace('YYYY', '%Y')
    result = result.replace('YY', '%y')
    result = result.replace('MM', '%m')
    result = result.replace('DD', '%d')
    result = result.replace('HH', '%H')
    result = result.replace('mm', '%M')
    result = result.replace('ss', '%S')
    result = result.replace('SSS', f'{dt.microsecond // 1000:03d}')
    result = result.replace('dddd', WEEKDAYS[dt.weekday()])
    result = result.replace('ddd', WEEKDAYS_SHORT[dt.weekday()])
    result = result.replace('A', 'AM' if dt.hour < 12 else 'PM')
    result = result.replace('a', 'am' if dt.hour < 12 else 'pm')
    
    return dt.strftime(result)

def time_diff(target_str):
    """计算时间差"""
    try:
        target = datetime.fromisoformat(target_str.replace('Z', '+00:00'))
    except:
        try:
            target = datetime.strptime(target_str, '%Y-%m-%d')
        except:
            return '无效日期格式，请使用 YYYY-MM-DD 或 YYYY-MM-DD HH:mm:ss'
    
    now = datetime.now()
    diff = target - now
    
    abs_diff = abs(diff)
    days = abs_diff.days
    hours, remainder = divmod(abs_diff.seconds, 3600)
    minutes, _ = divmod(remainder, 60)
    
    direction = '距离' if diff.total_seconds() > 0 else '已过去'
    
    result = f"{direction} {target.strftime('%Y-%m-%d %H:%M:%S')}"
    if days > 0:
        result += f" 还有 {days} 天"
    if hours > 0:
        result += f" {hours} 小时"
    if minutes > 0 and days == 0:
        result += f" {minutes} 分钟"
    
    return result

def timestamp_to_date(ts):
    """时间戳转日期"""
    try:
        ts = int(ts)
        # 判断是秒还是毫秒
        if ts < 1e12:
            dt = datetime.fromtimestamp(ts)
        else:
            dt = datetime.fromtimestamp(ts / 1000)
        return dt.strftime('%Y-%m-%d %H:%M:%S')
    except:
        return '无效时间戳'

def main():
    parser = argparse.ArgumentParser(description='时间工具')
    parser.add_argument('--timezone', '-tz', help='指定时区')
    parser.add_argument('--format', '-f', default='YYYY-MM-DD HH:mm:ss', help='时间格式')
    parser.add_argument('--diff', '-d', help='计算时间差')
    parser.add_argument('--timestamp', '-ts', help='时间戳转日期')
    parser.add_argument('--unix', '-u', action='store_true', help='当前时间戳')
    
    args = parser.parse_args()
    
    if args.unix:
        print(f"当前时间戳: {int(datetime.now().timestamp())}")
    elif args.timestamp:
        print(timestamp_to_date(args.timestamp))
    elif args.diff:
        print(time_diff(args.diff))
    else:
        now = datetime.now()
        print(f"系统时间: {format_time(now, args.format)}")
        
        if not args.timezone and args.format == 'YYYY-MM-DD HH:mm:ss':
            print(f"UTC 时间: {format_time(now, args.format, 'UTC')}")
        
        if args.timezone:
            if ZoneInfo:
                try:
                    print(f"{args.timezone}: {format_time(now, args.format, args.timezone)}")
                except:
                    print(f"无效时区: {args.timezone}")
                    print("常用时区: Asia/Shanghai, Asia/Tokyo, America/New_York, Europe/London")
            else:
                print("警告: 需要安装 zoneinfo 支持 (Python 3.9+)")

if __name__ == '__main__':
    main()