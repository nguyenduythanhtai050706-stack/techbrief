# Day 7-8 MVC Layering Design

## Mục tiêu

Giữ API TechBrief dễ đọc khi mở rộng bằng cách tổ chức từng feature theo các tầng MVC phù hợp với NestJS. Backend hiện tại không render giao diện, nên `View` là frontend trong tương lai; API giữ vai trò cung cấp dữ liệu cho View đó.

## Cấu trúc áp dụng

Mỗi feature vẫn là một NestJS module độc lập (`articles`, `sources`, `ingestion`, `health`). Bên trong feature, trách nhiệm đi theo luồng:

```text
HTTP request
  -> Controller
  -> Service
  -> Repository / infrastructure adapter
  -> PostgreSQL, Redis, RSS, or scheduler
```

| Tầng | Trách nhiệm | Không làm gì |
| --- | --- | --- |
| Controller | Route, nhận DTO, trả HTTP response và status phù hợp | SQL, cache key, nghiệp vụ ingestion |
| Service | Use case, quy tắc nghiệp vụ, phối hợp repository và cache | Phụ thuộc vào chi tiết HTTP hoặc SQL trực tiếp |
| Repository / model | Đọc-ghi và ánh xạ dữ liệu bền vững; model là type/domain contract thay vì ORM entity | Quy tắc HTTP và cache fallback |
| Infrastructure | Kết nối PostgreSQL, Redis, RSS parser, cron | Quyết định nghiệp vụ feature |
| View | Frontend sẽ gọi API và hiển thị dữ liệu ở giai đoạn UI sau | Nằm trong `apps/api` ở Day 7-8 |

DTO (`dto/`) là boundary của HTTP: controller dùng DTO để validation và service nhận dữ liệu đã được chuẩn hóa. Các `*.types.ts` biểu diễn model/domain contract giữa service và repository; dự án chưa dùng ORM entity, nên không thêm thư mục `models/` chỉ để mô phỏng MVC cổ điển.

## Quy tắc phụ thuộc

- Controller chỉ gọi service của cùng feature.
- Service có thể gọi repository, cache service, hoặc service được module khác export.
- Repository chỉ gọi `DatabaseService` và không import controller hay service nghiệp vụ.
- Redis, scheduler và RSS là adapters; lỗi hạ tầng được xử lý tại service phù hợp với use case.
- Module chịu trách nhiệm wiring dependency, không chứa nghiệp vụ.
- Không tạo vòng phụ thuộc: ingestion có thể dùng `ArticlesCacheService`; articles không import ingestion.

## Ánh xạ vào Day 7-8

| Thành phần | Tầng MVC / kiến trúc |
| --- | --- |
| `ArticlesController` | Controller |
| `ArticlesQueryService`, `ArticlePersistenceService`, `IngestionService` | Service/use case |
| `ArticlesRepository` | Repository/model persistence |
| `ArticlesCacheService`, `RedisService`, `DatabaseService`, `FeedReaderService`, `IngestionSchedulerService` | Infrastructure adapters |
| `ListArticlesDto`, `ArticleIdDto` | HTTP DTO boundary |
| `ArticleView`, `ArticleListPage`, `ArticleListQuery` | Model/domain contracts |

## Hướng mở rộng mức 3

Khi có UI, thêm frontend như View độc lập gọi `GET /articles` và `GET /articles/:id`; không chuyển SQL, cache hay ingestion logic sang frontend. Các khả năng như cursor pagination, Redis distributed lock, retry và metrics tiếp tục đặt ở service/infrastructure, vì vậy không làm đổi ranh giới controller hoặc API contract hiện tại.

## Kiểm thử

- Controller test kiểm tra mapping DTO, status và delegation.
- Service test kiểm tra use case, cache fallback, invalidation và scheduler overlap guard.
- Repository test kiểm tra SQL có tham số và mapping dữ liệu.
- Infrastructure test dùng mock để không cần Redis, PostgreSQL, RSS Internet hoặc scheduler thật.

## Phạm vi

Đây là quy ước tổ chức, không phải yêu cầu refactor toàn bộ code cũ. Day 7-8 chỉ thêm file mới theo các ranh giới trên và giữ tương thích với controller, service, repository hiện tại.
