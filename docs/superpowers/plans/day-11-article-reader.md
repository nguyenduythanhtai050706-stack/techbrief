# Day 11 — Trang đọc TechBrief

## Bước 1: Trang đọc nội bộ

- Tiêu đề trong Feed liên kết đến `/articles/:id`.
- App xử lý điều hướng nội bộ bằng History API; nghe `popstate` để hỗ trợ Back/Forward.
- Feed vẫn được mount nhưng ẩn khi đọc bài, giữ bộ lọc và các trang đã tải khi quay lại trong cùng phiên.
- ArticleReader gọi `GET /articles/:id`, hủy request khi rời bài, hiển thị loading/404/error và nút thử lại.
- Nội dung RSS được chuyển thành văn bản, không render HTML nguồn trực tiếp.
- Có đường quay lại feed và đường mở bài gốc. Thanh đổi ngôn ngữ vẫn hiện.
- Hiện nội dung là đoạn trích RSS, chưa phải bản dịch hoặc bản tóm tắt AI. Nhãn trang đọc phản ánh giới hạn này.

## Kiểm tra

- Web lint và build đạt.
- Browser QA bằng fixture: chọn Products, mở bài, đổi sang VI, quay lại vẫn giữ Products và VI.
- Reload URL bài trực tiếp đạt; ID 999 hiện Article not found.
- Chưa kiểm tra trang đọc với backend thật trong bước này; Vite cổng 5173 chưa chạy.
- Fixture hỗ trợ `QA_PORT` để chạy độc lập khi cổng 5174 đang bận.

## Điểm học và kiểm tra của người dùng

Chạy web, bấm tiêu đề rồi quay lại feed. Đọc cách `pushState` đổi URL và `popstate` cập nhật giao diện trong App.tsx.
Trạng thái feed được giữ nhờ component còn mount; reload toàn trang sẽ khởi tạo trạng thái lại.

## Các bước còn lại

1. Tích hợp Gemini ở backend với key từ biến môi trường; kiểm tra quota/model khả dụng.
2. Lưu tiêu đề và tóm tắt EN/VI cùng danh mục suy luận từ nội dung vào database.
3. Xử lý cả bài đã lưu; tránh gọi AI lại khi nội dung không đổi.
4. Cho API và giao diện chọn nội dung theo locale; cập nhật bộ lọc, COUNT và cache theo danh mục mới.
5. Kiểm tra với RSS thật, bản dịch, quota/lỗi và bản ghi trùng.
