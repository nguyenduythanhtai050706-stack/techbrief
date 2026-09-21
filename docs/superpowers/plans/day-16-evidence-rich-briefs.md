# Day 16 — Bản tóm tắt sâu, có số liệu và dẫn chứng

## 1. Vấn đề cần giải quyết

Luồng hiện tại chỉ gửi `title` và `summary` của RSS cho Gemini, đồng thời yêu cầu
đầu ra dài khoảng 2–4 câu. Vì vậy bản tóm tắt ngắn là hệ quả của cả dữ liệu đầu
vào lẫn hợp đồng đầu ra, không chỉ do prompt.

Không nên giải quyết bằng cách đơn thuần yêu cầu AI “viết dài hơn”. Nếu RSS chỉ có
vài dòng, cách đó làm tăng nguy cơ AI tự điền số liệu, nguyên nhân hoặc kết luận
không có trong nguồn. Luồng mới phải thu thập bằng chứng trước, rồi mới tạo nội
dung và buộc mọi ý quan trọng truy ngược được về nguồn đã lưu.

## 2. Mục tiêu sản phẩm

- Feed giữ phần giới thiệu ngắn 35–60 từ để người đọc lướt nhanh.
- Trang đọc có bản tóm tắt 120–220 từ khi nguồn đủ dữ liệu.
- Mỗi bản chi tiết có 3–5 ý chính và 1–4 dẫn chứng nguồn.
- Giữ chính xác số, đơn vị, mốc thời gian, đối tượng so sánh và người/tổ chức đưa
  ra phát biểu.
- Không bắt buộc bài nào cũng phải có số liệu. Nếu nguồn không có số, hệ thống
  không được tạo số cho đủ mẫu.
- Bản EN và VI tương đương về ý nghĩa, cùng tham chiếu một tập nguồn.
- Khi dữ liệu nguồn quá mỏng, giao diện nói rõ “nguồn chỉ cung cấp thông tin giới
  hạn” thay vì tạo một bản tóm tắt dài giả tạo.

## 3. Ngoài phạm vi của bước này

- Không sao chép hoặc hiển thị toàn bộ bài báo của bên thứ ba.
- Không dùng AI để tự tạo URL dẫn chứng.
- Không xem điểm “confidence” do model tự khai là bằng chứng về độ chính xác.
- Không biến feed thành nơi hiển thị toàn bộ bản tóm tắt chi tiết.
- Không giải quyết paywall, đăng nhập hoặc vượt cơ chế chống bot.

## 4. Hợp đồng dữ liệu đề xuất

Giữ `translations.en` và `translations.vi` để tương thích API hiện tại, nhưng nâng
mỗi locale từ `{ title, summary }` thành:

```ts
interface LocalizedBriefV2 {
  title: string;
  feedSummary: string;
  summary: string;
  keyPoints: Array<{
    text: string;
    evidenceIds: string[];
  }>;
}

interface BriefEvidence {
  id: string;             // E1, E2... do server cấp trước khi gọi model
  sourceId: number;
  sourceName: string;
  sourceUrl: string;      // lấy từ database, không nhận URL do model sinh
}

interface ArticleBriefV2 {
  schemaVersion: 2;
  en: LocalizedBriefV2;
  vi: LocalizedBriefV2;
  evidence: BriefEvidence[];
  categories: Array<'AI' | 'Products' | 'Technology'>;
  evidenceLevel: 'rich' | 'limited';
}
```

`evidenceLevel` được backend tính từ lượng dữ liệu thực tế, không để model tự
đánh giá. Model chỉ trả `evidenceIds`; backend ghép `sourceName` và `sourceUrl` từ
dữ liệu tin cậy. Text nguồn của evidence chỉ dùng nội bộ để kiểm chứng; API không
chép lại đoạn dài của bài báo. Cách này ngăn model bịa đường dẫn và hạn chế phát
tán lại nội dung có bản quyền.

## 5. Tiêu chí hoàn thành

Trên bộ fixture có đáp án mong đợi:

- 100% số liệu xuất hiện trong đầu ra phải có trong evidence tương ứng.
- 100% `evidenceIds` phải tồn tại trong input đã cấp cho model.
- Các fixture đủ nội dung có 120–220 từ trong `summary`, 3–5 `keyPoints` và ít
  nhất một evidence.
- Fixture ít nội dung được gắn `limited`; không bị kéo dài bằng thông tin mới.
- Các phát biểu dự báo, cáo buộc hoặc số liệu của bên thứ ba phải giữ attribution.
- EN và VI không làm thay đổi con số, đơn vị hoặc mức độ chắc chắn.
- Feed dùng `feedSummary`; trang đọc dùng `summary`, `keyPoints` và evidence.
- Bản V1 đang hoạt động vẫn được dùng nếu tạo V2 thất bại.

