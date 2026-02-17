#!/usr/bin/env python3
"""
系统信息工具 - Python 多功能版本

用法:
    python sysinfo.py                    # 完整系统信息
    python sysinfo.py --type cpu         # 仅 CPU 信息
    python sysinfo.py --type mem         # 仅内存信息
    python sysinfo.py --json             # JSON 输出
"""

import argparse
import json
import platform
import sys

try:
    import psutil
except ImportError:
    print("需要安装 psutil: pip install psutil")
    sys.exit(1)

def format_bytes(bytes):
    gb = bytes / 1024**3
    return f"{gb:.2f} GB" if gb >= 1 else f"{bytes / 1024**2:.2f} MB"

def get_cpu_info():
    return {
        "cores": psutil.cpu_count(logical=True),
        "physical_cores": psutil.cpu_count(logical=False),
        "usage": f"{psutil.cpu_percent(interval=1)}%",
        "loadavg": list(psutil.getloadavg()) if hasattr(psutil, 'getloadavg') else None
    }

def get_mem_info():
    mem = psutil.virtual_memory()
    return {
        "total": format_bytes(mem.total),
        "used": format_bytes(mem.used),
        "free": format_bytes(mem.available),
        "usage": f"{mem.percent}%"
    }

def get_disk_info():
    disks = []
    for partition in psutil.disk_partitions():
        try:
            usage = psutil.disk_usage(partition.mountpoint)
            disks.append({
                "device": partition.device,
                "mountpoint": partition.mountpoint,
                "total": format_bytes(usage.total),
                "used": format_bytes(usage.used),
                "free": format_bytes(usage.free),
                "usage": f"{usage.percent}%"
            })
        except:
            pass
    return disks

def get_network_info():
    networks = []
    for name, addrs in psutil.net_if_addrs().items():
        for addr in addrs:
            if addr.family == 2:  # IPv4
                networks.append({
                    "interface": name,
                    "ip": addr.address,
                    "netmask": addr.netmask
                })
    return networks

def get_process_info(top=10):
    processes = []
    for proc in psutil.process_iter(['pid', 'name', 'cpu_percent', 'memory_percent']):
        try:
            processes.append(proc.info)
        except:
            pass
    
    # 按内存排序
    processes.sort(key=lambda x: x.get('memory_percent', 0) or 0, reverse=True)
    return processes[:top]

def get_sys_info():
    return {
        "platform": platform.system(),
        "arch": platform.machine(),
        "hostname": platform.node(),
        "uptime": f"{int(psutil.boot_time())}",
        "python": platform.python_version()
    }

def main():
    parser = argparse.ArgumentParser(description='系统信息工具')
    parser.add_argument('--type', '-t', choices=['cpu', 'mem', 'disk', 'network', 'process', 'sys', 'all'],
                        default='all', help='信息类型')
    parser.add_argument('--json', '-j', action='store_true', help='JSON 输出')
    
    args = parser.parse_args()
    
    result = {}
    
    if args.type in ['all', 'sys']:
        result['系统'] = get_sys_info()
    if args.type in ['all', 'cpu']:
        result['CPU'] = get_cpu_info()
    if args.type in ['all', 'mem']:
        result['内存'] = get_mem_info()
    if args.type in ['all', 'disk']:
        result['磁盘'] = get_disk_info()
    if args.type in ['all', 'network']:
        result['网络'] = get_network_info()
    if args.type == 'process':
        result['进程'] = get_process_info()
    
    if args.json:
        print(json.dumps(result, ensure_ascii=False, indent=2))
    else:
        for key, value in result.items():
            print(f"\n=== {key} ===")
            if isinstance(value, list):
                for item in value:
                    print(f"  {item}")
            else:
                for k, v in value.items():
                    print(f"  {k}: {v}")

if __name__ == '__main__':
    main()