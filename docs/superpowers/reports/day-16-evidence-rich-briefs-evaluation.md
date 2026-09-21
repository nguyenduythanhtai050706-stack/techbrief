# Day 16 — Hướng dẫn đánh giá evidence-rich briefs

## Cổng tự động

Chạy migration, ingestion và enrichment theo batch nhỏ trước:

```powershell
pnpm --dir apps/api db:migrate
pnpm --dir apps/api articles:enrich
pnpm --dir apps/api evaluate:briefs
```

`articles:enrich` xử lý tối đa 10 bài mỗi lần. Không chạy lặp tự động khi provider
báo quota hoặc lỗi. `evaluate:briefs` chỉ đọc dữ liệu và yêu cầu 12–20 bài V2 từ
ít nhất bốn nguồn.

Evaluator dựng lại evidence packet từ database và kiểm tra:

- schema V2, số từ và số key point;
- mọi evidence ID còn tồn tại;
- số và đơn vị trong output có trong evidence tương ứng;
- số liệu giữa EN và VI tương đương;
- URL nguồn được hydrate từ provenance;
- loại evidence đã dùng: RSS full, RSS excerpt, page hoặc unavailable.

## Review thủ công bắt buộc

Với từng bài có trạng thái `pass`, mở bài nguồn và xác nhận ba mục mà regex không
thể chứng minh đầy đủ:

1. Attribution của dự báo, cáo buộc và phát biểu bên thứ ba được giữ nguyên.
2. Không có claim định tính nào không tìm thấy trong evidence.
3. Bản VI tương đương bản EN về ý nghĩa và mức độ chắc chắn.

Dừng rollout ngay khi gặp hallucination, URL sai provenance, lỗi provider hoặc
quota. Chỉ chạy batch tiếp theo sau khi toàn bộ bài trong batch hiện tại đạt cả
cổng tự động lẫn review thủ công.

## Trạng thái môi trường hiện tại

- Golden fixtures và unit tests đã bao phủ tám nhóm rủi ro trong kế hoạch.
- Migration được chạy hai lượt thành công trên database tạm.
- Migration 007–008 đã được áp dụng thành công lên database local.
- Evaluator đã chạy và dừng với `EVALUATION_SAMPLE_TOO_SMALL:0`; database chưa có
  brief V2 để review.
- Live enrichment cần phê duyệt rõ việc gửi title và evidence bài thật tới Gemini.
  Sau khi có ít nhất 12 brief V2, chạy lại evaluator và hoàn tất review thủ công.
