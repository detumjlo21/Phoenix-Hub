# PHOENIX Hub — Approval Version

Frontend: HTML/CSS/JS + GitHub Pages  
Backend/Data: Supabase  
Voice later: LiveKit

## Chức năng ở bản này

- 1 link đăng ký chung: `join.html`
- Thành viên nhập Tên ingame + UID + Nhánh
- Yêu cầu chuyển sang `pending`
- Chủ / Quyền chủ duyệt nhánh của mình
- Tổng quản duyệt cả 3 nhánh
- Sau khi duyệt, thiết bị tự nhận diện và vào Hub
- UID trùng sẽ bị chặn
- Nhánh đủ 55 người sẽ không duyệt thêm
- Heartbeat online mỗi 45 giây

## Cài đặt

1. Supabase Anonymous Sign-ins phải bật.
2. Chạy:
   `supabase/approval-system.sql`
3. Upload toàn bộ file mới lên GitHub repo, ghi đè bản cũ.
4. GitHub Pages sẽ tự deploy lại.

## Quan trọng: tạo tài khoản Founder / Tổng quản đầu tiên

Bản cũ dùng invite token. Bạn vẫn cần dùng link invite cũ MỘT LẦN cho chính bạn để tạo member Chủ Nhánh 1.

Sau khi bạn đã vào được Hub với role `owner` Nhánh 1:

- mở `admin.html`
- bấm `Nhận quyền Tổng quản`

Từ đó bạn có quyền duyệt cả 3 nhánh.

Các Chủ Nhánh 2/3 về sau có thể được đổi role trong Supabase từ `member` → `owner`.
Quyền chủ dùng `co_owner`.

## Link chung để ghim Messenger

Sau khi GitHub Pages deploy:

`https://detumjlo21.github.io/Phoenix-Hub/join.html`

Bạn chỉ cần ghim một link này cho toàn bộ cộng đồng.
