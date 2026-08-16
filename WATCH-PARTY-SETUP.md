# PHOENIX Watch Party YouTube V1

1. Supabase > SQL Editor: chạy toàn bộ `supabase/watch-party-youtube.sql`.
2. Upload toàn bộ source này lên GitHub (đè bản hiện tại).
3. Chờ Vercel Production `Ready`, rồi F5.
4. Bấm `+ Tạo phòng` ở Phòng xem phim, dán link YouTube.

Tính năng V1:
- YouTube link: youtube.com/watch, youtu.be, Shorts, Live.
- Mật khẩu tùy chọn, phòng tự hết hạn.
- Host Play/Pause/tua; trạng thái được lưu và broadcast cho thành viên.
- Thành viên vào muộn được đồng bộ theo trạng thái hiện tại.
- Presence hiển thị người đang xem.
- Host đóng phòng.

Lưu ý: video phải cho phép nhúng (embed). Một số video YouTube bị chủ kênh/YouTube chặn embed sẽ không phát trong Hub.
