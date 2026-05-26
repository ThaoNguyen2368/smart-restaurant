# HƯỚNG DẪN CÀI ĐẶT & KIỂM THỬ HỆ THỐNG

## Smart Restaurant OS — Hệ Điều Hành Quản Lý Nhà Hàng Thông Minh

Tài liệu này hướng dẫn cách khởi chạy và kiểm thử hệ thống **Smart Restaurant OS** trên máy tính cá nhân. Hệ thống được container hóa hoàn toàn bằng Docker Compose để đảm bảo tính đồng nhất và dễ dàng triển khai.

---

## Yêu cầu hệ thống

Trước khi bắt đầu, vui lòng đảm bảo máy tính của bạn đã cài đặt:

* **Docker** & **Docker Compose** (Khuyến nghị cài đặt [Docker Desktop](https://www.docker.com/products/docker-desktop/)).
* Hệ điều hành: macOS, Linux hoặc Windows (sử dụng WSL2 hoặc PowerShell).

---

## Cách 1: Cài đặt Tự động bằng Script (Khuyến nghị)

Để thuận tiện nhất cho việc kiểm thử của giảng viên, dự án đã cung cấp các script tự động hóa toàn bộ quá trình: sao chép file cấu hình môi trường, xây dựng các container, di chuyển cơ sở dữ liệu (migrations) và nạp dữ liệu mẫu (seeding).

### 🍎 Đối với hệ điều hành macOS hoặc Linux

Mở terminal tại thư mục gốc của dự án và chạy:

```bash
./setup.sh
```

### 🪟 Đối với hệ điều hành Windows (Sử dụng Git Bash trong VS Code)

Nếu giảng viên hoặc bạn mở dự án bằng **VS Code** trên Windows:

1. Mở Terminal trong VS Code bằng phím tắt ``Ctrl + ` `` (hoặc chọn menu **Terminal** > **New Terminal**).
2. Click vào menu thả xuống ở góc trên bên phải của khung Terminal (bên cạnh dấu `+`) và chọn **Git Bash** để chuyển đổi terminal.
3. Nhập lệnh cấp quyền thực thi cho file script:
   ```bash
   chmod +x setup.sh
   ```
4. Khởi chạy script cài đặt tự động:
   ```bash
   ./setup.sh
   ```

Sau khi chạy xong, script sẽ in ra toàn bộ liên kết truy cập các phân hệ và thông tin tài khoản dùng để đăng nhập kiểm thử.

---

## Cách 2: Cài đặt Thủ công từng bước

Nếu bạn không muốn chạy script hoặc gặp sự cố môi trường, bạn có thể thực hiện theo các bước thủ công sau:

### Bước 1: Thiết lập cấu hình môi trường (.env)

Sao chép file `.env.example` thành file `.env` ở thư mục gốc của dự án:

* **macOS / Linux**: `cp .env.example .env`
* **Windows (PowerShell)**: `Copy-Item .env.example .env`

*(Lưu ý: Mặc định cấu hình trong `.env.example` đã được thiết lập tối ưu để chạy cục bộ qua localhost).*

### Bước 2: Khởi dựng hệ thống bằng Docker Compose

Tải các image cần thiết, build mã nguồn các dịch vụ và khởi động chúng dưới chế độ chạy nền (`-d`):

```bash
docker-compose up --build -d
```

*(Nếu sử dụng phiên bản Docker Compose cũ hơn, dùng lệnh `docker-compose up --build -d`)*

### Bước 3: Đợi các dịch vụ khởi chạy

Quá trình build và khởi chạy các service frontend/backend sẽ mất khoảng 1-3 phút trong lần chạy đầu tiên. Kiểm tra trạng thái của các container:

```bash
docker-compose ps
```

Khi container `backend` hiển thị trạng thái `healthy`, bạn có thể tiến hành bước tiếp theo.

### Bước 4: Nạp dữ liệu mẫu (Database Seeding)

Chạy script seed mẫu để tạo ra thực đơn, các bàn ăn, cấu hình thuế và đặc biệt là các **tài khoản nhân viên kiểm thử**:

```bash
docker-compose --profile tools run --rm seed
```

---

## Danh sách các phân hệ và cổng truy cập

Hệ thống bao gồm API Backend (FastAPI) và 5 phân hệ Frontend dành cho các nhóm đối tượng người dùng khác nhau trong nhà hàng:

| Phân hệ (Dịch vụ)           | Đường dẫn truy cập (URL)                         | Mô tả vai trò                                              |
| :------------------------------ | :---------------------------------------------------- | :------------------------------------------------------------ |
| **Backend API (Swagger)** | [http://localhost:8000/docs](http://localhost:8000/docs) | Tài liệu mô tả và kiểm thử trực tiếp API Backend     |
| **Customer Web**          | [http://localhost:3001](http://localhost:3001)           | Giao diện gọi món tại bàn của khách hàng qua mã QR   |
| **Staff Web**             | [http://localhost:3002](http://localhost:3002)           | Giao diện phục vụ bàn (nhận món, yêu cầu hỗ trợ)    |
| **Cashier Web**           | [http://localhost:3003](http://localhost:3003)           | Giao diện thu ngân (quản lý hóa đơn, thanh toán)      |
| **Kitchen Web**           | [http://localhost:3004](http://localhost:3004)           | Màn hình hiển thị bếp (KDS - nhận chế biến món ăn)  |
| **Admin Portal**          | [http://localhost:3005](http://localhost:3005)           | Trang quản trị (quản lý menu, bàn, nhân sự, doanh thu) |

---

## Danh sách Tài khoản Kiểm thử (Demo Accounts)

Sau khi chạy lệnh nạp dữ liệu mẫu (Seed Database), các tài khoản dưới đây sẽ được khởi tạo sẵn trong hệ thống:

| Vai trò                                 | Tên đăng nhập | Mật khẩu     | Phân hệ tương ứng                 |
| :--------------------------------------- | :---------------- | :------------- | :------------------------------------- |
| **Quản trị viên (Admin)**       | `admin`         | `admin123`   | Admin Portal                           |
| **Nhân viên phục vụ (Staff)**  | `staff1`        | `staff123`   | Staff Web                              |
| **Thu ngân (Cashier)**            | `cashier1`      | `cashier123` | Cashier Web                            |
| **Bếp trưởng (Kitchen)**        | `kitchen1`      | `kitchen123` | Kitchen Web                            |
| **Quản lý nhà hàng (Manager)** | `manager1`      | `manager123` | Admin Portal / Các trang tác nghiệp |

> [!WARNING]
> Tất cả mật khẩu trên đều dùng cho mục đích chạy thử nghiệm nội bộ và kiểm thử cục bộ. Vui lòng thay đổi cấu hình môi trường bảo mật nếu triển khai lên máy chủ thực tế (Production).

---

## Các lệnh quản lý Docker hữu ích

Trong quá trình vận hành, giảng viên hoặc đội phát triển có thể sử dụng các lệnh sau:

* **Xem logs của hệ thống API backend:**

  ```bash
  docker-compose logs -f backend
  ```
* **Dừng tất cả các dịch vụ (không mất dữ liệu):**

  ```bash
  docker-compose stop
  ```
* **Khởi động lại các dịch vụ sau khi stop:**

  ```bash
  docker-compose start
  ```
* **Hạ toàn bộ hệ thống và xóa các container:**

  ```bash
  docker-compose down
  ```
* **Reset sạch sẽ Database và làm mới dữ liệu (Xóa dữ liệu cũ để chạy lại từ đầu):**

  ```bash
  docker-compose down -v
  docker-compose up -d
  docker-compose --profile tools run --rm seed
  ```

  *(Lưu ý: Lệnh `docker-compose down -v` sẽ xóa hoàn toàn volume dữ liệu PostgreSQL)*

---

*Chúc quý thầy cô kiểm thử thành công hệ thống Smart Restaurant OS!*
