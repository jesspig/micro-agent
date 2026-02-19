/**
 * 时间格式化模块
 */
import { WEEKDAYS, WEEKDAYS_SHORT, pad } from './shared';

export interface FormatOptions {
  format?: string;
  timezone?: string;
}

/**
 * 格式化时间
 */
export function formatTime(date: Date, format: string, timezone?: string): string {
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

  const get = (type: string) => parts.find(p => p.type === type)?.value || '';

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

if (require.main === module) {
  const now = new Date();
  console.log(formatTime(now, 'YYYY-MM-DD HH:mm:ss'));
}