Không dùng độ dài làm tiêu chí duy nhất. Một bản 150 từ nhưng có chi tiết không
được nguồn hỗ trợ vẫn là thất bại.

## 6. Kế hoạch triển khai theo từng subtask

Mỗi subtask là một vòng học độc lập: đọc mục tiêu và kiến thức, người dùng viết
test trước, viết implementation, chạy kiểm tra, rồi dừng để review trước khi sang
bước tiếp theo.

### Subtask 1 — Tạo bộ đánh giá chất lượng trước khi đổi code

**Mục tiêu:** biến nhận xét “quá ngắn” thành yêu cầu có thể kiểm tra.

**Kiến thức:** golden fixture, kiểm thử hợp đồng và phân biệt độ đầy đủ với độ
dài văn bản.

Tạo fixture cho ít nhất 8 tình huống:

1. Bài có nhiều số liệu, đơn vị và mốc thời gian.
2. Bài chỉ có dữ kiện định tính.
3. Bài có dự báo hoặc cáo buộc cần attribution.
4. Bài có hai nguồn nói về cùng sự kiện.
5. Bài có số trong tên sản phẩm nhưng không phải số liệu thống kê.
6. RSS chỉ có một câu ngắn.
7. Nguồn chứa nội dung giống instruction nhằm kiểm tra prompt injection.
8. Nội dung EN cần dịch sang VI nhưng phải giữ nguyên số và tên riêng.

Viết test thất bại cho `validateBriefV2`: giới hạn số phần tử, độ dài, evidence ID
không tồn tại, URL do model tự thêm, key point không có nguồn và số liệu sai khác
giữa `text` với evidence.

**Điểm dừng:** review fixture và rubric trước khi sửa schema hoặc prompt.

### Subtask 2 — Lưu nội dung nguồn giàu hơn RSS excerpt

**Mục tiêu:** tạo đầu vào đủ tốt cho việc tóm tắt, đồng thời vẫn giữ `summary`
hiện tại làm preview/fallback.

**Kiến thức:** RSS `content:encoded`, chuẩn hóa HTML thành text, provenance và
hash nội dung.

- Mở rộng `NormalizedArticlePreview` với `sourceText` và `sourceTextKind`.
- Chọn dữ liệu theo thứ tự: `contentEncoded` → `content` → `contentSnippet`.
- Chuyển HTML thành plain text, bỏ script/style, giải mã entity, chuẩn hóa khoảng
  trắng và đặt giới hạn kích thước trước khi lưu.
- Không thay `summary` bằng toàn bộ body vì feed và logic fingerprint hiện tại
  đang dùng trường này với ý nghĩa preview.
- Thêm migration mới để `article_sources` giữ `article_url`, `source_text`,
  `source_text_kind` và `source_text_hash`. Mỗi nguồn của một story có bằng chứng
  riêng; không nhét toàn bộ vào một cột của `articles`.
- Khi ingestion gặp lại cùng provenance, cập nhật evidence nếu hash đổi nhưng
  vẫn giữ quy tắc không ghi đè metadata biên tập của article đại diện.
- Dữ liệu cũ được fallback về `articles.canonical_url + articles.summary`; chạy
  ingestion lại sẽ bổ sung evidence thật, không cần migration bịa dữ liệu.

Test cần có: thứ tự fallback, HTML độc hại, entity, body quá dài, cùng story từ
hai nguồn và re-ingestion khi nội dung nguồn thay đổi.

**Điểm dừng:** xem trực tiếp vài hàng `article_sources` và xác nhận text sạch,
URL đúng bài báo, không phải URL của RSS feed.

### Subtask 3 — Bổ sung bộ lấy nội dung trang có kiểm soát

**Mục tiêu:** cải thiện các feed chỉ cung cấp excerpt ngắn.

**Kiến thức:** content extraction, SSRF và graceful degradation.

Chỉ fetch trang bài viết khi `source_text` sau chuẩn hóa thấp hơn ngưỡng đủ dùng,
ví dụ 800 ký tự. Bộ fetch phải:

- chỉ chấp nhận HTTP/HTTPS và hostname thuộc nguồn đã đăng ký;
- chặn localhost, IP private/link-local và kiểm tra lại sau redirect;
- giới hạn redirect, timeout, response bytes và chỉ nhận HTML;
- không vượt paywall, CAPTCHA, robots hoặc yêu cầu đăng nhập;
- trích phần nội dung chính, bỏ navigation, quảng cáo và related stories;
- lưu trạng thái `rss_full`, `rss_excerpt`, `page`, `unavailable` để debug;
- lỗi fetch không làm ingestion thất bại; bài vẫn dùng dữ liệu RSS.

