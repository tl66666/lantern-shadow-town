@echo off
title 灯影古镇 · 四灵补天
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  未检测到 Node.js，请先安装：https://nodejs.org/
  echo  安装完成后重新运行本脚本即可。
  echo.
  pause
  exit /b 1
)

echo.
echo  ============================================
echo    灯影古镇 · 四灵补天
echo  ============================================
echo    正在点亮古镇……
echo    浏览器会在服务器就绪后自动打开
echo    停止游戏：关闭本窗口，或按 Ctrl + C
echo  ============================================
echo.
node serve.js

echo.
echo  古镇已熄灯，感谢游玩！
pause