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

interface CpuTimes {
  idle: number;
  total: number;
}

/**
 * 获取当前 CPU 时间快照
 */
function getCpuTimes(): CpuTimes {
  const cpusData = cpus();
  let totalIdle = 0, totalTick = 0;
  
  for (const cpu of cpusData) {
    for (const type in cpu.times) {
      totalTick += cpu.times[type as keyof typeof cpu.times];
    }
    totalIdle += cpu.times.idle;
  }
  
  return { idle: totalIdle, total: totalTick };
}

/**
 * 获取实时 CPU 使用率
 * 通过两次采样计算差值得到真实使用率
 */
export async function getCpuUsage(intervalMs = 100): Promise<number> {
  const start = getCpuTimes();
  await new Promise(resolve => setTimeout(resolve, intervalMs));
  const end = getCpuTimes();
  
  const idleDiff = end.idle - start.idle;
  const totalDiff = end.total - start.total;
  
  if (totalDiff === 0) return 0;
  return ((totalDiff - idleDiff) / totalDiff) * 100;
}

/**
 * 获取 CPU 信息（包含实时使用率）
 */
export async function getCpuInfo(): Promise<CpuInfo> {
  const cpusData = cpus();
  const model = cpusData[0]?.model || 'Unknown';
  const usage = await getCpuUsage();
  
  return {
    cores: cpusData.length,
    model: model.trim(),
    usage: `${usage.toFixed(1)}%`,
    loadavg: loadavg()
  };
}

/**
 * 同步获取 CPU 信息（使用启动至今的平均值）
 * 仅用于不需要实时数据的场景
 */
export function getCpuInfoSync(): CpuInfo {
  const cpusData = cpus();
  const model = cpusData[0]?.model || 'Unknown';

  let totalIdle = 0, totalTick = 0;
  for (const cpu of cpusData) {
    for (const type in cpu.times) {
      totalTick += cpu.times[type as keyof typeof cpu.times];
    }
    totalIdle += cpu.times.idle;
  }
  const usage = ((totalTick - totalIdle) / totalTick * 100).toFixed(1);

  return {
    cores: cpusData.length,
    model: model.trim(),
    usage: `${usage}%`,
    loadavg: loadavg()
  };
}