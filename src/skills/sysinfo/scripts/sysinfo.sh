#!/bin/bash
# 系统信息工具 - Bash 多功能版本
# 用法: ./sysinfo.sh [--type cpu|mem|disk|network|sys|all] [--json]

# 默认值
TYPE="${1:-all}"
[ "$1" = "--type" ] && TYPE="$2"
[ "$1" = "-t" ] && TYPE="$2"
[ "$3" = "--json" ] || [ "$2" = "--json" ] && JSON=true || JSON=false

get_cpu() {
    echo "=== CPU ==="
    echo "核心数: $(nproc 2>/dev/null || sysctl -n hw.ncpu 2>/dev/null)"
    if command -v lscpu &>/dev/null; then
        echo "型号: $(lscpu | grep 'Model name' | cut -d: -f2 | xargs)"
    fi
    if [ -f /proc/loadavg ]; then
        load=$(cat /proc/loadavg)
        echo "负载: $(echo $load | awk '{print $1, $2, $3}')"
    fi
}

get_mem() {
    echo "=== 内存 ==="
    if command -v free &>/dev/null; then
        free -h | awk 'NR==2 {printf "总量: %s\n已用: %s\n使用率: %.1f%%\n", $2, $3, ($3/$2)*100}'
    elif command -v vm_stat &>/dev/null; then
        total=$(sysctl -n hw.memsize 2>/dev/null)
        if [ -n "$total" ]; then
            free=$(vm_stat | awk '/free/ {printf "%.0f", $3 * 4096}')
            used=$((total - free))
            echo "总量: $((total / 1024 / 1024 / 1024)) GB"
            echo "已用: $((used / 1024 / 1024 / 1024)) GB"
        fi
    fi
}

get_disk() {
    echo "=== 磁盘 ==="
    df -h 2>/dev/null | awk 'NR>1 && $1 ~ /^\/dev/ {printf "%s: 总量 %s, 已用 %s, 使用率 %s\n", $6, $2, $3, $5}'
}

get_network() {
    echo "=== 网络 ==="
    if command -v ip &>/dev/null; then
        ip -4 addr show | grep inet | awk '{print $NF": "$2}' | cut -d'/' -f1
    elif command -v ifconfig &>/dev/null; then
        ifconfig | grep "inet " | awk '{print $2}' | grep -v 127.0.0.1
    fi
}

get_sys() {
    echo "=== 系统 ==="
    echo "平台: $(uname -s)"
    echo "架构: $(uname -m)"
    echo "主机名: $(hostname)"
    if command -v uptime &>/dev/null; then
        uptime -p 2>/dev/null || uptime | awk -F'up ' '{print "运行时间: "$2}' | cut -d',' -f1
    fi
}

case "$TYPE" in
    cpu) get_cpu ;;
    mem) get_mem ;;
    disk) get_disk ;;
    network) get_network ;;
    sys) get_sys ;;
    *)
        get_cpu
        echo
        get_mem
        echo
        get_disk
        echo
        get_network
        echo
        get_sys
        ;;
esac