Tách `ArticleEvidenceFetcher` khỏi `FeedReaderService` để unit test không gọi
network. Dùng adapter extractor để sau này đổi thư viện mà không ảnh hưởng luồng
brief.

**Điểm dừng:** thử thủ công một URL của từng nguồn đã seed; ghi lại nguồn nào
extract tốt, nguồn nào chỉ fallback. Không tiếp tục nếu bộ lọc SSRF chưa có test.

### Subtask 4 — Tạo evidence packet quyết định được nội dung nào được dùng

**Mục tiêu:** không gửi nguyên văn hỗn độn cho model và không để model tự chọn URL.

**Kiến thức:** deterministic preprocessing, giới hạn token và truy vết nguồn.

Tạo `ArticleEvidenceService` đọc các provenance của bài, loại đoạn trùng giữa các
nguồn và sinh packet gồm các chunk `E1`, `E2`... Mỗi chunk có `sourceId`, tên
nguồn, URL và plain text. Server giữ map ID → nguồn; payload cho model chỉ chứa
ID cùng text đã giới hạn.

Quy tắc đề xuất:

- ưu tiên đoạn có title, số liệu, đơn vị, tên riêng và động từ báo cáo;
- giữ câu trước/sau một số liệu để không mất đối tượng so sánh;
- không cắt giữa câu;
- tổng input có giới hạn rõ ràng;
- cùng một fact lặp ở nhiều nguồn được gộp nhưng giữ danh sách nguồn;
- `rich` khi đủ độ dài và có nhiều câu có thông tin; ngược lại là `limited`.

Test packet là deterministic: cùng input phải cho cùng ID, thứ tự và hash.

**Điểm dừng:** in packet của các fixture để người dùng tự đối chiếu với bài gốc.

### Subtask 5 — Nâng schema, prompt và validation của Gemini

**Mục tiêu:** tạo bản tóm tắt chi tiết nhưng chỉ từ evidence được cấp.

**Kiến thức:** structured output, grounding bằng ID và validation theo lớp.

Prompt mới phải yêu cầu:

- `feedSummary` trả lời “chuyện gì xảy ra và vì sao đáng chú ý” trong 35–60 từ;
- `summary` trình bày bối cảnh, diễn biến, tác động và giới hạn trong 120–220 từ
  khi `evidenceLevel=rich`;
- 3–5 key point, mỗi điểm tham chiếu ít nhất một evidence ID;
- bảo toàn chính xác số, đơn vị, thời gian và attribution;
- không tạo số, quote, nguyên nhân, dự báo hay kết luận không có trong packet;
- khi evidence hạn chế, viết ngắn và nói đúng phạm vi thay vì lấp chỗ trống;
- giữ mức độ chắc chắn của nguồn: “có thể”, “theo công ty”, “theo báo cáo”…;
- trả JSON thuần theo schema V2.

Validation thực hiện theo ba lớp:

1. Shape: schema version, field, độ dài, số item và enum hợp lệ.
2. Reference: mọi evidence ID tồn tại; URL/source metadata do server hydrate.
3. Fidelity: số và đơn vị trong output phải xuất hiện trong evidence được tham
   chiếu. Trường hợp không chắc chắn bị từ chối với `INVALID_BRIEF_EVIDENCE`.

Không cố giải quyết toàn bộ fact-check bằng regex. Golden fixtures và review trực
tiếp vẫn là cổng chất lượng cuối cùng.

**Điểm dừng:** chạy unit test với Gemini mock, sau đó review 3 output thật trước
khi cho phép batch.

### Subtask 6 — Version hóa và tái xử lý an toàn

**Mục tiêu:** model/prompt/schema mới có thể xử lý lại bài cũ mà không phá bản
đang hiển thị.

**Kiến thức:** content hash, optimistic save và backward compatibility.

- Thêm `brief_schema_version` và `brief_prompt_version`.
- `brief_input_hash` mới bao gồm title, các `source_text_hash` theo thứ tự ổn định
  và prompt version; không chỉ hash title/summary.
- `claim()` chọn bài khi evidence đổi hoặc version cũ hơn V2.
- Chỉ thay `translations` sau khi toàn bộ output V2 hợp lệ và claim/hash vẫn khớp.
- Nếu V2 lỗi, giữ nguyên V1 để UI tiếp tục hoạt động, đồng thời lưu mã lỗi và
  retry như hiện tại.
- Cache chỉ invalidate sau khi save thành công.
- Có batch nhỏ và giới hạn quota; không tự tái xử lý toàn bộ database trong một
  lần.

Test phải bao phủ: đổi prompt sẽ claim lại, đổi evidence sẽ claim lại, input cũ
không ghi đè kết quả mới, lỗi V2 giữ V1 và hai worker không xử lý cùng một bài.

