/**
 * 磁盘信息模块
 */
import { platform } from 'os';
import { execSync } from 'child_process';
import { formatBytes } from './shared';

export interface DiskInfo {
  drive?: string;
  filesystem?: string;
  total: string;
  used: string;
  free: string;
  usage: string;
  mount?: string;
  error?: string;
}

export function getDiskInfo(): DiskInfo[] {
  const plat = platform();

  try {
    if (plat === 'win32') {
      const output = execSync(
        'powershell -Command "Get-PSDrive -PSProvider FileSystem | Select-Object Name, Used, Free | ConvertTo-Csv -NoTypeInformation"',
        { encoding: 'utf8' }
      ).trim();
      const lines = output.split('\n').slice(1).filter(Boolean);

      return lines.map(line => {
        const [name, usedStr, freeStr] = line.replace(/"/g, '').split(',');
        const used = parseInt(usedStr) || 0;
        const free = parseInt(freeStr) || 0;
        const total = used + free;
        return {
          drive: name + ':',
          total: formatBytes(total),
          used: formatBytes(used),
          free: formatBytes(free),
          usage: total ? `${((used / total) * 100).toFixed(1)}%` : 'N/A'
        };
      });
    }

    const output = execSync("df -h | awk 'NR>1 {print $1,$2,$3,$4,$5,$6}'", { encoding: 'utf8' }).trim();
    const lines = output.split('\n');

    return lines.slice(0, 10).map(line => {
      const [filesystem, size, used, avail, usage, mount] = line.split(/\s+/);
      return { filesystem, total: size, used, free: avail, usage, mount };
    });
  } catch {
    return [{ total: '', used: '', free: '', usage: '', error: '无法获取磁盘信息' }];
  }
}