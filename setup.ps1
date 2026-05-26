# Smart Restaurant OS - Automatic Setup for Windows PowerShell
$ErrorActionPreference = "Stop"

# Define colors for output
$Green = "Green"
$Blue = "Cyan"
$Yellow = "Yellow"
$Red = "Red"

Write-Host "====================================================" -ForegroundColor $Blue
Write-Host "   Smart Restaurant OS - Hướng Dẫn Cài Đặt Tự Động   " -ForegroundColor $Green
Write-Host "====================================================" -ForegroundColor $Blue

# Bước 1: Kiểm tra Docker đã được cài đặt chưa
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Host "❌ Lỗi: Docker chưa được cài đặt trên máy của bạn." -ForegroundColor $Red
    Write-Host "👉 Vui lòng tải và cài đặt Docker Desktop từ: https://www.docker.com/products/docker-desktop/" -ForegroundColor $Yellow
    exit 1
}

# Bước 2: Kiểm tra Docker Compose
$DockerComposeCmd = ""
if (docker compose version 2>$null) {
    $DockerComposeCmd = "docker compose"
} elseif (Get-Command docker-compose -ErrorAction SilentlyContinue) {
    $DockerComposeCmd = "docker-compose"
} else {
    Write-Host "❌ Lỗi: Không tìm thấy lệnh 'docker compose' hoặc 'docker-compose'." -ForegroundColor $Red
    Write-Host "👉 Vui lòng cài đặt/kích hoạt Docker Compose trong Docker Desktop." -ForegroundColor $Yellow
    exit 1
}

$DockerVersion = docker --version
$ComposeVersion = Invoke-Expression "$DockerComposeCmd version"
Write-Host "✅ Đã phát hiện Docker: $DockerVersion" -ForegroundColor $Green
Write-Host "✅ Đã phát hiện Docker Compose: $ComposeVersion" -ForegroundColor $Green

# Bước 3: Tạo file cấu hình môi trường .env nếu chưa tồn tại
if (-not (Test-Path .env)) {
    Write-Host "📋 Đang tạo file .env từ file mẫu .env.example..." -ForegroundColor $Yellow
    Copy-Item .env.example .env
    Write-Host "✅ Đã tạo file .env thành công." -ForegroundColor $Green
} else {
    Write-Host "ℹ️ File .env đã tồn tại. Bỏ qua bước tạo mới để giữ nguyên cấu hình hiện tại của bạn." -ForegroundColor $Blue
}

# Bước 4: Tắt các service đang chạy để tránh bị nghẽn kết nối / khóa dữ liệu (database locks)
Write-Host "🧹 Đang dọn dẹp các container đang chạy từ trước (nếu có)..." -ForegroundColor $Yellow
Invoke-Expression "$DockerComposeCmd down"

# Bước 5: Khởi động trước Database, Redis và Backend để sẵn sàng chạy migrations
Write-Host "🚀 Đang khởi động Database, Redis và Backend..." -ForegroundColor $Yellow
Invoke-Expression "$DockerComposeCmd up -d db redis backend"

# Bước 6: Đợi Backend và Database sẵn sàng hoạt động
Write-Host "⏳ Đang đợi Backend khởi chạy và chạy migration database (có thể mất 30s - 1 phút)..." -ForegroundColor $Yellow
$MaxAttempts = 30
$Attempt = 1
$BackendHealthy = $false

while ($Attempt -le $MaxAttempts) {
    try {
        # Thử gọi endpoint health bằng Invoke-WebRequest
        $Response = Invoke-WebRequest -Uri "http://localhost:8000/health" -UseBasicParsing -TimeoutSec 2 -ErrorAction SilentlyContinue
        if ($Response.StatusCode -eq 200) {
            $BackendHealthy = $true
            break
        }
    } catch {
        # Nếu không gọi được, kiểm tra trạng thái health thông qua docker inspect
        $ContainerId = (docker ps -q -f "label=com.docker.compose.service=backend")
        if ($ContainerId) {
            $HealthStatus = (docker inspect --format='{{.State.Health.Status}}' $ContainerId 2>$null)
            if ($HealthStatus -eq "healthy") {
                $BackendHealthy = $true
                break
            }
        }
    }
    Write-Host -NoNewline "."
    Start-Sleep -Seconds 3
    $Attempt++
}
Write-Host ""

