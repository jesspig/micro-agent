/**
 * CPU 信息模块
 */
import { cpus, loadavg } from 'os';

export interface CpuInfo {
  cores: number;
  model: string;
  usage: string;
  loadavg: number[];
}

export function getCpuInfo(): CpuInfo {
  const cpusData = cpus();
  const model = cpusData[0]?.model || 'Unknown';
  
  // 计算使用率
  let totalIdle = 0, totalTick = 0;
  cpusData.forEach(cpu => {
    for (const type in cpu.times) {
      totalTick += cpu.times[type as keyof typeof cpu.times];
    }
    totalIdle += cpu.times.idle;
  });
  const usage = ((totalTick - totalIdle) / totalTick * 100).toFixed(1);
  
  return {
    cores: cpusData.length,
    model: model.trim(),
    usage: `${usage}%`,
    loadavg: loadavg()
  };
}

if (require.main === module) {
  console.log(JSON.stringify(getCpuInfo(), null, 2));
}
