import { test } from 'node:test';
import assert from 'node:assert/strict';
import { articleContent, safeHttpUrl } from '../src/article-content.ts';

test('language switch selects both title and summary from saved translations', () => {
  const article = { title: 'Original title', summary: 'Original excerpt', translations: {
    en: { title: 'New laptop', summary: 'A lighter laptop was released.' },
    vi: { title: 'Máy tính mới', summary: 'Một mẫu máy nhẹ hơn đã ra mắt.' },
  } };
  assert.deepEqual(articleContent(article, 'vi'), { ...article.translations.vi, feedSummary: article.translations.vi.summary, keyPoints: [], evidence: [], evidenceLevel: undefined, generated: true, schemaVersion: 1 });
  assert.deepEqual(articleContent(article, 'en'), { ...article.translations.en, feedSummary: article.translations.en.summary, keyPoints: [], evidence: [], evidenceLevel: undefined, generated: true, schemaVersion: 1 });
});

test('limited V2 remains structured without requiring rich-length copy', () => {
  const translations = {
    schemaVersion: 2,
    en: { title: 'Preview', feedSummary: 'Limited source.', summary: 'The source provides limited information.', keyPoints: [{ text: 'A prototype was previewed.', evidenceIds: ['E1'] }] },
    vi: { title: 'Bản xem trước', feedSummary: 'Nguồn giới hạn.', summary: 'Nguồn chỉ cung cấp thông tin giới hạn.', keyPoints: [{ text: 'Một nguyên mẫu được giới thiệu.', evidenceIds: ['E1'] }] },
    evidence: [{ id: 'E1', sourceId: 1, sourceName: 'Source', sourceUrl: 'https://source.example/story' }],
    evidenceLevel: 'limited',
  };
  assert.equal(articleContent({ title: 'RSS', summary: null, translations }, 'vi').evidenceLevel, 'limited');
});

test('V2 EN to VI to EN preserves detailed copy, statistics and source links', () => {
  const translations = {
    schemaVersion: 2,
    en: {
      title: 'Acme reports lower processing cost',
      feedSummary: 'Acme reports a 32% processing cost reduction in its benchmark.',
      summary: 'According to Acme, processing cost fell by 32% on its internal benchmark.\n\nThe report gives no independent verification or rollout schedule.',
      keyPoints: [
        { text: 'Acme reports a 32% cost reduction.', evidenceIds: ['E1'] },
        { text: 'The benchmark was internal.', evidenceIds: ['E1'] },
        { text: 'Independent verification was not supplied.', evidenceIds: ['E2'] },
      ],
    },
    vi: {
      title: 'Acme công bố chi phí xử lý giảm',
      feedSummary: 'Acme công bố chi phí xử lý giảm 32% trong phép đo của công ty.',
      summary: 'Theo Acme, chi phí xử lý giảm 32% trong phép đo nội bộ.\n\nBáo cáo chưa cung cấp kiểm chứng độc lập hoặc lịch triển khai.',
      keyPoints: [
        { text: 'Acme công bố chi phí giảm 32%.', evidenceIds: ['E1'] },
        { text: 'Phép đo được thực hiện nội bộ.', evidenceIds: ['E1'] },
        { text: 'Chưa cung cấp kiểm chứng độc lập.', evidenceIds: ['E2'] },
      ],
    },
    evidence: [
      { id: 'E1', sourceId: 1, sourceName: 'Acme', sourceUrl: 'https://acme.example/benchmark' },
      { id: 'E2', sourceId: 2, sourceName: 'Tech Desk', sourceUrl: 'https://tech.example/report' },
    ],
    evidenceLevel: 'rich',
  };
  const article = { title: 'RSS', summary: 'RSS excerpt', translations };
  for (const locale of ['en', 'vi', 'en']) {
    const content = articleContent(article, locale);
    for (const field of ['title', 'feedSummary', 'summary', 'keyPoints']) {
      assert.deepEqual(content[field], translations[locale][field]);
    }
    assert.match(content.summary, /32%/);
    assert.match(content.summary, /\n\n/);
    for (const point of content.keyPoints) {
      const links = content.evidence.filter((source) => point.evidenceIds.includes(source.id));
      assert.ok(links.length > 0);
      assert.ok(links.every((source) => safeHttpUrl(source.sourceUrl)));
    }
  }
});

test('source links only allow HTTP and HTTPS', () => {
  assert.equal(safeHttpUrl('https://source.example/story'), 'https://source.example/story');
  assert.equal(safeHttpUrl('javascript:alert(1)'), undefined);
  assert.equal(safeHttpUrl('file:///secret'), undefined);
  assert.equal(safeHttpUrl('not a url'), undefined);
});

test('unprocessed articles display originals and are not labelled AI generated', () => {
  assert.deepEqual(articleContent({ title: 'Original', summary: null }, 'vi'), {
    title: 'Original', summary: null, feedSummary: null, keyPoints: [], evidence: [], evidenceLevel: undefined, generated: false, schemaVersion: 0,
  });
});

test('V2 uses feedSummary in the feed and exposes detail evidence separately', () => {
  const translations = {
    schemaVersion: 2,
    en: { title: 'Launch', feedSummary: 'Short feed copy.', summary: 'Detailed reader copy.', keyPoints: [{ text: 'Grounded point.', evidenceIds: ['E1'] }] },
    vi: { title: 'Ra mắt', feedSummary: 'Tin ngắn.', summary: 'Nội dung đọc chi tiết.', keyPoints: [{ text: 'Ý có nguồn.', evidenceIds: ['E1'] }] },
    evidence: [{ id: 'E1', sourceId: 1, sourceName: 'Source', sourceUrl: 'https://source.example/story' }],
    evidenceLevel: 'rich',
  };

  assert.deepEqual(articleContent({ title: 'RSS', summary: 'RSS excerpt', translations }, 'en'), {
    title: 'Launch',
    feedSummary: 'Short feed copy.',
    summary: 'Detailed reader copy.',
    keyPoints: translations.en.keyPoints,
    evidence: translations.evidence,
    evidenceLevel: 'rich',
    generated: true,
    schemaVersion: 2,
  });
});
