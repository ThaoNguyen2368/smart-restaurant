import urllib.request
import urllib.error
import json
import time

BASE_URL = "http://localhost:8000/api"

def print_step(msg):
    print(f"\n{'-'*50}\n> {msg}\n{'-'*50}")

def req(method, path, data=None, headers=None):
    if headers is None:
        headers = {}
    
    url = f"{BASE_URL}{path}"
    req_obj = urllib.request.Request(url, method=method)
    req_obj.add_header('Content-Type', 'application/json')
    
    for k, v in headers.items():
        req_obj.add_header(k, v)
        
    encoded_data = None
    if data is not None:
        encoded_data = json.dumps(data).encode('utf-8')
        
    try:
        with urllib.request.urlopen(req_obj, data=encoded_data) as response:
            res_body = response.read().decode('utf-8')
            if res_body:
                return json.loads(res_body)
            return None
    except urllib.error.HTTPError as e:
        err_body = e.read().decode('utf-8')
        print(f"[X] HTTP {e.code} Error on {method} {path}:\n{err_body}")
        raise

def login(username, password):
    res = req("POST", "/auth/login", {"username": username, "password": password})
    return res["access_token"]

def main():
    print_step("1. Lấy Token (Authentication)")
    staff_token = login("staff1", "staff123")
    kitchen_token = login("kitchen1", "kitchen123")
    cashier_token = login("cashier1", "cashier123")
    print("[OK] Da lay token cho Staff, Kitchen, Cashier")
    
    staff_headers = {"Authorization": f"Bearer {staff_token}"}
    kitchen_headers = {"Authorization": f"Bearer {kitchen_token}"}
    cashier_headers = {"Authorization": f"Bearer {cashier_token}"}

    print_step("2. Customer: Quét mã QR - Lấy/Tạo Session cho Bàn 1")
    session_res = req("GET", "/tables/1/session")
    session_id = session_res["data"]["session_id"]
    print(f"[OK] Session ID: {session_id}")

    customer_headers = {"X-Session-ID": str(session_id)}

    print_step("3. Customer: Xem Menu")
    menu_res = req("GET", "/menu")
    items = menu_res["data"]["items"]
    print(f"[OK] Lay thanh cong {len(items)} mon an")
    item1_id = items[0]["id"]
    item2_id = items[1]["id"]

    print_step("4. Customer: Đặt món")
    order_data = {
        "items": [
            {"item_id": item1_id, "quantity": 1, "notes": "Khong cay"},
            {"item_id": item2_id, "quantity": 2}
        ]
    }
    order_res = req("POST", "/orders", order_data, customer_headers)
    order_id = order_res["data"]["order_id"]
    print(f"[OK] Da tao Order ID: {order_id}, Tong tien: {order_res['data']['total_price']}")

    print_step("5. Customer: Xem chi tiết Order (Lấy order_detail_id)")
    order_detail_res = req("GET", f"/orders/{order_id}", headers=customer_headers)
    details = order_detail_res["data"]["order_details"]
    detail_ids = [d["id"] for d in details]
    print(f"[OK] Lay Order Detail IDs: {detail_ids}")

    print_step("6. Staff: Xác nhận Order")
    confirm_res = req("PATCH", f"/orders/{order_id}/confirm", headers=staff_headers)
    print(f"[OK] Da xac nhan Order. Trang thai: {confirm_res['data']['status']}")

    print_step("7. Kitchen: Cập nhật trạng thái nấu")
    for d_id in detail_ids:
        # confirmed -> cooking
        req("PATCH", f"/order-details/{d_id}/status", {"cooking_status": "cooking"}, kitchen_headers)
        print(f"[OK] Bep: Mon {d_id} dang nau (cooking)")
        # cooking -> done
        req("PATCH", f"/order-details/{d_id}/status", {"cooking_status": "done"}, kitchen_headers)
        print(f"[OK] Bep: Mon {d_id} nau xong (done)")

    print_step("8. Staff: Giao món cho khách")
    for d_id in detail_ids:
        # done -> served
        req("PATCH", f"/order-details/{d_id}/served", headers=staff_headers)
        print(f"[OK] Phuc vu: Mon {d_id} da giao (served)")

    print_step("9. Customer: Yêu cầu thanh toán")
    payment_req_res = req("POST", f"/sessions/{session_id}/payment-request", headers=customer_headers)
    print(f"[OK] Session status: {payment_req_res['data']['status']}")

    print_step("10. Cashier: Xem hóa đơn")
    invoice_res = req("GET", f"/sessions/{session_id}/invoice", headers=cashier_headers)
    total_due = invoice_res["data"]["total"]
    print(f"[OK] Hoa don tong cong: {total_due}")

    print_step("11. Cashier: Thực hiện thanh toán")
    pay_data = {
        "session_id": session_id,
        "amount": float(total_due),
        "payment_method": "cash"
    }
    pay_res = req("POST", "/payments", pay_data, cashier_headers)
    print(f"[OK] Da thanh toan. Payment ID: {pay_res['data']['payment_id']}")

    print_step("12. Cashier: Đóng Session và Giải phóng bàn")
    close_res = req("PATCH", f"/sessions/{session_id}/close", headers=cashier_headers)
    print(f"[OK] Session status sau khi dong: {close_res['data']['status']}")
    
    reset_res = req("POST", f"/tables/1/reset", headers=cashier_headers)
    print(f"[OK] Table status sau khi reset: {reset_res['data']['status']}")
    
    print("\n[DONE] DA TEST XONG LUONG NGHIEP VU (END-TO-END FLOW) THANH CONG")

if __name__ == "__main__":
    main()
