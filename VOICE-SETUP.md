# PHOENIX HUB — VOICE LIVEKIT V1

## Bạn cần làm 2 việc

### 1) Supabase
Mở `supabase/voice-rooms.sql` → copy toàn bộ → SQL Editor → Run.

### 2) GitHub
Upload đè toàn bộ bản này lên repo `Phoenix-Hub`.
Vercel sẽ tự deploy.

## Test
Sau khi Vercel Ready:
1. Mở Hub bằng member đã được duyệt.
2. Bấm `+ Tạo voice`.
3. Đặt tên phòng, mật khẩu tùy chọn, giới hạn, thời hạn.
4. Tạo phòng → trình duyệt sẽ xin quyền microphone.
5. Cho phép microphone.
6. Mở thiết bị/tab member khác → bấm Vào → test nói chuyện.

## Bảo mật đã sửa
Endpoint `/api/livekit-token` KHÔNG còn tin `identity` do browser tự gửi.
Nó xác minh Supabase access token và lấy member đã duyệt từ database trước khi cấp LiveKit token.

## V1 hiện có
- Ai là member đã duyệt cũng tạo được voice.
- Password tùy chọn.
- 2–30 người (metadata/giới hạn UI; hard cap LiveKit sẽ bổ sung ở bản cleanup).
- Thời hạn 1h / 3h / 6h / 24h.
- Host có nút đóng phòng.
- Mic on/off, danh sách người trong phòng, rời phòng.
- Phòng hết hạn tự biến mất khỏi danh sách.

## Bước sau
- Hard cap participant.
- Host kick member.
- Tự ẩn phòng trống 15 phút / xóa 30 phút bằng cron.
- Hiển thị số người đang ở từng phòng ngay ngoài Hub.
