# AUTH V5.2 — BQT XEM TÀI KHOẢN + RESET MẬT KHẨU

Supabase KHÔNG thể hiển thị mật khẩu hiện tại vì mật khẩu được hash.
Bản này làm theo cách an toàn:

- BQT thấy rõ `Tài khoản: UID`.
- Có nút `Đặt lại MK`.
- BQT nhập mật khẩu mới rồi đưa cho member.
- Mật khẩu mới được đổi bằng Supabase Admin API trên Vercel.
- Service Role key không bao giờ đưa ra frontend.

## Cần thêm 1 Environment Variable trên Vercel

Vercel -> Project -> Settings -> Environments -> Production -> Environment Variables

Key:
`SUPABASE_SERVICE_ROLE_KEY`

Value:
Supabase -> Project Settings / API Keys -> `service_role` / Secret key có quyền admin.

CỰC KỲ QUAN TRỌNG:
- Không gửi key này vào chat.
- Không đưa key vào GitHub.
- Chỉ lưu trong Vercel Environment Variables.

Sau khi thêm env:
1. Redeploy Vercel.
2. Upload source V5.2 lên GitHub.
3. Vào `/admin.html`.
4. Thành viên -> `Đặt lại MK`.

Không cần chạy SQL mới cho V5.2.
