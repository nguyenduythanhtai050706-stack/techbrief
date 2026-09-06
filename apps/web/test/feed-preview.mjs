// Local, deterministic browser QA: node test/feed-preview.mjs from apps/web.
import { createServer } from 'vite';
const server = await createServer({
  server: { port: 5174, strictPort: true, host: '127.0.0.1' },
  plugins: [{ name: 'feed-qa', configureServer(server) {
server.middlewares.use('/api/articles', (req, res) => {
  const page = Number(new URL(req.url, 'http://localhost').searchParams.get('page') ?? 1);
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ totalPages: 2, items: (page === 1 ? [1, 2, 3, 4] : [4, 5]).map(id => ({
    id, title: `Sample story ${id} — technology and everyday life`,
    canonicalUrl: 'https://example.com/', summary: '<p>A sample summary for checking the reading layout.</p>',
    imageUrl: id === 1 ? 'http://127.0.0.1:5174/qa-image.svg' : id === 2 ? 'http://127.0.0.1:5174/missing-image.png' : null,
    publishedAt: '2026-09-01T12:00:00Z', sources: [{ id: 1, name: 'QA source' }],
  })) }));
});
server.middlewares.use('/qa-image.svg', (_req, res) => {
  res.setHeader('Content-Type', 'image/svg+xml');
  res.end('<svg xmlns="http://www.w3.org/2000/svg" width="800" height="450"><rect width="800" height="450" fill="#b7a4d1"/><circle cx="550" cy="230" r="150" fill="#eadfcf"/></svg>');
});
  } }],
});
await server.listen();
console.log('Feed QA: http://127.0.0.1:5174');
