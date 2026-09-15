# Day 15 — Chữ tiếng Việt ở tiêu đề bài đọc

## Vấn đề

Tiêu đề tiếng Việt trên trang đọc dùng cùng `letter-spacing: -0.055em` với hero
tiếng Anh. Khoảng cách âm lớn làm dấu thanh trông như bị tách khỏi ký tự trong
một số trình duyệt và font serif.

## Cách sửa

`ArticleReader` và `Feed` khai báo `lang` theo locale. CSS chỉ đặt
`letter-spacing: normal` và dùng Times New Roman cho tiêu đề tiếng Việt, tránh
font Georgia đang render sai dấu thanh; tiêu đề tiếng Anh và các phần còn lại giữ
nguyên kiểu hiện có.

Chuỗi API được kiểm tra là Unicode ghép sẵn, nên không cần thay đổi bản dịch hay
gọi lại Gemini.