if ($BackendHealthy) {
    Write-Host "✅ Backend API đã khởi động và kiểm tra sức khỏe thành công!" -ForegroundColor $Green
} else {
    Write-Host "⚠️ Lưu ý: Hết thời gian chờ backend phản hồi, tiến hành chạy thử seed dữ liệu..." -ForegroundColor $Yellow
}

# Bước 7: Khởi chạy seed dữ liệu demo vào Database (Giải phóng kết nối trước để tránh bị khóa)
Write-Host "🧹 Đang giải phóng các kết nối cũ tới cơ sở dữ liệu để tránh bị khóa (locks)..." -ForegroundColor $Yellow
try {
    $SqlCmd = "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = 'smart_restaurant' AND pid <> pg_backend_pid();"
    if ($DockerComposeCmd -eq "docker compose") {
        docker compose exec -T db psql -U app_user -d smart_restaurant -c "$SqlCmd" *>$null
    } else {
        docker-compose exec -T db psql -U app_user -d smart_restaurant -c "$SqlCmd" *>$null
    }
} catch {
    # Bỏ qua lỗi nếu có vì đây chỉ là bước dọn dẹp phụ trợ
}

Write-Host "🌱 Đang tiến hành nạp dữ liệu mẫu (seeding database)..." -ForegroundColor $Yellow
Invoke-Expression "$DockerComposeCmd --profile tools run --rm seed"

# Bước 8: Khởi động toàn bộ các phân hệ Frontend
Write-Host "🚀 Đang tiến hành build và khởi động các phân hệ Frontend..." -ForegroundColor $Yellow
Invoke-Expression "$DockerComposeCmd up --build -d"

Write-Host "====================================================" -ForegroundColor $Blue
Write-Host "🎉 HỆ THỐNG ĐÃ SẴN SÀNG HOẠT ĐỘNG!" -ForegroundColor $Green
Write-Host "====================================================" -ForegroundColor $Blue
Write-Host "Giảng viên có thể truy cập các phân hệ qua các địa chỉ sau:"
Write-Host " 💻 Backend API Docs:      http://localhost:8000/docs" -ForegroundColor $Green
Write-Host " 🛒 Customer Web:          http://localhost:3001" -ForegroundColor $Green
Write-Host " 💁 Staff Web (Phục vụ):   http://localhost:3002" -ForegroundColor $Green
Write-Host " 💵 Cashier Web (Thu ngân): http://localhost:3003" -ForegroundColor $Green
Write-Host " 🍳 Kitchen Web (Bếp):     http://localhost:3004" -ForegroundColor $Green
Write-Host " ⚙️  Admin Portal (Quản trị):http://localhost:3005" -ForegroundColor $Green
Write-Host "----------------------------------------------------" -ForegroundColor $Blue
Write-Host "🔑 THÔNG TIN TÀI KHOẢN ĐỂ DỄ DÀNG KIỂM THỬ (Tên / Mật khẩu):" -ForegroundColor $Yellow
Write-Host " - Admin:         admin / admin123" -ForegroundColor $Green
Write-Host " - Nhân viên:     staff1 / staff123" -ForegroundColor $Green
Write-Host " - Thu ngân:      cashier1 / cashier123" -ForegroundColor $Green
Write-Host " - Nhà bếp:       kitchen1 / kitchen123" -ForegroundColor $Green
Write-Host " - Quản lý:       manager1 / manager123" -ForegroundColor $Green
Write-Host "====================================================" -ForegroundColor $Blue
Write-Host "Chúc thầy cô có trải nghiệm kiểm thử tốt nhất!" -ForegroundColor $Green
