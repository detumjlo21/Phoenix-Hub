# WATCH PARTY V2.1 - YouTube Error 153 Fix

Không cần chạy SQL.

Đã sửa:
- thêm `origin: window.location.origin`
- thêm `widget_referrer: window.location.href`
- ép `cueVideoById()` sau khi YouTube iframe sẵn sàng
- thêm onError để phân biệt 100 / 101 / 150 / 153

Cài:
1. Upload toàn bộ source lên GitHub.
2. Chờ Vercel Ready.
3. Mở Hub bằng Chrome/Edge/Safari bình thường để test trước.
4. Nếu Messenger in-app browser vẫn báo 153, mở bằng Chrome vì WebView có thể không gửi referrer ổn định.
