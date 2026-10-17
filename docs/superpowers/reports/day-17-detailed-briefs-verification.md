# Day 17 — Kiểm chứng detail có chiều sâu và dẫn chứng

## Hành vi đã thay đổi

- Detail được yêu cầu giải thích sự kiện, diễn biến hoặc thay đổi cụ thể, bối cảnh,
  tác động được nguồn hỗ trợ và điều chưa được xác nhận. Phát biểu của công ty
  hoặc bên thứ ba phải giữ attribution và mức độ chắc chắn.
- Detail phải dài hơn title và feed preview, có thêm từ ngoài các phần này.
  Validator chặn việc lặp nguyên các từ của title hoặc preview để kéo dài detail.
- Mỗi ngôn ngữ phải có 3–5 ý chính, không trùng nhau sau khi chuẩn hóa chữ hoa,
  dấu câu và khoảng trắng. Mọi ý phải tham chiếu evidence ID do server cấp.
- Khi nguồn không đủ ba dữ kiện độc lập, các ý còn lại chỉ được chỉ ra những
  thông tin cụ thể còn thiếu trong nguồn được cung cấp. Không suy diễn rằng công
  ty chưa công bố thông tin ở nơi khác.
- Số liệu trong title, preview và detail phải có trong evidence được dẫn bởi các
  ý chính của chính ngôn ngữ đó. Đây là các evidence có liên kết được trả cho UI.
  URL vẫn được ghép từ provenance đã lưu, không lấy URL do model tạo.
- Các cách viết tương đương `32%`, `32 percent`, `32 phần trăm`, `180 ms`,
  `180 milliseconds`, `180 mili giây` được nhận diện, nhưng thay số vẫn bị từ chối.

## Độ dài và xử lý lỗi

- Nguồn đầy đủ: preview 25–60 đơn vị đếm theo dấu cách; detail EN 120–220,
  detail VI 120–360. Prompt hướng bản Việt tới 180–360 để giữ đủ ý.
- Giới hạn bản Việt rộng hơn vì dấu cách còn phân tách âm tiết. Không bắt bản dịch
  cắt dữ kiện chỉ để có số đơn vị đếm bằng tiếng Anh.
- Nguồn giới hạn: detail ngắn, yêu cầu 2–3 câu có ích; vẫn dài hơn preview và title.
- Nếu đầu ra sai giới hạn độ dài, gửi lại số đếm thực tế để sửa tối đa một lần.
  Kết quả sau sửa vẫn phải qua toàn bộ validator. Không lặp với lỗi evidence hay
  provider/quota; lỗi quota trong lần sửa vẫn được giữ nguyên để batch dừng.
- Đã bỏ enum số không hợp lệ khỏi schema gửi Gemini. `schemaVersion` vẫn là
  INTEGER ở request và bắt buộc bằng `2` trong validator. Lỗi này được phát hiện
  bằng phản hồi HTTP 400 thật và đã có test hồi quy. Xem hợp đồng `enum[]` trong
  [Gemini Schema reference](https://ai.google.dev/api/generate-content#Schema).
- Phiên bản prompt là `day-17-v2`, nên worker sẽ chọn lại các bản dùng prompt cũ.

## Kiểm chứng

- API: 26 suite, 181 test qua.
- Web: 6 test qua, gồm vòng EN → VI → EN với detail, số liệu và dẫn chứng.
- Build API và web qua; lint web và lint các file API thay đổi qua.
- `smoke:briefs` qua: migration hai lượt, claim, lưu song ngữ, thay input,
  chống ghi kết quả cũ và khoảng chờ retry.

Đã gọi Gemini thật với dữ liệu do dự án tự tạo, không lưu thành bài báo:

| Mẫu | Detail EN | Detail VI | Ý chính mỗi ngôn ngữ | Kết quả |
| --- | ---: | ---: | ---: | --- |
| Nguồn đầy đủ | 182 | 297 | 4 | Giữ `32%`, `180 ms`, benchmark nội bộ và thiếu kiểm chứng độc lập |
| Nguồn giới hạn | Ngắn | Ngắn | 3 | Không thêm số; nêu thiếu thông số và thông tin khả dụng trong nguồn |

Số đếm trong bảng dùng khoảng trắng, không phải tokenizer ngôn ngữ học.
Mẫu đầy đủ cần một lượt sửa độ dài và qua validator sau tổng cộng hai request.

- [Input giả lập](../../../apps/api/test/fixtures/day-17-detail-evidence.json).
- [Đầu ra đầy đủ song ngữ](day-17-detail-sample.json).
- [Đầu ra nguồn giới hạn](day-17-limited-detail-sample.json).

Các mẫu có `fixtureOnly` và `notRealNews`; URL `.example` chỉ là provenance giả
lập để kiểm tra việc ghép link, không phải nguồn tin thật có thể truy cập.

## Giới hạn và bước kiểm tra dữ liệu đang lưu

Việc so từ mới chỉ chặn các kiểu sao chép đơn giản; kiểm tra số và evidence ID
không chứng minh mọi phát biểu định tính đều đúng, cũng không chứng minh bản
dịch tương đương hoàn toàn. Vẫn cần đọc đối chiếu bài thật khi đánh giá chất lượng.

Kiểm tra kết nối PostgreSQL của cấu hình hiện tại trả `ECONNREFUSED`. Vì vậy chưa
thể tạo lại các bài đang lưu hay đánh giá chất lượng trên tập bài thật.

Khi PostgreSQL hoạt động lại, khởi động lại API nếu nó đang chạy bằng bản build
cũ, rồi chạy một batch trước:

```powershell
pnpm --dir apps/api articles:enrich
```

Lệnh xử lý tối đa 10 bài. Sau khi có đủ mẫu đã xử lý lại, chạy
`pnpm --dir apps/api evaluate:briefs` và review nội dung EN/VI với bài gốc.
Nếu V2 không hợp lệ, luồng hiện có vẫn giữ bản cũ đang hiển thị.
