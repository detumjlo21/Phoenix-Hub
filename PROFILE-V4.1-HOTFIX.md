# PROFILE V4.1 HOTFIX

1. Supabase SQL Editor:
   chạy `supabase/profile-v4.1-hotfix.sql`

2. Upload toàn bộ source V4.1 lên GitHub.
   Vercel tự deploy.

3. Mở Hub lại.
   Trang Hub sẽ lấy member bằng RPC `get_my_member_profile()`
   thay vì SELECT trực tiếp bảng members.

Nếu còn lỗi, màn Hub sẽ hiện chính lỗi Supabase thật thay vì giả thành
"Bạn chưa là thành viên được duyệt".
