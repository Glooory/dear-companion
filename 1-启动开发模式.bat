@echo off
chcp 65001 >nul
title Dear Companion - 开发模式

echo ========================================================
echo         Dear Companion - 正在启动开发环境...
echo ========================================================
echo.

set ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
set ELECTRON_BUILDER_BINARIES_MIRROR=https://npmmirror.com/mirrors/electron-builder-binaries/

if not exist node_modules (
    echo [提示] 检测到首次运行，正在为您安装依赖（使用国内镜像）...
    call npm install
    if %errorlevel% neq 0 (
        echo.
        echo [错误] 依赖安装失败，请检查网络后重试。
        pause
        exit /b %errorlevel%
    )
)

if not exist "node_modules\electron\path.txt" (
    echo [提示] 正在下载 Electron 运行环境...
    call node node_modules\electron\install.js
    if %errorlevel% neq 0 (
        echo.
        echo [错误] Electron 下载失败，请检查网络。
        pause
        exit /b %errorlevel%
    )
)

echo [提示] 正在启动应用...
call npm run dev

if %errorlevel% neq 0 (
    echo.
    echo [提示] 应用已退出或发生错误。
    pause
)
