/**
 * 系统信息工具 - 主入口
 * 
 * 用法:
 *   bun src/index.ts              # 完整系统信息
 *   bun src/index.ts --type cpu   # 仅 CPU 信息（实时）
 *   bun src/index.ts --type mem   # 仅内存信息
 *   bun src/index.ts --type disk  # 仅磁盘信息
 *   bun src/index.ts --type network # 网络信息
 *   bun src/index.ts --type process # 进程信息
 *   bun src/index.ts --type sys   # 系统信息
 *   bun src/index.ts --json      # JSON 输出
 */
import { parseArgs, output } from './shared';
import { getCpuInfo } from './cpu';
import { getMemInfo } from './mem';
import { getDiskInfo } from './disk';
import { getNetworkInfo } from './network';
import { getProcessInfo, getProcessInfoText } from './process';
import { getSysInfo } from './sys';

async function main(): Promise<void> {
  const args = parseArgs();
  const type = (args.type as string) || 'all';
  const isJson = args.json === true;

  switch (type) {
    case 'cpu':
      output({ CPU: await getCpuInfo() }, isJson);
      break;
    case 'mem':
      output({ 内存: getMemInfo() }, isJson);
      break;
    case 'disk':
      output({ 磁盘: getDiskInfo() }, isJson);
      break;
    case 'network':
      output({ 网络: getNetworkInfo() }, isJson);
      break;
    case 'process':
      output({ 进程: getProcessInfo() }, isJson);
      break;
    case 'sys':
      output({ 系统: getSysInfo() }, isJson);
      break;
    default:
      output({
        系统: getSysInfo(),
        CPU: await getCpuInfo(),
        内存: getMemInfo(),
        磁盘: getDiskInfo(),
        网络: getNetworkInfo()
      }, isJson);
  }
}

main().catch(console.error);
