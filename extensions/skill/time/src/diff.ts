/**
 * 时间差计算模块
 */
import { formatTime } from './format';

/**
 * 计算时间差
 */
export function timeDiff(targetDateStr: string): string {
  const now = new Date();
  const target = new Date(targetDateStr);
  const diff = target.getTime() - now.getTime();
  
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

if (require.main === module) {
  const args = process.argv.slice(2);
  const targetDate = args.find(a => !a.startsWith('--')) || '2026-12-31';
  console.log(timeDiff(targetDate));
}
