# PROFILE + AVATAR V4

## 1. Supabase
Chạy file:
`supabase/profile-avatar.sql`

File này:
- thêm `bio` vào members
- tạo Storage bucket `avatars`
- giới hạn avatar JPG/PNG/WEBP, tối đa 3MB
- chỉ user được upload vào folder của chính auth.uid()
- profile update qua RPC an toàn
- heartbeat chuyển sang RPC
- khóa UPDATE trực tiếp bảng members để member không tự sửa role/branch/admin

## 2. GitHub
Upload đè toàn bộ source trong ZIP lên repo.
Vercel tự deploy.

## 3. Sử dụng
Trên Hub, bấm card/avatar góc phải để mở Profile.

Có thể chỉnh:
- Avatar
- Tên hiển thị
- Tên ingame
- Bio

Chỉ xem:
- UID Free Fire
- Nhánh
- Vai trò