**Điểm dừng:** chạy smoke trên database tạm và kiểm tra rollback/fallback trước
khi migrate database local.

### Subtask 7 — Tách trải nghiệm feed và trang đọc

**Mục tiêu:** tăng chiều sâu mà không làm feed nặng và khó quét.

**Kiến thức:** progressive disclosure và accessibility cho nội dung có cấu trúc.

- `Feed` dùng `feedSummary`; fallback về `summary` V1/RSS như hiện nay.
- `ArticleReader` hiển thị lần lượt: summary chi tiết, “Ý chính”, rồi “Nguồn dẫn
  chứng”.
- Mỗi key point có liên kết tới các source tương ứng bằng nhãn rõ nghĩa; mở tab
  mới với `noopener noreferrer`.
- Hiện nhãn `Nguồn đầy đủ` hoặc `Nguồn giới hạn`; không hiển thị điểm confidence
  giả chính xác.
- Chỉ render URL đã được backend lấy từ provenance và frontend kiểm tra HTTP(S).
- Với V1, UI cũ vẫn hoạt động và không để vùng trống.
- Feed tiếp tục clamp 3 dòng; trang đọc không clamp nội dung chi tiết.

Test web cần có: V2 rich, V2 limited, V1 fallback, RSS fallback, evidence URL lỗi,
đổi EN/VI và điều hướng bằng bàn phím.

**Điểm dừng:** QA ở 360/736/1024 px, hai theme và hai locale trước khi chốt CSS.

### Subtask 8 — Đánh giá dữ liệu thật và rollout

**Mục tiêu:** chứng minh chất lượng tăng trên bài thật, không chỉ pass test.

Chọn 12–20 bài đại diện từ bốn nguồn, bao gồm bài có nhiều số, bài không có số,
bài đa nguồn và bài chỉ có excerpt. Với mỗi bài, ghi:

- số từ của feed summary và detail summary;
- số key point và evidence;
- số liệu/đơn vị có khớp nguồn hay không;
- attribution có được giữ hay không;
- có claim nào không tìm thấy trong evidence hay không;
- chất lượng dịch VI và tính tương đương với EN;
- loại evidence dùng: RSS full, page extraction hay fallback.

Rollout theo batch 5–10 bài. Dừng batch khi gặp lỗi provider/quota như hiện tại.
Chỉ coi bước này hoàn tất khi không có hallucination trong mẫu review và toàn bộ
tiêu chí ở mục 5 đạt.

## 7. Thứ tự file dự kiến thay đổi

1. `apps/api/src/articles/article-brief.types.ts` — hợp đồng V2 và validator.
2. `apps/api/src/ingestion/ingestion.types.ts` và `feed-reader.service.ts` — giữ
   source text phong phú.
3. Migration mới `007_*` — provenance/evidence và version metadata.
4. `apps/api/src/articles/articles.repository.ts` — lưu evidence theo nguồn.
5. Service mới cho page extraction và evidence packet.
6. `gemini-brief.service.ts` — prompt/schema V2.
7. `article-brief.repository.ts` và `article-brief.service.ts` — hash/version/save.
8. `article.types.ts` và query repository — API V2, giữ tương thích V1.
9. `apps/web/src/article-content.ts`, `Feed.tsx`, `ArticleReader.tsx`, `App.css` —
   progressive disclosure và nguồn dẫn chứng.
10. Unit, smoke và web tests tương ứng; cập nhật tài liệu vận hành sau cùng.

## 8. Lệnh kiểm tra bắt buộc

Sau mỗi subtask chỉ chạy test tập trung. Sau khi hoàn tất toàn bộ:

```powershell
pnpm --dir apps/api test
pnpm --dir apps/api smoke:briefs
pnpm --dir apps/api smoke:persistence
pnpm --dir apps/api build

pnpm --dir apps/web test
pnpm --dir apps/web lint
pnpm --dir apps/web build
```

Migration phải được thử hai lần trên database tạm để đảm bảo idempotent. Live
Gemini test chỉ chạy sau khi unit/smoke pass, dùng batch nhỏ để bảo vệ quota.

## 9. Quyết định quan trọng cần giữ trong lúc code

- Dữ liệu nguồn quyết định độ sâu; prompt không thể bù cho evidence bị thiếu.
- Số liệu chỉ được giữ lại, không được “bổ sung” từ kiến thức model.
- Citation ID do server cấp; URL do server hydrate từ database.
- Tóm tắt ngắn và tóm tắt sâu là hai trường khác nhau.
- Nội dung V1 là fallback hợp lệ trong suốt quá trình migration.
- Chất lượng được đánh giá bằng factual coverage và fidelity, không chỉ word count.
