/**
 * 进程信息模块
 */
import { platform } from 'os';
import { execSync } from 'child_process';

export interface ProcessInfo {
  name: string;
  pid: number;
  cpu: number;
  memoryMB: number;
}

export function getProcessInfo(): ProcessInfo[] {
  const plat = platform();

  try {
    if (plat === 'win32') {
      const output = execSync(
        'powershell -Command "Get-Process | Sort-Object WorkingSet -Descending | Select-Object -First 10 Name, Id, CPU, @{N=\'MemoryMB\';E={[math]::Round($_.WorkingSet/1MB,2)}} | ConvertTo-Csv -NoTypeInformation"',
        { encoding: 'utf8' }
      ).trim();
      const lines = output.split('\n').slice(1).filter(Boolean);

      return lines.map(line => {
        const [name, pid, cpu, memoryMB] = line.replace(/"/g, '').split(',');
        return {
          name,
          pid: parseInt(pid) || 0,
          cpu: parseFloat(cpu) || 0,
          memoryMB: parseFloat(memoryMB) || 0
        };
      });
    }

    const output = execSync('ps aux --sort=-%mem | head -11', { encoding: 'utf8' }).trim();
    const lines = output.split('\n').slice(1);

    return lines.map(line => {
      const parts = line.split(/\s+/);
      return {
        name: parts[10] || parts[0],
        pid: parseInt(parts[1]) || 0,
        cpu: parseFloat(parts[2]) || 0,
        memoryMB: Math.round((parseFloat(parts[3]) || 0) * 1024 / 100 * 1024 / 10) // % to MB approximation
      };
    });
  } catch {
    return [];
  }
}

export function getProcessInfoText(): string {
  const processes = getProcessInfo();
  if (processes.length === 0) return '无法获取进程信息';

  const header = '进程名称                 PID       CPU(s)    内存(MB)';
  const separator = '-'.repeat(48);
  const lines = processes.map(p =>
    `${p.name.padEnd(20)} ${String(p.pid).padStart(8)} ${String(p.cpu.toFixed(1)).padStart(10)} ${String(p.memoryMB.toFixed(2)).padStart(10)}`
  );

  return [header, separator, ...lines].join('\n');
}