#!/usr/bin/env node
/**
 * 时间工具 - 多功能版本
 * 
 * 用法:
 *   node time.js                           # 当前时间
 *   node time.js --timezone Asia/Tokyo     # 指定时区
 *   node time.js --format "YYYY/MM/DD"     # 自定义格式
 *   node time.js --diff "2026-12-31"       # 计算时间差
 *   node time.js --timestamp 1700000000    # 时间戳转日期
 *   node time.js --unix                    # 当前时间戳
 */

const WEEKDAYS = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
const WEEKDAYS_SHORT = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

function pad(n, len = 2) {
  return String(n).padStart(len, '0');
}

function formatTime(date, format, timezone) {
  const options = timezone ? { timeZone: timezone } : {};
  const parts = new Intl.DateTimeFormat('zh-CN', {
    ...options,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    fractionalSecondDigits: 3
  }).formatToParts(date);

  const get = (type) => parts.find(p => p.type === type)?.value || '';

  let result = format
    .replace(/YYYY/g, get('year'))
    .replace(/YY/g, get('year').slice(-2))
    .replace(/MM/g, get('month'))
    .replace(/DD/g, get('day'))
    .replace(/HH/g, get('hour'))
    .replace(/mm/g, get('minute'))
    .replace(/ss/g, get('second'))
    .replace(/SSS/g, date.getMilliseconds().toString().padStart(3, '0'))
    .replace(/dddd/g, WEEKDAYS[date.getDay()])
    .replace(/ddd/g, WEEKDAYS_SHORT[date.getDay()])
    .replace(/A/g, date.getHours() >= 12 ? 'PM' : 'AM')
    .replace(/a/g, date.getHours() >= 12 ? 'pm' : 'am');

  // 12小时制
  const hour12 = ((date.getHours() + 11) % 12) + 1;
  result = result.replace(/hh/g, pad(hour12));

  return result;
}

function parseArgs() {
  const args = process.argv.slice(2);
  const result = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const key = args[i].slice(2);
      const value = args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true;
      if (value !== true) i++;
      result[key] = value;
    }
  }
  return result;
}

function timeDiff(targetDate) {
  const now = new Date();
  const target = new Date(targetDate);
  const diff = target - now;
  
  if (isNaN(diff)) {
    return '无效日期格式，请使用 YYYY-MM-DD 或 YYYY-MM-DD HH:mm:ss';
  }

  const absDiff = Math.abs(diff);
  const days = Math.floor(absDiff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((absDiff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((absDiff % (1000 * 60 * 60)) / (1000 * 60));

  const direction = diff > 0 ? '距离' : '已过去';
  const dateStr = formatTime(target, 'YYYY-MM-DD HH:mm:ss');
  
  let result = `${direction} ${dateStr}`;
  if (days > 0) result += ` 还有 ${days} 天`;
  if (hours > 0) result += ` ${hours} 小时`;
  if (minutes > 0 && days === 0) result += ` ${minutes} 分钟`;
  
  return result;
}

function timestampToDate(ts) {
  const timestamp = typeof ts === 'string' ? parseInt(ts) : ts;
  if (isNaN(timestamp)) return '无效时间戳';
  
  // 判断是秒还是毫秒
  const date = timestamp < 1e12 ? new Date(timestamp * 1000) : new Date(timestamp);
  return formatTime(date, 'YYYY-MM-DD HH:mm:ss');
}

// 主逻辑
const args = parseArgs();
const now = new Date();

if (args.unix) {
  // 当前时间戳
  console.log('当前时间戳:', Math.floor(now.getTime() / 1000));
} else if (args.timestamp) {
  // 时间戳转日期
  console.log(timestampToDate(args.timestamp));
} else if (args.diff) {
  // 计算时间差
  console.log(timeDiff(args.diff));
} else {
  // 获取时间
  const format = args.format || 'YYYY-MM-DD HH:mm:ss';
  const timezone = args.timezone;
  
  console.log('系统时间:', formatTime(now, format));
  if (!timezone && !args.format) {
    console.log('UTC 时间:', formatTime(now, 'YYYY-MM-DD HH:mm:ss', 'UTC'));
  }
  if (timezone) {
    try {
      console.log(`${timezone}:`, formatTime(now, format, timezone));
    } catch (e) {
      console.log('无效时区:', timezone);
      console.log('常用时区: Asia/Shanghai, Asia/Tokyo, America/New_York, Europe/London');
    }
  }
}