@echo off
REM 系统信息工具 - CMD 版本
REM 用法: sysinfo.cmd [cpu|mem|disk|sys]

setlocal enabledelayedexpansion

set TYPE=%1
if "%TYPE%"=="" set TYPE=all

if "%TYPE%"=="cpu" goto cpu
if "%TYPE%"=="mem" goto mem
if "%TYPE%"=="disk" goto disk
if "%TYPE%"=="sys" goto sys
goto all

:cpu
echo === CPU ===
for /f "tokens=*" %%i in ('wmic cpu get NumberOfCores /value ^| find "="') do set %%i
for /f "tokens=*" %%i in ('wmic cpu get NumberOfLogicalProcessors /value ^| find "="') do set %%i
echo 物理核心: %NumberOfCores%
echo 逻辑核心: %NumberOfLogicalProcessors%
for /f "tokens=*" %%i in ('wmic cpu get Name /value ^| find "="') do set %%i
echo 型号: %Name%
goto end

:mem
echo === 内存 ===
for /f "tokens=*" %%i in ('wmic OS get TotalVisibleMemorySize /value ^| find "="') do set %%i
set /a total=%TotalVisibleMemorySize%/1024/1024
for /f "tokens=*" %%i in ('wmic OS get FreePhysicalMemory /value ^| find "="') do set %%i
set /a free=%FreePhysicalMemory%/1024/1024
set /a used=%total%-%free%
echo 总量: %total% GB
echo 已用: %used% GB
echo 使用率: 
goto end

:disk
echo === 磁盘 ===
for /f "skip=1 tokens=1-4" %%a in ('wmic logicaldisk get DeviceID^,Size^,FreeSpace^,VolumeName') do (
    if "%%a" neq "" (
        set /a size=%%b/1024/1024/1024 2>nul
        set /a free=%%c/1024/1024/1024 2>nul
        set /a used=!size!-!free! 2>nul
        echo %%a: 总量 !size! GB, 已用 !used! GB
    )
)
goto end

:sys
echo === 系统 ===
echo 平台: Windows
ver
echo 主机名: %COMPUTERNAME%
goto end

:all
call :cpu
echo.
call :mem
echo.
call :disk
echo.
call :sys
goto end

:end
endlocal