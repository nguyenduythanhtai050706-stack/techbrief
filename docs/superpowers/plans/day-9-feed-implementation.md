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
fallback ảnh hỏng; thông báo lỗi API đổi đúng EN/VI. Chưa kiểm tra đầy đủ mobile.
Chạy `node test/feed-preview.mjs` tại apps/web để mở fixture ở cổng 5174.

Migration thực tế còn bị chặn: PostgreSQL localhost:5432 không sẵn sàng và
Docker Desktop Linux engine chưa chạy. Script migration đã tách khỏi AppModule
để không khởi tạo scheduler. Khi Docker hoạt động, chạy docker compose up -d,
sau đó npm --prefix apps/api run db:migrate trước khi chạy API phiên bản này.
