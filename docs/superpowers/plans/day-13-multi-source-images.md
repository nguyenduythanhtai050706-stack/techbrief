# Day 13 — Ảnh bài viết và nhiều nguồn RSS

## Mục tiêu

- Xóa dữ liệu fixture khỏi database chạy thật.
- Lấy ảnh bài viết từ RSS/Atom và hiển thị ở feed lẫn trang đọc TechBrief.
- Thêm ba nguồn công nghệ: Ars Technica, Engadget và WIRED.
- Giữ The Verge làm nguồn mặc định hiện có.

## Thiết kế

Ảnh được ưu tiên theo thứ tự `media:thumbnail`, `media:content`, `enclosure`,
`content:encoded`, rồi `content`. Chỉ URL tuyệt đối dùng giao thức HTTP hoặc HTTPS
được lưu. Server lưu URL thay vì tải file ảnh để database nhẹ và ingestion nhanh.

Các nguồn mặc định nằm trong migration `006_seed_default_sources.sql` với
`ON CONFLICT DO NOTHING`, vì vậy chạy migration nhiều lần không tạo bản ghi trùng.

TechCrunch đã được thử nhưng RSS không cung cấp ảnh. Engadget được chọn thay thế vì
feed chính thức có cả `media:thumbnail`, `enclosure` và ảnh trong
`content:encoded`.

## Kiểm tra dữ liệu thật

- 4/4 nguồn fetch thành công.
- 100 mục RSS được đọc trong một lần ingestion.
- Database có 101 bài và 101/101 bài có `image_url`.
- Gemini xử lý thêm 22 bài rồi trả `HTTP 429`; pipeline dừng để bảo vệ quota miễn
  phí. Hiện 48/101 bài có tóm tắt song ngữ; bài chưa xử lý tiếp tục dùng title và
  excerpt gốc.

## Lệnh kiểm tra

```powershell
cd apps/api
pnpm test
pnpm build
pnpm db:migrate

cd ../web
pnpm test
pnpm lint
pnpm build
```
