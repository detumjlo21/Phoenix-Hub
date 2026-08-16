# PHOENIX HUB AUTH V5 — UID GAME + MẬT KHẨU

## Flow mới

### Đăng ký
UID Free Fire + Tên ingame + Tên hiển thị + Nhánh + Mật khẩu
→ Supabase Auth tạo account
→ gửi yêu cầu BQT
→ BQT duyệt

### Đăng nhập
UID Free Fire + Mật khẩu
→ nếu member active → vào Hub
→ pending/rejected → báo trạng thái

Người dùng KHÔNG thấy email. Web tạo email nội bộ:
`<UID>@member.phoenix.local`

## Cài đặt

### 1. Supabase SQL
Chạy:
`supabase/auth-v5-id-password.sql`

### 2. TẮT Confirm email
Supabase → Authentication → Sign In / Providers → Email
→ tắt "Confirm email"

Điều này bắt buộc vì tài khoản dùng email nội bộ, không có inbox thật.

### 3. Upload source
Upload toàn bộ source V5 lên GitHub.
Vercel tự deploy.

### 4. Test
- `/join.html` đăng ký UID mới
- `/admin.html` duyệt
- `/login.html` đăng nhập UID + password
- vào Hub

## Member cũ
Member anonymous cũ KHÔNG tự có mật khẩu.
Hãy test V5 bằng UID mới trước.
Sau khi ổn, có thể tạo quy trình migration/reset password cho member cũ.

## Anonymous
Chưa nên tắt anonymous ngay nếu bạn còn member cũ đang dùng.
Sau khi migration xong mới tắt.
