# WATCH PARTY V2.2 — LOW LATENCY SYNC

Mục tiêu: giảm độ lệch Host ↔ thành viên.

Thay đổi:
- Host cập nhật trạng thái mỗi 500ms.
- Viewer kiểm tra trạng thái mỗi 500ms.
- Nếu viewer lệch quá 0.35 giây sẽ tự seek về Host.
- Vẫn tính thời gian thực từ `updatedAt` khi video đang chạy.
- Chỉ Host được Play / Pause / tua.
- Giữ nguyên YouTube Error 153 fix và LiveKit mic từ V2.1.

Cài đặt:
1. KHÔNG cần chạy SQL mới.
2. Upload toàn bộ source lên GitHub.
3. Chờ Vercel Ready.
4. Hard refresh rồi test bằng 2 thiết bị/tài khoản.

Lưu ý:
YouTube iframe và mạng của từng thiết bị có độ trễ riêng, nên không thể bảo đảm 0ms.
