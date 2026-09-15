# Day 14 — Gom tin trùng giữa nhiều nguồn

## Vấn đề

Các báo có thể cùng viết về một sự kiện nhưng dùng URL, tiêu đề và đoạn mô tả khác
nhau. Dedup theo canonical URL hoặc hash nội dung không nhận ra trường hợp này, ví
dụ ba bài về Volvo XC60/XC90 từ Ars Technica, Engadget và The Verge.

## Thiết kế

Sau canonical URL, provenance và content fingerprint, repository tìm tối đa 50
bài từ nguồn khác được xuất bản trong khoảng 12 giờ. Hai tiêu đề được xem là cùng
sự kiện khi:

- có ít nhất ba từ khóa quan trọng chung;
- số từ chung chiếm ít nhất 40% tiêu đề ngắn hơn;
- có ít nhất một từ khóa mạnh chứa số hoặc dài từ sáu ký tự.

Stop words, năm xuất bản và dấu câu bị loại trước khi so sánh. Matcher chỉ gom
khác nguồn để hai bài tiếp nối từ cùng một tòa soạn không bị nhập nhầm.

Khi gom, bài đại diện giữ nội dung, ảnh và canonical URL; các nguồn còn lại được
gắn vào `article_sources`. Lần ingestion sau nhận ra bài đã gom bằng cặp
`source_id + external_id`, nên bản sao không xuất hiện trở lại.

## Dữ liệu đã làm sạch

- Ba bài Volvo được gom vào article ID 126 với ba nguồn.
- Hai bài phát hành iOS/macOS được gom vào article ID 123 với hai nguồn.
- Chạy lại ingestion: 4/4 nguồn thành công, 0 bài mới, 100 bài trùng đã nhận ra.

## Kiểm tra

```powershell
cd apps/api
pnpm test
pnpm build
```
