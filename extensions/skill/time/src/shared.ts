/**
 * 时间工具 - 共享常量和工具函数
 */

export const WEEKDAYS = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
export const WEEKDAYS_SHORT = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

/**
 * 数字补零
 */
export function pad(n: number, len = 2): string {
  return String(n).padStart(len, '0');
}

/**
 * 解析命令行参数
 */
export function parseArgs(): Record<string, string | boolean> {
  const args = process.argv.slice(2);
  const result: Record<string, string | boolean> = {};
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
