/**
 * 网络信息模块
 */
import { networkInterfaces } from 'os';

export interface NetworkInfo {
  interface: string;
  ip: string;
  mac: string;
}

export function getNetworkInfo(): NetworkInfo[] {
  const interfaces = networkInterfaces();
  const result: NetworkInfo[] = [];

  for (const [name, addrs] of Object.entries(interfaces)) {
    const ipv4 = addrs?.find(a => a.family === 'IPv4' && !a.internal);
    if (ipv4) {
      result.push({
        interface: name,
        ip: ipv4.address,
        mac: ipv4.mac
      });
    }
  }

  return result;
}