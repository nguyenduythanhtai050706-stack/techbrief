// Local, deterministic browser QA: node test/feed-preview.mjs from apps/web.
import { createServer } from 'vite';
const port = Number(process.env.QA_PORT ?? 5174);
const server = await createServer({
  server: { port, strictPort: true, host: '127.0.0.1' },
  plugins: [{ name: 'feed-qa', configureServer(server) {
const failedCases = new Set();
server.middlewares.use('/api/articles', (req, res) => {
  const params = new URL(req.url, 'http://localhost').searchParams;
  const page = Number(params.get('page') ?? 1);
  const category = params.get('category') ?? '';
  const scenario = new URL(req.headers.referer ?? 'http://localhost').searchParams;
  const caseKey = `${req.headers.referer}:${category}`;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  const detail = /^\/(\d+)$/.exec(new URL(req.url, 'http://localhost').pathname);
  if (detail) {
    const id = Number(detail[1]);
    if (id < 1 || id > 5) {
      res.statusCode = 404;
      res.end(JSON.stringify({ message: 'Article not found' }));
    } else {
      const base = { id, title: `Sample story ${id} — technology and everyday life`, canonicalUrl: 'https://example.com/', summary: '<p>A sample summary for checking the reading layout.</p>', sources: [{ id: 1, name: 'QA source' }] };
      const v2 = id === 1 || id === 2 || id === 5 ? {
        schemaVersion: 2,
        en: { title: `Evidence-rich story ${id}`, feedSummary: 'A short feed summary.', summary: id === 2 ? 'The available source provides limited information about this announcement.' : 'The detailed summary explains the event, its context, its practical impact, and the boundaries of what the available reporting can establish without adding unsupported claims.', keyPoints: [
          { text: 'The announcement is supported by the cited source.', evidenceIds: ['E1'] },
          { text: 'The scope and limitations remain explicit.', evidenceIds: ['E1'] },
          { text: 'No unsupported number is introduced.', evidenceIds: ['E1'] },
        ] },
        vi: { title: `Bài có dẫn chứng ${id}`, feedSummary: 'Một bản tóm tắt ngắn cho dòng tin.', summary: id === 2 ? 'Nguồn hiện có chỉ cung cấp thông tin giới hạn về thông báo này.' : 'Bản tóm tắt chi tiết trình bày sự kiện, bối cảnh, tác động thực tế và giới hạn của thông tin hiện có mà không bổ sung nhận định thiếu căn cứ.', keyPoints: [
          { text: 'Thông báo được hỗ trợ bởi nguồn dẫn chứng.', evidenceIds: ['E1'] },
          { text: 'Phạm vi và giới hạn được nêu rõ.', evidenceIds: ['E1'] },
          { text: 'Không bổ sung số liệu thiếu căn cứ.', evidenceIds: ['E1'] },
        ] },
        evidence: [{ id: 'E1', sourceId: 1, sourceName: 'QA source', sourceUrl: id === 5 ? 'javascript:alert(1)' : 'https://example.com/evidence' }],
        evidenceLevel: id === 2 ? 'limited' : 'rich',
      } : undefined;
      res.end(JSON.stringify({ ...base, ...(v2 ? { translations: v2 } : id === 3 ? { translations: { en: { title: 'V1 story', summary: 'V1 summary.' }, vi: { title: 'Bài V1', summary: 'Tóm tắt V1.' } } } : {}) }));
    }
    return;
  }
  if (category && scenario.get('qa-fail') === category && !failedCases.has(caseKey)) {
    failedCases.add(caseKey);
    res.statusCode = 503;
    res.end(JSON.stringify({ message: 'Expected QA failure' }));
    return;
  }
  const categoryById = { 1: ['Products'], 2: ['AI'], 3: ['Technology'], 4: ['AI', 'Products'], 5: ['Products'] };
  const filtered = [1, 2, 3, 4, 5].filter(id => !category || categoryById[id].includes(category));
  const empty = category && scenario.get('qa-empty') === category;
  const ids = empty ? [] : category ? filtered.slice((page - 1) * 2, page * 2) : page === 1 ? [1, 2, 3, 4] : [4, 5];
  const totalPages = empty ? 0 : category ? Math.ceil(filtered.length / 2) : 2;
  const send = () => res.end(JSON.stringify({ totalPages, items: ids.map(id => ({
    id, title: `Sample story ${id} — technology and everyday life`,
    categories: categoryById[id],
    canonicalUrl: 'https://example.com/', summary: '<p>A sample summary for checking the reading layout.</p>',
    imageUrl: id === 1 ? `http://127.0.0.1:${port}/qa-image.svg` : id === 2 ? `http://127.0.0.1:${port}/missing-image.png` : null,
    publishedAt: '2026-09-01T12:00:00Z', sources: [{ id: 1, name: 'QA source' }],
  })) }));
  if (category && scenario.get('qa-delay') === category) setTimeout(send, 800);
  else send();
});
server.middlewares.use('/qa-image.svg', (_req, res) => {
  res.setHeader('Content-Type', 'image/svg+xml');
  res.end('<svg xmlns="http://www.w3.org/2000/svg" width="800" height="450"><rect width="800" height="450" fill="#b7a4d1"/><circle cx="550" cy="230" r="150" fill="#eadfcf"/></svg>');
});
  } }],
});
await server.listen();
console.log(`Feed QA: http://127.0.0.1:${port}`);
