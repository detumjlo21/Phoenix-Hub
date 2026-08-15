# PHOENIX Hub - Admin Email/Password

- Member thường: anonymous session + BQT duyệt.
- Admin/BQT: email + password qua Supabase Auth.
- Password không lưu trong GitHub hoặc JavaScript.

## Cài đặt

1. Supabase -> Authentication -> Users -> Add user -> Create new user.
2. Tạo email + password Admin.
3. Mở `supabase/link-admin-login.sql`, thay `YOUR_ADMIN_EMAIL`, rồi Run.
4. Nếu chưa chạy hotfix RLS trước đó, chạy `supabase/fix-member-rls.sql`.
5. Upload toàn bộ source mới lên GitHub. Vercel sẽ tự deploy.
6. Mở `/admin.html` và đăng nhập.

Không nhập password vào SQL hoặc GitHub.
