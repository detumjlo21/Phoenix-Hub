# HOTFIX cần làm

## 1. Supabase
Mở `supabase/fix-member-rls.sql`, copy toàn bộ vào SQL Editor và Run.

Nguyên nhân lỗi:
Policy SELECT cũ trên `members` tự query lại chính bảng `members`, gây lỗi RLS recursion.
Trang join chỉ nhìn thấy request `approved`, nhưng trang Hub không đọc được member thật.

Hotfix:
- Member chỉ SELECT hồ sơ của chính mình.
- Thống kê 3 nhánh dùng `get_branch_stats()` SECURITY DEFINER.
- Không mở toàn bộ bảng member/UID ra frontend.

## 2. GitHub
Upload đè:
- `js/app.js`
- `js/join.js`

Có thể upload nguyên ZIP này để đồng bộ toàn bộ repo.

## 3. Test
Sau khi GitHub Pages deploy:
- Giữ nguyên cửa sổ test member đã được duyệt.
- Ctrl + F5 ở trang Hub.
- Phải hiện giao diện Hub, tên member và Nhánh 1 thay vì màn "chưa được duyệt".
