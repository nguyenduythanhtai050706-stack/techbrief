# Day 10 — Chuẩn hóa danh mục bài viết

## Mục tiêu

Một bài có thể thuộc nhiều nhóm: `AI`, `Products` (Sản phẩm),
`Technology` (Công nghệ). Các nhóm dùng chung cho mọi nguồn RSS.
Frontend dịch nhãn theo EN/VI, nhưng gửi mã danh mục cố định tới API.

## Thiết kế và luồng dữ liệu

1. FeedReader đọc nhãn RSS; `articles.categories` giữ nhãn gốc.
2. Migration `004_normalize_article_categories.sql` thêm hàm SQL ánh xạ nhãn
   và cột `normalized_categories` dạng generated STORED.
3. PostgreSQL tính danh mục chuẩn cho cả bài cũ khi thêm cột và bài mới khi INSERT.
   Khi gặp bài trùng, repository hợp nhất nhãn gốc bằng một UPDATE; cột generated
   tự cập nhật. Tiêu đề, tóm tắt và URL của bài đã lưu được giữ nguyên.
4. Repository trả cột chuẩn dưới tên `categories` trong API list/detail.
   Lọc và COUNT dùng cùng điều kiện trên cột này; có GIN index hỗ trợ tra cứu.
5. Cache chuyển sang `articles:v2` để không đọc lại nhãn chưa chuẩn hóa từ v1.
   Khóa list có bộ lọc; ingestion invalidates các danh mục theo cơ chế version sẵn có.

## Quy tắc ánh xạ

Nhãn được chuyển về chữ thường, chuẩn hóa khoảng trắng, dấu gạch nối và gạch dưới,
sau đó so khớp toàn bộ nhãn. Không dò chuỗi `ai` bên trong các từ như `chair`.

| Ví dụ nhãn nguồn | Danh mục |
| --- | --- |
| Artificial Intelligence, Machine Learning, Generative AI, LLM, Trí tuệ nhân tạo | AI |
| Reviews, Gadgets, Hardware, Software, Apps, Sản phẩm | Products |
| Security, Cybersecurity, Infrastructure, Programming, Engineering, Công nghệ | Technology |
| Không có nhãn hoặc không ánh xạ được nhãn nào | Technology |

Nhãn nhận diện được được hợp nhất, loại trùng và sắp theo thứ tự ổn định.
Ví dụ `Reviews` + `Artificial Intelligence` → `["AI", "Products"]`.
Nhãn chung `Tech` không thêm nhóm phụ khi bài đã có nhãn chuyên biệt.
Đây là phân loại theo metadata, chưa suy luận từ tiêu đề/nội dung và chưa dùng mô hình AI.
Feed không cung cấp nhãn phù hợp có thể vẫn rơi vào nhóm Công nghệ.
Kiểm tra feed tổng `https://www.theverge.com/rss/index.xml` bằng rss-parser:
10 bài trả về không có nhãn `categories`, nên hiện được xếp vào Technology.

## API và giao diện

- `GET /articles?category=AI` (hoặc `Products`, `Technology`).
- Bỏ tham số để lấy tất cả. Giá trị khác, chuỗi rỗng, mảng và kiểu không phải chuỗi bị từ chối.
- Đổi nhóm đưa về trang đầu, xóa lỗi và tổng trang cũ, hủy request cũ.
- Bấm lại nhóm đang chọn giữ nguyên danh sách; nút chọn có `aria-pressed` và màu riêng.
- Đổi EN/VI giữ danh mục đang chọn; bộ nút xuống dòng trên màn hình hẹp.

## Chạy và kiểm tra

Từ `apps/api`:

```sh
npm test -- --runInBand
npm run smoke:categories
npm run build
```

`smoke:categories` dùng PGlite (PostgreSQL nhúng, chỉ là devDependency) trong bộ nhớ,
không cần Docker và không truy cập database của người dùng. Test chạy migration hai lần,
kiểm tra bài cũ, nhãn gốc, aliases, fallback, bài mới/trùng, COUNT, phân trang và bộ lọc nguồn.

Khi PostgreSQL local đã chạy, áp dụng schema trước khi khởi động API mới:

```sh
npm run db:migrate
```

Nếu thay đổi bảng ánh xạ trong tương lai, tạo migration mới cập nhật hàm và tính lại
cột STORED bằng `UPDATE articles SET categories = categories`, rồi invalidates cache.
Chỉ thay hàm sẽ không tự tính lại giá trị đã lưu của cột generated.

Từ `apps/web`: chạy `npm run lint`, `npm run build`, và `node test/feed-preview.mjs`.
Fixture QA tại cổng 5174 có nhóm Products gồm bài 1/4/5 (hai trang), AI gồm 2/4,
Technology gồm 3. Có thể kiểm tra lỗi/thử lại, rỗng, phản hồi chậm bằng URL:
`http://127.0.0.1:5174/?qa-fail=AI&qa-empty=Technology&qa-delay=Products`.
`qa-fail` chỉ lỗi một lần cho mỗi URL trang/danh mục trong vòng đời server.

## Kết quả kiểm tra

- API: 103/103 unit tests đạt; API build, web lint/build đạt.
- Smoke SQL qua PGlite đạt; kiểm tra migration lặp lại, backfill và repository thật.
- Browser fixture: bấm lại danh mục, đổi nhóm sau phân trang, thử lại khi lỗi,
  nhóm rỗng, chuyển nhóm nhanh và EN/VI hoạt động; viewport 320px không tràn ngang.
- Chưa áp dụng migration lên PostgreSQL local: Docker Desktop lỗi khởi động ở socket
  `dockerInference`; lệnh `npm run db:migrate` thất bại với `ECONNREFUSED` ở cổng 5432,
  chưa thay đổi database local. Chưa kiểm tra luồng RSS công khai → PostgreSQL local → UI.

## Điểm học tiếp theo

Đọc hàm `normalize_article_categories` và giải thích vì sao giữ cả nhãn gốc lẫn
danh mục chuẩn. Sau đó tự thêm một alias mới kèm trường hợp kiểm thử trước khi mở rộng
nguồn tin hoặc chuyển sang task trang chi tiết bài.
