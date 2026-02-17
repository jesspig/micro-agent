# 时间工具 - PowerShell 多功能版本
# 用法: ./time.ps1 [-Timezone TZ] [-Format FMT] [-Diff DATE] [-Timestamp TS] [-Unix]

param(
    [string]$Timezone,
    [string]$Format = "yyyy-MM-dd HH:mm:ss",
    [string]$Diff,
    [string]$Timestamp,
    [switch]$Unix
)

$WEEKDAYS = @('星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六')
$WEEKDAYS_SHORT = @('周日', '周一', '周二', '周三', '周四', '周五', '周六')

function Format-Time {
    param([datetime]$Date, [string]$Fmt)
    
    $result = $Fmt
    $result = $result -replace 'YYYY', $Date.ToString('yyyy')
    $result = $result -replace 'YY', $Date.ToString('yy')
    $result = $result -replace 'MM', $Date.ToString('MM')
    $result = $result -replace 'DD', $Date.ToString('dd')
    $result = $result -replace 'HH', $Date.ToString('HH')
    $result = $result -replace 'mm', $Date.ToString('mm')
    $result = $result -replace 'ss', $Date.ToString('ss')
    $result = $result -replace 'SSS', $Date.Millisecond.ToString('000')
    $result = $result -replace 'dddd', $WEEKDAYS[$Date.DayOfWeek]
    $result = $result -replace 'ddd', $WEEKDAYS_SHORT[$Date.DayOfWeek]
    $result = $result -replace 'A', $(if ($Date.Hour -lt 12) { 'AM' } else { 'PM' })
    $result = $result -replace 'a', $(if ($Date.Hour -lt 12) { 'am' } else { 'pm' })
    
    return $result
}

$now = Get-Date

if ($Unix) {
    Write-Host "当前时间戳: $([int](Get-Date -UFormat %s))"
    exit
}

if ($Timestamp) {
    try {
        $ts = [long]$Timestamp
        if ($ts -lt 10000000000) {
            $date = [DateTimeOffset]::FromUnixTimeSeconds($ts).LocalDateTime
        } else {
            $date = [DateTimeOffset]::FromUnixTimeMilliseconds($ts).LocalDateTime
        }
        Write-Host (Format-Time -Date $date -Fmt "yyyy-MM-dd HH:mm:ss")
    } catch {
        Write-Host "无效时间戳: $Timestamp"
    }
    exit
}

if ($Diff) {
    try {
        $target = [DateTime]$Diff
        $span = $target - $now
        
        if ($span.TotalSeconds -gt 0) {
            Write-Host "距离 $Diff 还有 $([int]$span.TotalDays) 天"
        } else {
            Write-Host "$Diff 已过去 $([int](-$span.TotalDays)) 天"
        }
    } catch {
        Write-Host "无效日期格式，请使用 YYYY-MM-DD"
    }
    exit
}

Write-Host "系统时间: $(Format-Time -Date $now -Fmt $Format)"
Write-Host "UTC 时间: $(Format-Time -Date $now.ToUniversalTime() -Fmt $Format)"

if ($Timezone) {
    try {
        $tz = [System.TimeZoneInfo]::FindSystemTimeZoneById($Timezone)
        $tzTime = [System.TimeZoneInfo]::ConvertTime($now, $tz)
        Write-Host "$Timezone`: $(Format-Time -Date $tzTime -Fmt $Format)"
    } catch {
        Write-Host "无效时区: $Timezone"
        Write-Host "常用时区: China Standard Time, Tokyo Standard Time, Eastern Standard Time, GMT Standard Time"
    }
}