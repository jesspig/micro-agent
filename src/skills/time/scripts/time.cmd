@echo off
REM 时间工具 - CMD 版本
REM 用法: time.cmd [unix|timestamp TS]

if "%1"=="" goto current
if "%1"=="unix" goto unix
if "%1"=="timestamp" goto timestamp
goto current

:current
echo 系统时间: %date% %time%
goto end

:unix
for /f "tokens=*" %%i in ('powershell -Command "[int](Get-Date -UFormat %%s)"') do set ts=%%i
echo 当前时间戳: %ts%
goto end

:timestamp
if "%2"=="" (
    echo 用法: time.cmd timestamp 时间戳
    goto end
)
for /f "tokens=*" %%i in ('powershell -Command "[DateTimeOffset]::FromUnixTimeSeconds(%2).LocalDateTime.ToString('yyyy-MM-dd HH:mm:ss')"') do set dt=%%i
echo %dt%
goto end

:end