#!/usr/bin/env node
/**
 * 系统信息工具 - 多功能版本
 * 
 * 用法:
 *   node sysinfo.js                    # 完整系统信息
 *   node sysinfo.js --type cpu         # 仅 CPU 信息
 *   node sysinfo.js --type mem         # 仅内存信息
 *   node sysinfo.js --type disk        # 仅磁盘信息
 *   node sysinfo.js --type network     # 网络信息
 *   node sysinfo.js --type process     # 进程信息
 *   node sysinfo.js --json             # JSON 输出
 *   node sysinfo.js --watch --interval 5  # 监控模式
 */

const os = require('os');
const { execSync } = require('child_process');

function formatBytes(bytes) {
  const gb = bytes / 1024 / 1024 / 1024;
  return gb >= 1 ? `${gb.toFixed(2)} GB` : `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function getCpuInfo() {
  const cpus = os.cpus();
  const model = cpus[0]?.model || 'Unknown';
  
  // 计算使用率
  let totalIdle = 0, totalTick = 0;
  cpus.forEach(cpu => {
    for (let type in cpu.times) {
      totalTick += cpu.times[type];
    }
    totalIdle += cpu.times.idle;
  });
  const usage = ((totalTick - totalIdle) / totalTick * 100).toFixed(1);
  
  return {
    cores: cpus.length,
    model: model.trim(),
    usage: `${usage}%`,
    loadavg: os.loadavg()
  };
}

function getMemInfo() {
  const total = os.totalmem();
  const free = os.freemem();
  const used = total - free;
  
  return {
    total: formatBytes(total),
    used: formatBytes(used),
    free: formatBytes(free),
    usage: `${(used / total * 100).toFixed(1)}%`,
    totalBytes: total,
    usedBytes: used,
    freeBytes: free
  };
}

function getDiskInfo() {
  const platform = os.platform();
  
  try {
    if (platform === 'win32') {
      const output = execSync('wmic logicaldisk get size,freespace,caption /format:csv', 
        { encoding: 'utf8' }).trim();
      const lines = output.split('\n').slice(1).filter(Boolean);
      
      return lines.map(line => {
        const [_, caption, free, size] = line.split(',');
        if (!caption) return null;
        const total = parseInt(size) || 0;
        const freeSpace = parseInt(free) || 0;
        return {
          drive: caption,
          total: formatBytes(total),
          used: formatBytes(total - freeSpace),
          free: formatBytes(freeSpace),
          usage: total ? `${((total - freeSpace) / total * 100).toFixed(1)}%` : 'N/A'
        };
      }).filter(Boolean);
    } else {
      const output = execSync('df -h | awk \'NR>1 {print $1,$2,$3,$4,$5,$6}\'', 
        { encoding: 'utf8' }).trim();
      const lines = output.split('\n');
      
      return lines.slice(0, 10).map(line => {
        const [filesystem, size, used, avail, usage, mount] = line.split(/\s+/);
        return {
          filesystem,
          total: size,
          used,
          free: avail,
          usage,
          mount
        };
      });
    }
  } catch (e) {
    return { error: '无法获取磁盘信息' };
  }
}

function getNetworkInfo() {
  const interfaces = os.networkInterfaces();
  const result = [];
  
  for (const [name, addrs] of Object.entries(interfaces)) {
    const ipv4 = addrs.find(a => a.family === 'IPv4' && !a.internal);
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

function getProcessInfo() {
  const platform = os.platform();
  
  try {
    let output;
    if (platform === 'win32') {
      output = execSync('powershell "Get-Process | Sort-Object WorkingSet -Descending | Select-Object -First 10 Name, Id, @{N=\'CPU\';E={$_.CPU}}, @{N=\'Memory(MB)\';E={[math]::Round($_.WorkingSet/1MB,2)}}"', 
        { encoding: 'utf8' });
    } else {
      output = execSync('ps aux --sort=-%mem | head -11', { encoding: 'utf8' });
    }
    
    return output.trim();
  } catch (e) {
    return { error: '无法获取进程信息' };
  }
}

function getSysInfo() {
  return {
    platform: os.platform(),
    arch: os.arch(),
    hostname: os.hostname(),
    uptime: formatUptime(os.uptime()),
    type: os.type(),
    release: os.release()
  };
}

function formatUptime(seconds) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  
  let result = '';
  if (days > 0) result += `${days} 天 `;
  if (hours > 0) result += `${hours} 小时 `;
  result += `${mins} 分钟`;
  return result;
}

function parseArgs() {
  const args = process.argv.slice(2);
  const result = {};
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

// 主逻辑
const args = parseArgs();
const type = args.type || 'all';
const isJson = args.json;

function output(data) {
  if (isJson) {
    console.log(JSON.stringify(data, null, 2));
  } else {
    if (typeof data === 'object') {
      for (const [key, value] of Object.entries(data)) {
        if (typeof value === 'object' && !Array.isArray(value)) {
          console.log(`${key}:`);
          for (const [k, v] of Object.entries(value)) {
            console.log(`  ${k}: ${v}`);
          }
        } else if (Array.isArray(value)) {
          console.log(`${key}:`);
          value.forEach((item, i) => {
            if (typeof item === 'object') {
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

switch (type) {
  case 'cpu':
    output({ CPU: getCpuInfo() });
    break;
  case 'mem':
    output({ 内存: getMemInfo() });
    break;
  case 'disk':
    output({ 磁盘: getDiskInfo() });
    break;
  case 'network':
    output({ 网络: getNetworkInfo() });
    break;
  case 'process':
    console.log(getProcessInfo());
    break;
  case 'sys':
    output({ 系统: getSysInfo() });
    break;
  default:
    output({
      系统: getSysInfo(),
      CPU: getCpuInfo(),
      内存: getMemInfo(),
      磁盘: getDiskInfo(),
      网络: getNetworkInfo()
    });
}