import { test } from 'node:test';
import assert from 'node:assert/strict';
import { articleContent } from '../src/article-content.ts';

test('language switch selects both title and summary from saved translations', () => {
  const article = { title: 'Original title', summary: 'Original excerpt', translations: {
    en: { title: 'New laptop', summary: 'A lighter laptop was released.' },
    vi: { title: 'Máy tính mới', summary: 'Một mẫu máy nhẹ hơn đã ra mắt.' },
  } };
  assert.deepEqual(articleContent(article, 'vi'), { ...article.translations.vi, generated: true });
  assert.deepEqual(articleContent(article, 'en'), { ...article.translations.en, generated: true });
});

test('unprocessed articles display originals and are not labelled AI generated', () => {
  assert.deepEqual(articleContent({ title: 'Original', summary: null }, 'vi'), {
    title: 'Original', summary: null, generated: false,
  });
});
