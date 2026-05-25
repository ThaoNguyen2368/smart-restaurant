#!/bin/bash

# Tự động dừng script nếu có lỗi xảy ra
set -e

# ANSI Color Codes for beautiful output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}====================================================${NC}"
echo -e "${GREEN}   Smart Restaurant OS - Hướng Dẫn Cài Đặt Tự Động   ${NC}"
echo -e "${BLUE}====================================================${NC}"

# Bước 1: Kiểm tra Docker đã được cài đặt chưa
if ! command -v docker &> /dev/null; then
    echo -e "${RED}❌ Lỗi: Docker chưa được cài đặt trên máy của bạn.${NC}"
    echo -e "${YELLOW}👉 Vui lòng tải và cài đặt Docker Desktop từ: https://www.docker.com/products/docker-desktop/${NC}"
    exit 1
fi

# Bước 2: Kiểm tra Docker Compose
DOCKER_COMPOSE_CMD=""
if docker compose version &> /dev/null; then
    DOCKER_COMPOSE_CMD="docker compose"
elif command -v docker-compose &> /dev/null; then
    DOCKER_COMPOSE_CMD="docker-compose"
else
    echo -e "${RED}❌ Lỗi: Không tìm thấy lệnh 'docker compose' hoặc 'docker-compose'.${NC}"
    echo -e "${YELLOW}👉 Vui lòng cài đặt/kích hoạt Docker Compose trong Docker Desktop.${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Đã phát hiện Docker: $(docker --version)${NC}"
echo -e "${GREEN}✅ Đã phát hiện Docker Compose: $($DOCKER_COMPOSE_CMD version)${NC}"

# Bước 3: Tạo file cấu hình môi trường .env nếu chưa tồn tại
if [ ! -f .env ]; then
    echo -e "${YELLOW}📋 Đang tạo file .env từ file mẫu .env.example...${NC}"
    cp .env.example .env
    echo -e "${GREEN}✅ Đã tạo file .env thành công.${NC}"
else
    echo -e "${BLUE}ℹ️ File .env đã tồn tại. Bỏ qua bước tạo mới để giữ nguyên cấu hình hiện tại của bạn.${NC}"
fi

# Bước 4: Tắt các service đang chạy để tránh bị nghẽn kết nối / khóa dữ liệu (database locks)
echo -e "${YELLOW}🧹 Đang dọn dẹp các container đang chạy từ trước (nếu có)...${NC}"
$DOCKER_COMPOSE_CMD down

# Bước 5: Khởi động trước Database, Redis và Backend để sẵn sàng chạy migrations
echo -e "${YELLOW}🚀 Đang khởi động Database, Redis và Backend...${NC}"
$DOCKER_COMPOSE_CMD up -d db redis backend

# Bước 6: Đợi Backend và Database sẵn sàng hoạt động
echo -e "${YELLOW}⏳ Đang đợi Backend khởi chạy và chạy migration database (có thể mất 30s - 1 phút)...${NC}"
MAX_ATTEMPTS=30
ATTEMPT=1
BACKEND_HEALTHY=false

while [ $ATTEMPT -le $MAX_ATTEMPTS ]; do
    # Thử gọi endpoint health bằng curl nếu có sẵn trên máy
    if command -v curl &> /dev/null; then
        STATUS_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8000/health || true)
        if [ "$STATUS_CODE" -eq 200 ]; then
            BACKEND_HEALTHY=true
            break
        fi
    else
        # Nếu không có curl, kiểm tra trạng thái health của container thông qua docker inspect
        CONTAINER_ID=$(docker ps -q -f "label=com.docker.compose.service=backend" || true)
        if [ -n "$CONTAINER_ID" ]; then
            HEALTH_STATUS=$(docker inspect --format='{{.State.Health.Status}}' "$CONTAINER_ID" 2>/dev/null || true)
            if [ "$HEALTH_STATUS" = "healthy" ]; then
                BACKEND_HEALTHY=true
                break
            fi
        fi
    fi
    echo -n "."
    sleep 3
    ATTEMPT=$((ATTEMPT + 1))
done

echo ""

if [ "$BACKEND_HEALTHY" = true ]; then
    echo -e "${GREEN}✅ Backend API đã khởi động và kiểm tra sức khỏe thành công!${NC}"
else
    echo -e "${YELLOW}⚠️ Lưu ý: Hết thời gian chờ backend phản hồi, tiến hành chạy thử seed dữ liệu...${NC}"
fi

# Bước 7: Khởi chạy seed dữ liệu demo vào Database (Giải phóng kết nối trước để tránh bị khóa)
echo -e "${YELLOW}🧹 Đang giải phóng các kết nối cũ tới cơ sở dữ liệu để tránh bị khóa (locks)...${NC}"
$DOCKER_COMPOSE_CMD exec -T db psql -U app_user -d smart_restaurant -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = 'smart_restaurant' AND pid <> pg_backend_pid();" > /dev/null 2>&1 || true

echo -e "${YELLOW}🌱 Đang tiến hành nạp dữ liệu mẫu (seeding database)...${NC}"
$DOCKER_COMPOSE_CMD --profile tools run --rm seed

# Bước 8: Khởi động toàn bộ các phân hệ Frontend
echo -e "${YELLOW}🚀 Đang tiến hành build và khởi động các phân hệ Frontend...${NC}"
$DOCKER_COMPOSE_CMD up --build -d

echo -e "${BLUE}====================================================${NC}"
echo -e "${GREEN}🎉 HỆ THỐNG ĐÃ SẴN SÀNG HOẠT ĐỘNG!${NC}"
echo -e "${BLUE}====================================================${NC}"
echo -e "Giảng viên có thể truy cập các phân hệ qua các địa chỉ sau:"
echo -e " 💻 ${GREEN}Backend API Docs:${NC}      http://localhost:8000/docs"
echo -e " 🛒 ${GREEN}Customer Web:${NC}          http://localhost:3001"
echo -e " 💁 ${GREEN}Staff Web (Phục vụ):${NC}   http://localhost:3002"
echo -e " 💵 ${GREEN}Cashier Web (Thu ngân):${NC} http://localhost:3003"
echo -e " 🍳 ${GREEN}Kitchen Web (Bếp):${NC}     http://localhost:3004"
echo -e " ⚙️  ${GREEN}Admin Portal (Quản trị):${NC}http://localhost:3005"
echo -e "${BLUE}----------------------------------------------------${NC}"
echo -e "${YELLOW}🔑 THÔNG TIN TÀI KHOẢN ĐỂ DỄ DÀNG KIỂM THỬ (Tên / Mật khẩu):${NC}"
echo -e " - ${GREEN}Admin:${NC}         admin / admin123"
echo -e " - ${GREEN}Nhân viên:${NC}     staff1 / staff123"
echo -e " - ${GREEN}Thu ngân:${NC}      cashier1 / cashier123"
echo -e " - ${GREEN}Nhà bếp:${NC}       kitchen1 / kitchen123"
echo -e " - ${GREEN}Quản lý:${NC}       manager1 / manager123"
echo -e "${BLUE}====================================================${NC}"
echo -e "${GREEN}Chúc thầy cô có trải nghiệm kiểm thử tốt nhất!${NC}"
