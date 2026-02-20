#!/usr/bin/env bun
/**
 * 时间工具 - 主入口
 * 
 * 用法:
 *   bun time.ts                    # 当前时间
 *   bun time.ts --timezone Asia/Tokyo     # 指定时区
 *   bun time.ts --format "YYYY/MM/DD"   # 自定义格式
 *   bun time.ts --diff "2026-12-31"    # 计算时间差
 *   bun time.ts --timestamp 1700000000   # 时间戳转日期
 *   bun time.ts --unix                   # 当前时间戳
 */
import { parseArgs } from './shared';
import { formatTime } from './format';
import { timeDiff } from './diff';
import { timestampToDate, getCurrentUnix } from './timestamp';
import { getTimezoneTime } from './timezone';

function main() {
  const args = parseArgs();
  
  if (args.unix === true) {
    // 当前时间戳
    console.log('当前时间戳:', getCurrentUnix());
    return;
  }
  
  if (args.timestamp) {
    // 时间戳转日期
    console.log(timestampToDate(Number(args.timestamp)));
    return;
  }
  
  if (args.diff) {
    // 计算时间差
    console.log(timeDiff(String(args.diff)));
    return;
  }
  
  if (args.timezone) {
    // 获取指定时区时间
    const format = String(args.format || 'YYYY-MM-DD HH:mm:ss');
    console.log(getTimezoneTime(String(args.timezone), format));
    return;
  }
  
  // 获取时间
  const format = String(args.format || 'YYYY-MM-DD HH:mm:ss');
  const now = new Date();
  
  console.log('系统时间:', formatTime(now, format));
  console.log('UTC 时间:', formatTime(now, 'YYYY-MM-DD HH:mm:ss', 'UTC'));
}

main();
