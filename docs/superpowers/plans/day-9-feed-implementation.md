# Day 9 — Feed có ảnh

Đã nối trang chủ với GET /articles (12 bài/trang). Bố cục gồm một bài mới nhất,
hai bài kế tiếp và danh sách còn lại. Nút xem thêm loại bỏ ID trùng giữa các trang.
Nhãn hỗ trợ EN/VI; nội dung nguồn giữ nguyên ngôn ngữ gốc.

Ảnh lấy từ media:thumbnail, media:content có kiểu ảnh, hoặc enclosure image/*.
Chỉ chấp nhận HTTP(S). Không tải ảnh về server. Không có ảnh hoặc ảnh tải lỗi:
card dùng bố cục chữ. Summary được chuyển thành văn bản, không chèn HTML nguồn.

Migration 003_add_article_images.sql thêm cột nullable, chạy bằng script db:migrate.
Bài cũ được bổ sung ảnh khi ingestion gặp lại cùng canonical URL; ảnh đã có được giữ.
Các bài chỉ có ảnh trong HTML hoặc Open Graph chưa được trích xuất trong bước này.

Development: chạy API cổng 3000 và Vite; Vite proxy /api sang API.
Production: cấu hình reverse proxy /api hoặc VITE_API_URL lúc build và CORS phía API
nếu dùng khác origin. Các liên kết bài viết hiện dẫn trực tiếp đến nguồn gốc.

Kiểm tra: API unit tests/build, frontend lint/build; thử các trạng thái tải,
lỗi/thử lại, rỗng, có ảnh/ảnh hỏng, phân trang và đổi ngôn ngữ/theme.

Kết quả: 94 test API đạt; API/web build và web lint đạt. Browser QA với dữ liệu
mẫu xác nhận tải thêm bài thứ 5, không lặp bài thứ 4, hiển thị ảnh chính và
fallback ảnh hỏng; thông báo lỗi API đổi đúng EN/VI.
Chạy `node test/feed-preview.mjs` tại apps/web để mở fixture ở cổng 5174.

PostgreSQL và Redis thực tế đã healthy. Cả 3 migration đã chạy thành công.
Database local có schema cũ: sources.feed_url và articles.content_hash.
Đã đổi tên lần lượt thành url và content_fingerprint trong một transaction,
giữ nguyên dữ liệu và ràng buộc. Đây là sửa schema local; migration hiện tại
chưa tự chuyển đổi các database khác còn dùng tên cột cũ.
Smoke test persistence đạt sau khi đồng bộ schema, với scheduler tắt trong
tiến trình kiểm thử. Script migration đã tách khỏi AppModule để không khởi tạo scheduler.
API unit tests: 94/94 đạt khi chạy ngoài sandbox; sandbox chặn đọc luxon.
API build, web lint/build đạt.

Browser QA bổ sung: UI cổng 5173 đọc được bài fixture trong PostgreSQL qua
Vite proxy và API thật; GET /health trả postgres/redis up. Không ghi nhận
console error trên tab API thật. Database hiện có một bài, chưa xác minh
luồng từ RSS công khai đến UI trong lượt này.
Trang QA riêng cổng 5174 xác nhận ảnh chính tải được, ảnh hỏng bị loại bỏ,
Xem thêm hiển thị 5 bài duy nhất và ẩn nút khi hết trang. EN/VI và theme hoạt động.
Đã kiểm tra viewport 320, 375, 390, 768 và 1440px. Phát hiện min-width: 320px
ở html/body/#root gây tràn khi thanh cuộn chiếm 15px; đổi thành min-width: 0.
Sau sửa, viewport 320px có clientWidth = scrollWidth = 305px; không tràn ngang.
Đã chạy lại web lint/build thành công. Đây là kiểm tra viewport trên trình duyệt
desktop, chưa phải kiểm tra trên thiết bị iOS/Android thật.

Tinh chỉnh giao diện: bỏ tiêu đề hiển thị Dòng tin/The feed, giữ aria-label
cho section; giảm khoảng cách giữa phần giới thiệu và hộp tin còn 24px.
Đã xác minh trên trình duyệt và chạy lại web lint/build thành công.
