/**
 * 时间戳转换模块
 */
import { formatTime } from './format';

/**
 * 时间戳转日期
 */
export function timestampToDate(ts: number | string): string {
  const timestamp = typeof ts === 'string' ? parseInt(ts) : ts;
  if (isNaN(timestamp)) return '无效时间戳';
  
  // 判断是秒还是毫秒
  const date = timestamp < 1e12 ? new Date(timestamp * 1000) : new Date(timestamp);
  return formatTime(date, 'YYYY-MM-DD HH:mm:ss');
}

/**
 * 获取当前时间戳
 */
export function getCurrentUnix(): number {
  return Math.floor(Date.now() / 1000);
}

if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.includes('--unix')) {
    console.log('当前时间戳:', getCurrentUnix());
  } else {
    const tsIndex = args.indexOf('--timestamp');
    const tsArg = tsIndex >= 0 ? args[tsIndex + 1] : args.find(a => a.startsWith('--timestamp='))?.split('=')[1];
    if (tsArg) {
      console.log(timestampToDate(Number(tsArg)));
    } else {
      console.log('当前时间戳:', getCurrentUnix());
    }
  }
}
