@echo off
REM =========================================================
REM  VIX · VXN 波动率追踪 - 一键启动 (服务 + Cloudflare 公网隧道)
REM  运行后请记录屏幕上方/下方打印的公网 HTTPS 地址, 在手机上打开。
REM  注意: 本窗口必须保持开启, 关闭即停服。手机推送依赖本机常开。
REM =========================================================
setlocal
cd /d "%~dp0"

set PORT=8788

echo [1/2] 启动本地服务 (port %PORT%) ...
start "VIX-VXN-Server" cmd /k "node server\index.js"

echo [2/2] 启动 Cloudflare 公网隧道 ...
echo       (首次需下载/查找 cloudflared 路径, 稍等几秒)
where cloudflared.exe >nul 2>&1
if %errorlevel%==0 (set "CF=cloudflared.exe") else (set "CF=C:\Program Files (x86)\cloudflared\cloudflared.exe")

"%CF%" tunnel --url http://localhost:%PORT% --no-autoupdate

echo.
echo 已退出。若要停止服务, 请手动关闭上方 "VIX-VXN-Server" 窗口。
pause
