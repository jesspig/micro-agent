# 系统信息工具 - PowerShell 多功能版本
# 用法: ./sysinfo.ps1 [-Type cpu|mem|disk|network|sys|all] [-Json]

param(
    [ValidateSet("cpu", "mem", "disk", "network", "sys", "all")]
    [string]$Type = "all",
    [switch]$Json
)

function Get-CpuInfo {
    $cpu = Get-CimInstance Win32_Processor
    $cores = (Get-CimInstance Win32_ComputerSystem).NumberOfLogicalProcessors
    $usage = (Get-Counter '\Processor(_Total)\% ProcessorTime' -ErrorAction SilentlyContinue).CounterSamples.CookedValue
    
    return @{
        "核心数" = $cores
        "型号" = $cpu.Name
        "使用率" = if ($usage) { "{0:N1}%" -f $usage } else { "N/A" }
    }
}

function Get-MemInfo {
    $os = Get-CimInstance Win32_OperatingSystem
    $total = [math]::Round($os.TotalVisibleMemorySize / 1MB, 2)
    $free = [math]::Round($os.FreePhysicalMemory / 1MB, 2)
    $used = [math]::Round($total - $free, 2)
    
    return @{
        "总量" = "$total GB"
        "已用" = "$used GB"
        "可用" = "$free GB"
        "使用率" = "{0:N1}%" -f ($used / $total * 100)
    }
}

function Get-DiskInfo {
    $disks = Get-CimInstance Win32_LogicalDisk | Where-Object { $_.DriveType -eq 3 }
    
    return $disks | ForEach-Object {
        $total = [math]::Round($_.Size / 1GB, 2)
        $free = [math]::Round($_.FreeSpace / 1GB, 2)
        $used = [math]::Round($total - $free, 2)
        
        @{
            "驱动器" = $_.DeviceID
            "总量" = "$total GB"
            "已用" = "$used GB"
            "可用" = "$free GB"
            "使用率" = "{0:N1}%" -f ($used / $total * 100)
        }
    }
}

function Get-NetworkInfo {
    $adapters = Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.InterfaceAlias -notlike "*Loopback*" }
    
    return $adapters | ForEach-Object {
        @{
            "接口" = $_.InterfaceAlias
            "IP地址" = $_.IPAddress
            "子网掩码" = $_.PrefixLength
        }
    }
}

function Get-SysInfo {
    $os = Get-CimInstance Win32_OperatingSystem
    $uptime = (Get-Date) - $os.LastBootUpTime
    
    return @{
        "平台" = "Windows"
        "版本" = $os.Caption
        "主机名" = $env:COMPUTERNAME
        "运行时间" = "{0:N0} 小时" -f $uptime.TotalHours
    }
}

function Output-Result {
    param($Data)
    
    if ($Json) {
        $Data | ConvertTo-Json -Depth 3
    } else {
        foreach ($key in $Data.Keys) {
            $value = $Data[$key]
            if ($value -is [Array]) {
                Write-Host "$key :"
                $value | ForEach-Object { Write-Host "  $_" }
            } elseif ($value -is [hashtable]) {
                Write-Host "$key :"
                $value.GetEnumerator() | ForEach-Object { Write-Host "  $($_.Key): $($_.Value)" }
            } else {
                Write-Host "$key : $value"
            }
        }
    }
}

$result = @{}

switch ($Type) {
    "cpu" { $result["CPU"] = Get-CpuInfo }
    "mem" { $result["内存"] = Get-MemInfo }
    "disk" { $result["磁盘"] = @(Get-DiskInfo) }
    "network" { $result["网络"] = @(Get-NetworkInfo) }
    "sys" { $result["系统"] = Get-SysInfo }
    "all" {
        $result["系统"] = Get-SysInfo
        $result["CPU"] = Get-CpuInfo
        $result["内存"] = Get-MemInfo
        $result["磁盘"] = @(Get-DiskInfo)
        $result["网络"] = @(Get-NetworkInfo)
    }
}

if ($Json) {
    $result | ConvertTo-Json -Depth 3
} else {
    foreach ($section in $result.GetEnumerator()) {
        Write-Host ""
        Write-Host "=== $($section.Key) ==="
        $value = $section.Value
        if ($value -is [Array]) {
            $value | ForEach-Object {
                if ($_ -is [hashtable]) {
                    $_.GetEnumerator() | ForEach-Object { Write-Host "  $($_.Key): $($_.Value)" }
                    Write-Host ""
                }
            }
        } elseif ($value -is [hashtable]) {
            $value.GetEnumerator() | ForEach-Object { Write-Host "  $($_.Key): $($_.Value)" }
        }
    }
}