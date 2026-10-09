@echo off
chcp 65001 >nul
cd /d "%~dp0"
where py >nul 2>nul
if errorlevel 1 (
  echo 找不到 Python。請安裝 Python，或使用 VS Code Live Server。
  pause
  exit /b 1
)
echo.
echo 正在啟動本機測試伺服器...
echo 請在電腦瀏覽器開啟 http://localhost:8000
echo 按 Ctrl+C 停止伺服器。
echo.
py -m http.server 8000
pause
