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
      res.end(JSON.stringify({ id, title: `Sample story ${id} — technology and everyday life`, canonicalUrl: 'https://example.com/', summary: '<p>A sample summary for checking the reading layout.</p>', sources: [{ id: 1, name: 'QA source' }] }));
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
