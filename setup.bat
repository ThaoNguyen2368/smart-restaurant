@echo off
:: Cấu hình hiển thị font chữ UTF-8 để không bị lỗi tiếng Việt có dấu
chcp 65001 > nul
echo.
echo ====================================================
echo      Smart Restaurant OS - Khởi động trên Windows
echo ====================================================
echo.

:: Chạy file setup.ps1 bằng PowerShell và bỏ qua ExecutionPolicy bảo mật mặc định của Windows
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup.ps1"

if %errorlevel% neq 0 (
    echo.
    echo [Lỗi] Quá trình thiết lập gặp sự cố. Vui lòng kiểm tra thông báo lỗi ở trên.
    echo.
    pause
    exit /b %errorlevel%
)

echo.
pause
