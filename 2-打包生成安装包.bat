@echo off
chcp 65001 >nul
title 挚伴 - 打包安装包

echo ========================================================
echo         挚伴 - 正在打包 Windows 安装程序
echo ========================================================
echo.

set ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
set ELECTRON_BUILDER_BINARIES_MIRROR=https://npmmirror.com/mirrors/electron-builder-binaries/

if not exist node_modules (
    echo [提示] 检测到尚未安装依赖，正在安装...
    call npm install
    if %errorlevel% neq 0 (
        echo.
        echo [错误] 依赖安装失败。
        pause
        exit /b %errorlevel%
    )
)

if not exist "node_modules\electron\path.txt" (
    echo [提示] 正在下载 Electron 运行环境...
    call node node_modules\electron\install.js
    if %errorlevel% neq 0 (
        echo.
        echo [错误] Electron 下载失败。
        pause
        exit /b %errorlevel%
    )
)

echo [提示] 正在执行编译与打包，请稍候（首次打包可能需要几分钟下载工具链）...
call npm run dist

if %errorlevel% equ 0 (
    echo.
    echo ========================================================
    echo  [成功] 打包完成！
    echo  安装包文件已生成在当前目录下的 release 文件夹中。
    echo ========================================================
    echo.
) else (
    echo.
    echo [错误] 打包过程中出现错误，请检查上方日志输出。
)

pause
