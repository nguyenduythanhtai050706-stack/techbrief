# TechBrief: khảo sát và phác họa layout

## 1. Summary

Đề xuất bố cục báo điện tử: header gọn → lời dẫn ngắn → một tin mới nhất lớn và hai tin kế tiếp nhỏ → dòng tin → footer. Glass ở header; clay nhẹ ở tin chính và nút. Đây là đề xuất thiết kế, chưa triển khai feature.

## 2. Assumptions

TechBrief tổng hợp RSS cho người đọc công nghệ. Dựa trên phạm vi đã thống nhất: có danh sách và chi tiết bài; chưa dựa vào ảnh, tìm kiếm, bộ lọc chủ đề, lưu bài hoặc xếp hạng phổ biến. Cần đối chiếu API trước khi code. Ngôn ngữ giao diện độc lập với ngôn ngữ nội dung nguồn.

## 3. Users and jobs to be done

Người đọc bận rộn muốn quét tin, đọc tóm tắt, biết nguồn và mở bài gốc. Người đọc quay lại muốn tiếp tục duyệt mà không mất vị trí.

## 4. User goals and business goals

Người dùng: chọn bài đáng đọc nhanh, kiểm tra xuất xứ thuận tiện. Sản phẩm: tạo thói quen đọc và sự tin cậy; không tối ưu thời gian cuộn vô hạn.

## 5. Experience strategy

Những quan sát dưới đây dựa trên trang được mở trực tiếp và ảnh viewport desktop trong phiên khảo sát; chưa kiểm chứng mobile của các nguồn. Một số ảnh chưa tải nên không dùng làm cơ sở đánh giá hình ảnh.

