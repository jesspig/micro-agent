/**
 * 系统信息模块
 */
import { platform, arch, hostname, uptime, type, release } from 'os';
import { formatUptime } from './shared';

export interface SysInfo {
  platform: string;
  arch: string;
  hostname: string;
  uptime: string;
  type: string;
  release: string;
}

export function getSysInfo(): SysInfo {
  return {
    platform: platform(),
    arch: arch(),
    hostname: hostname(),
    uptime: formatUptime(uptime()),
    type: type(),
    release: release()
  };
}