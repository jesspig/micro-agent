/**
 * 时区转换模块
 */
import { formatTime } from './format';

/**
 * 验证时区是否有效
 */
export function isValidTimezone(tz: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/**
 * 获取指定时区的时间
 */
export function getTimezoneTime(timezone: string, format: string = 'YYYY-MM-DD HH:mm:ss'): string {
  if (!isValidTimezone(timezone)) {
    return `无效时区: ${timezone}`;
  }
  return formatTime(new Date(), format, timezone);
}

/**
 * 获取常用时区列表
 */
export function getCommonTimezones(): Record<string, string> {
  const now = new Date();
  const timezones = [
    'Asia/Shanghai',
    'Asia/Tokyo',
    'Asia/Seoul',
    'America/New_York',
    'America/Los_Angeles',
    'Europe/London',
    'Europe/Paris',
    'UTC'
  ];
  
  const result: Record<string, string> = {};
  for (const tz of timezones) {
    result[tz] = getTimezoneTime(tz);
  }
  return result;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const tzArg = args.find(a => a.startsWith('--timezone='))?.split('=')[1] || args[args.indexOf('--timezone') + 1];
  
  if (tzArg) {
    console.log(getTimezoneTime(tzArg));
  } else {
    console.log(JSON.stringify(getCommonTimezones(), null, 2));
  }
}
