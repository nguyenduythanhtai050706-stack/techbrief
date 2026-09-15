# Day 12 — Tóm tắt, dịch và phân loại bằng Gemini

## Luồng đã triển khai

RSS → lưu bài gốc → xử lý tối đa 10 bài đang chờ → lưu bản EN/VI và danh mục → vô hiệu cache → feed/trang đọc chọn bản theo ngôn ngữ.

- Model mặc định `gemini-3.5-flash-lite`. Google từ chối `gemini-2.5-flash-lite` với tài khoản mới bằng HTTP 404 và đề nghị model này.
- `GeminiBriefService` dùng REST generateContent với JSON schema, timeout 45 giây, giới hạn đầu vào/đầu ra và kiểm tra dữ liệu sau khi nhận.
- Khóa lấy từ `GEMINI_API_KEY`, chỉ gửi qua header tới Google; không gửi xuống web hoặc ghi vào log.
- Hướng dẫn AI chỉ dựa vào tiêu đề và đoạn trích RSS, không tự đọc toàn bộ bài gốc. Dữ liệu RSS được coi là nội dung, không phải lệnh.
- Migration 005 giữ nguyên title/summary/categories gốc, thêm translations, ai_categories và metadata xử lý.
- `effective_categories` ưu tiên danh mục AI khi đã có; fallback về phân loại nhãn RSS cho bài chưa xử lý. Query list, COUNT và detail cùng sử dụng cột này.
- API trả cả hai bản trong `translations.en` và `translations.vi`; frontend đổi bản ngay trong bộ nhớ. Không cần thêm locale vào cache key vì cùng một payload chứa cả hai ngôn ngữ.
- Cache namespace v3, tăng version sau mỗi lần lưu thành công.

## Tránh xử lý trùng và lỗi

- Database hash theo title/summary. Bài đã xử lý với nội dung không đổi sẽ không gọi AI lại.
- Claim bằng UPDATE + FOR UPDATE SKIP LOCKED, lease 2 phút và token sở hữu. Kết quả chỉ được lưu nếu token/hash vẫn khớp.
- Request lỗi không ghi đè bản dịch cũ. Retry sau 1 giờ; lỗi HTTP/quota dừng batch hiện tại.
- Không có key thì enrichment trả disabled; ingestion và đọc bài vẫn hoạt động.
- Bài chưa có bản dịch được ghi nhãn nội dung gốc trên feed và trang đọc.
- Danh mục là suy luận AI, có thể sai; đã hướng dẫn không phân loại phim hoặc tin về lãnh đạo doanh nghiệp thành Products chỉ vì có từ reviews/company.

## Chạy

Trong `apps/api/.env` đặt key (file được Git bỏ qua). Không đặt key trong VITE_*.

Từ thư mục dự án:

```powershell
pnpm --dir apps/api db:migrate
pnpm --dir apps/api articles:enrich
```

`articles:enrich` xử lý tối đa 10 bài mỗi lần, không khởi động scheduler. Lặp lại nếu còn bài chưa xử lý. Sau ingestion thành công, cùng service tự xử lý tối đa 10 bài đang chờ. HTTP ingestion vì thế có thể mất thêm thời gian gọi AI.

Sau khi backend nạp code mới, reload frontend để đọc payload mới.

## Kiểm tra

- Unit: response JSON, ngôn ngữ, danh mục hợp lệ, thiếu key, quota và output bị cắt; lưu kết quả, invalidation, pending/disabled; ingestion gọi enrichment.
- PGlite: migration chạy hai lần, token claim, chống xử lý trùng, hash thay đổi, retry, bản dịch và filter/COUNT/detail từ danh mục mới.
- Web: test chọn title/summary đúng ngôn ngữ và fallback cho bài chưa xử lý; lint/build.
- Live: migration đã áp dụng lên database local; batch đầu thành công 10 bài. Đã kiểm tra API trả bản tiếng Việt và nhóm AI/Products khác Technology.
- Kết quả cuối: 116 unit tests API, 2 tests web, API/web build, web lint và hai smoke SQL đạt.
- Database có 11/11 bản ghi song ngữ (10 bài The Verge và 1 fixture cũ); nhóm AI: 5, Products: 5, Technology: 4. Một bài có thể thuộc nhiều nhóm.
- Browser live: lọc AI, đổi VI thay cả tiêu đề/tóm tắt, mở `/articles/7` đọc bản tóm tắt tiếng Việt thành công.
- Đã rà soát các bản dịch, xử lý lại sáu bài sau khi cải thiện prompt và sửa một ký tự lạ trong bản dịch bài 9.
- Chạy lại enrichment sau khi khởi động lại dịch vụ: `processed: 0, failed: 0`, không xử lý trùng.

## Giới hạn

- Bản tóm tắt chỉ phản ánh phần RSS cung cấp, không đảm bảo bao quát bài đầy đủ.
- Free tier có quota theo tài khoản/model. Ứng dụng không tự nâng gói hoặc bật billing. Nội dung gửi trên free tier có thể được Google dùng cải thiện sản phẩm.
- Đây là worker theo batch cho project local; không thêm endpoint HTTP mới cho enrichment riêng.
- [Google pricing](https://ai.google.dev/gemini-api/docs/pricing)
- [GenerateContent API](https://ai.google.dev/api/generate-content)