| Nguồn | Kiểu layout quan sát | Áp dụng cho TechBrief | Đánh đổi |
| --- | --- | --- | --- |
| [Reuters Technology](https://www.reuters.com/technology/) | Tin đầu lớn, tóm tắt và thời gian rõ; danh sách tiếp nối | Thứ bậc và metadata | Bỏ vùng quảng cáo lớn; cần thiết kế không phụ thuộc ảnh |
| [The Guardian Technology](https://www.theguardian.com/technology) | Lưới báo chí bất đối xứng; serif; nhóm chuyên mục | Nhịp tiêu đề lớn–nhỏ và chất báo chí | Chưa đưa nhiều chuyên mục vào MVP |
| [The Verge Tech](https://www.theverge.com/tech) | Đầu trang có màu mạnh; các bài dẫn rồi dòng cập nhật | Cá tính và dòng tin có tóm tắt | Giảm độ rực và chiều cao đầu trang |
| [TechCrunch](https://techcrunch.com/) | Một bài lớn, bài phụ, cột Top Headlines; Latest News phía dưới | Cấu trúc một lớn + hai nhỏ | Không gắn nhãn hot/top khi chưa có dữ liệu xếp hạng |
| [MIT Technology Review](https://www.technologyreview.com/) | Featured Story, tóm tắt, bài phụ; nhóm nội dung dài | Khoảng thở và phần dẫn dễ đọc | Không dùng carousel cho tin cần thấy ngay |
| [Rest of World](https://restofworld.org/) | Danh sách latest bên trái, bài chính giữa, bài phụ bên phải | Độ rõ của nguồn và nhịp đọc | Thu gọn còn hai cột để tránh chật |

BBC không kết nối được, NYT bị chính sách trình duyệt chặn, Ars Technica trả màn hình trắng trong lần kiểm tra; không đưa các trang này vào kết luận đã xác minh.

## 6. Sitemap or route map

- `/`: điểm tin và danh sách.
- `/articles/:id`: tóm tắt, metadata, các nguồn, liên kết bài gốc.
- Theme và locale nằm ở header chung. Footer giải thích ngắn vai trò tổng hợp tin; chưa cần thêm route riêng.

## 7. Page-by-page requirements

Trang chủ: logo, công tắc, lời dẫn ngắn; tin xuất hiện sớm; hiển thị nguồn và thời gian. Ba bài đầu không lặp lại trong dòng tin bên dưới. Tin đầu gọi là “Mới nhất” nếu sắp theo thời gian, không giả là biên tập viên lựa chọn.

Chi tiết: quay lại danh sách → tiêu đề → nguồn/thời gian → tóm tắt → các nguồn liên quan nếu có → “Đọc bài gốc”. Không tạo nội dung toàn văn khi API chỉ có tóm tắt. Cột đọc rộng khoảng 60–70 ký tự, nền đặc.

## 8. Primary user flows

Mở trang → quét tiêu đề và nguồn → chọn bài → đọc tóm tắt → mở nguồn gốc hoặc quay lại đúng vị trí. Đổi theme/locale giữ bài đang đọc và vị trí cuộn.

## 9. Key components and interface states

Masthead, theme toggle, locale toggle, lead article, compact article, feed row, source list, pagination.

- Loading: skeleton cùng cấu trúc, không nhấp nháy.
- Empty: “Chưa có bản tin”, cho tải lại.
- Error: lời giải thích ngắn + thử lại, giữ nội dung cũ nếu có.
- Success: nội dung và thời gian xuất bản; không giả thời điểm cập nhật.
- Missing summary: bỏ vùng tóm tắt, không để khoảng trống giả.
- Not found: hướng về dòng tin.

## 10. Responsive behavior

Desktop: hai cột tỷ lệ khoảng 60/40 ở phần đầu, dòng tin bên dưới. Mobile: header wrap; tin lớn → hai tin phụ → dòng tin theo cùng thứ tự DOM. Chuyển một cột khoảng 580px trong concept; kiểm tra lại theo nội dung thật. Không thu nhỏ desktop để vừa điện thoại.

## 11. Accessibility requirements

Heading tuần tự, landmark và skip link; điều khiển bàn phím; focus rõ; nhãn công tắc mô tả trạng thái; mục tiêu chạm khoảng 44px. Mục tiêu WCAG AA: tương phản chữ thường ít nhất 4.5:1; kiểm tra trên nền kính thực. Tôn trọng reduced motion và có nền đặc khi blur không hỗ trợ.

## 12. Content and copy guidance

Light: giấy kem, tím trầm. Dark: nền tím than, mặt thẻ sáng hơn nền, chữ ngà. Serif cho tiêu đề, sans-serif cho nội dung và điều khiển. Nền/viền/đổ bóng có token riêng từng theme. Giữ blur ở header; mặt bài đặc, bóng mềm; tránh nhiều thẻ nổi lồng nhau.

VI/EN dịch chrome, thông báo và thời gian. Nội dung RSS giữ ngôn ngữ gốc; không ngụ ý đã dịch. Concept chứa tiêu đề minh họa tự viết, không phải bản tin thực hay trích dẫn từ các nguồn khảo sát.

## 13. Most relevant Laws of UX

Jakob, Common Region, Proximity, Selective Attention, Fitts, Aesthetic-Usability. Dùng như heuristic thiết kế, cần kiểm chứng bằng người dùng.

## 14. Principle-to-decision table

| Nguyên tắc | Rủi ro | Quyết định cụ thể | Lợi ích người dùng | Lợi ích sản phẩm | Đánh đổi |
| --- | --- | --- | --- | --- | --- |
| Jakob | Khó hiểu luồng đọc | Header → tin → chi tiết → nguồn | Quen thuộc | Giảm bỏ cuộc | Ít mới lạ ở cấu trúc |
| Common Region | Nhầm bài với nhau | Một vùng riêng cho tin chính | Nhận diện nhóm | Quét bài dễ | Tốn thêm khoảng trắng |
| Proximity | Không biết xuất xứ | Nguồn/thời gian ngay dưới bài | Kiểm tra thuận tiện | Tạo tin cậy | Metadata chiếm diện tích |
| Selective Attention | Các tin tranh chú ý | Một tin lớn, hai tin nhỏ | Điểm bắt đầu rõ | Tăng khả năng chọn bài | Bài đầu được chú ý hơn dù chỉ mới nhất |
| Fitts | Khó bấm trên mobile | Nút 44px; link tiêu đề rõ | Bấm dễ | Ít thao tác lỗi | Header cao hơn |
| Aesthetic-Usability | Giao diện lạnh hoặc hiệu ứng gây khó đọc | Kem/tím, serif, glass giới hạn, nền bài đặc | Đọc dễ chịu | Nhận diện riêng | Cần kiểm tra contrast/performance |

## 15. Risks and trade-offs

Không có ảnh: dựa vào typography và nhịp khoảng cách. Tiêu đề dài tiếng Việt/Anh có thể đẩy chiều cao khác nhau. Clay quá mạnh dễ tạo cảm giác đồ chơi; bóng nên nhỏ. Layout bất đối xứng có thể làm bài đầu có vẻ quan trọng hơn thực tế: nhãn “Mới nhất” và thứ tự thời gian cần rõ.

## 16. Validation plan

Thử với tiêu đề ngắn/dài, thiếu summary, một bài và nhiều bài. Kiểm tra 360/736/1024px, hai theme, hai locale và bàn phím. Cho người thử tìm nguồn bài, mở chi tiết và trở lại trong một lượt; ghi lại điểm vướng. Concept hiện chưa được kiểm tra trực quan trên trình duyệt ở các kích thước này.

## 17. Metrics and analytics

Đề xuất đo tỷ lệ mở chi tiết, mở bài gốc, lỗi tải và khả năng quay lại vị trí cũ. Chưa cài analytics. Đánh giá tốc độ tìm bài bằng quan sát thử nghiệm trước khi thêm đo lường sản phẩm.

## 18. Recommended build order

1. Review bố cục và màu qua concept.
2. Xây component tin chính/tin phụ/dòng tin với dữ liệu mẫu đã đánh dấu.
3. Nối API danh sách, phân trang và các trạng thái.
4. Xây chi tiết và liên kết nguồn.
5. Lưu theme/locale; kiểm tra accessibility và responsive; chạy lint/build phù hợp.

Mỗi bước giải thích mục tiêu và kiến thức theo protocol project-based learning, rồi kiểm tra kết quả trước bước tiếp theo.

## 19. Open questions

Không có câu hỏi chặn phác thảo. Có thể điều chỉnh mức độ bất đối xứng và độ bo góc sau khi xem. Ảnh bài, tìm kiếm, chủ đề, lưu bài và dịch nội dung thuộc quyết định mở rộng sau này.
