/**
 * 共享工具函数
 */

/**
 * 格式化字节为人类可读格式
 */
export function formatBytes(bytes: number): string {
  const gb = bytes / 1024 / 1024 / 1024;
  return gb >= 1 ? `${gb.toFixed(2)} GB` : `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

/**
 * 格式化运行时间
 */
export function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  
  let result = '';
  if (days > 0) result += `${days} 天 `;
  if (hours > 0) result += `${hours} 小时 `;
  result += `${mins} 分钟`;
  return result;
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

/**
 * 输出数据
 */
export function output(data: unknown, isJson: boolean): void {
  if (isJson) {
    console.log(JSON.stringify(data, null, 2));
  } else {
    if (typeof data === 'object' && data !== null) {
      for (const [key, value] of Object.entries(data)) {
        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
          console.log(`${key}:`);
          for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
            console.log(`  ${k}: ${v}`);
          }
        } else if (Array.isArray(value)) {
          console.log(`${key}:`);
          value.forEach((item, i) => {
            if (typeof item === 'object' && item !== null) {
              console.log(`  [${i}] ${JSON.stringify(item)}`);
            } else {
              console.log(`  [${i}] ${item}`);
            }
          });
        } else {
          console.log(`${key}: ${value}`);
        }
      }
    } else {
      console.log(data);
    }
  }
}
