# BQT DASHBOARD V2

## Chức năng mới
- Duyệt / từ chối thành viên.
- Danh sách thành viên theo phạm vi quyền.
- Tìm theo tên / UID.
- Đổi tên hiển thị + tên ingame.
- Xóa thành viên.
- Danh sách Voice room + Watch Party đang hoạt động.
- Xóa room.
- Dashboard thống kê nhanh.

## Phạm vi quyền
- Tổng quản: quản lý cả 3 nhánh.
- Chủ QĐ / Quyền chủ: chỉ quản lý nhánh của mình.
- Admin nhánh không được xóa Chủ QĐ / Quyền chủ.
- Không cho xóa Tổng quản hoặc tự xóa tài khoản đang đăng nhập.

## Cài đặt
1. Supabase SQL Editor: chạy `supabase/bqt-dashboard-v2.sql`.
2. Upload toàn bộ source lên GitHub.
3. Chờ Vercel Ready.
4. Mở `/admin.html`.

## Lưu ý xóa thành viên
`voice_rooms` và `watch_rooms` dùng FK ON DELETE CASCADE theo host nên room do member đó tạo sẽ bị xóa cùng.
