# WATCH PARTY V2 — HOST SYNC + MIC

## Có gì mới
- Host là người duy nhất Play / Pause / tua.
- Viewer không có YouTube controls và có lớp khóa thao tác.
- Viewer tự sync với Host mỗi 2 giây.
- Host tự publish mốc phát mỗi 2.5 giây, kể cả khi tua lúc video vẫn đang chạy.
- Vào phòng sẽ tự kết nối LiveKit Voice.
- Mic bật/tắt ngay trong Watch Party.
- Nếu Android/Messenger từ chối mic thì vẫn xem phim bình thường.

## Cài
1. Supabase SQL Editor:
   chạy `supabase/watch-party-v2.sql`
2. Upload toàn bộ source lên GitHub.
3. Chờ Vercel Ready.
4. Không cần thêm Environment Variable mới: dùng lại LIVEKIT_URL / API_KEY / API_SECRET hiện có.

## Test
- Host tạo phòng và play/tua.
- Member khác vào phòng.
- Member không tua/play/pause được.
- Member tự nhảy về mốc Host.
- Cả hai bật mic và nói chuyện trong khi xem.
