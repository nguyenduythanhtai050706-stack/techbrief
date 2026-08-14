import { ArticlePersistenceError } from '../articles/article-persistence.service';
import { FeedReaderError } from './feed-reader.service';
import { IngestionService } from './ingestion.service';
import type { NormalizedArticlePreview } from './ingestion.types';
import type { Source } from '../sources/source.types';

const source = (id: number, name: string, url: string): Source => ({
  id,
  name,
  url,
  created_at: new Date('2026-08-06T08:00:00.000Z'),
});

const item = (externalId: string): NormalizedArticlePreview => ({
  externalId,
  title: `Article ${externalId}`,
  url: `https://example.com/${externalId}`,
  summary: null,
  publishedAt: null,
  author: null,
  categories: [],
});

describe('IngestionService', () => {
  it('returns completed and aggregates all successful sources', async () => {
    const sources = {
      list: jest
        .fn()
        .mockResolvedValue([
          source(1, 'One', 'https://one.example/feed.xml'),
          source(2, 'Two', 'https://two.example/feed.xml'),
        ]),
    };
    const reader = {
      read: jest
        .fn()
        .mockResolvedValueOnce({ items: [item('one')], skippedItems: 0 })
        .mockResolvedValueOnce({ items: [item('two')], skippedItems: 1 }),
    };
    const persistence = {
      persist: jest
        .fn()
        .mockResolvedValueOnce('inserted')
        .mockResolvedValueOnce('duplicate'),
    };
    const service = new IngestionService(
      sources as never,
      reader as never,
      persistence as never,
    );

    await expect(service.run()).resolves.toEqual({
      status: 'completed',
      summary: {
        totalSources: 2,
        successfulSources: 2,
        failedSources: 0,
        totalItems: 2,
      },
      sources: [
        {
          sourceId: 1,
          sourceName: 'One',
          sourceUrl: 'https://one.example/feed.xml',
          status: 'ok',
          items: [item('one')],
          skippedItems: 0,
          insertedItems: 1,
          duplicateItems: 0,
        },
        {
          sourceId: 2,
          sourceName: 'Two',
          sourceUrl: 'https://two.example/feed.xml',
          status: 'ok',
          items: [item('two')],
          skippedItems: 1,
          insertedItems: 0,
          duplicateItems: 1,
        },
      ],
    });

    expect(reader.read).toHaveBeenNthCalledWith(
      1,
      'https://one.example/feed.xml',
    );
    expect(reader.read).toHaveBeenNthCalledWith(
      2,
      'https://two.example/feed.xml',
    );
    expect(persistence.persist).toHaveBeenNthCalledWith(1, 1, item('one'));
    expect(persistence.persist).toHaveBeenNthCalledWith(2, 2, item('two'));
  });

  it('returns partial while retaining successful and failed source results', async () => {
    const sources = {
      list: jest
        .fn()
        .mockResolvedValue([
          source(1, 'One', 'https://one.example/feed.xml'),
          source(2, 'Two', 'https://two.example/feed.xml'),
        ]),
    };
    const reader = {
      read: jest
        .fn()
        .mockResolvedValueOnce({ items: [item('one')], skippedItems: 0 })
        .mockRejectedValueOnce(new FeedReaderError('FETCH_FAILED')),
    };
    const persistence = { persist: jest.fn().mockResolvedValue('inserted') };
    const service = new IngestionService(
      sources as never,
      reader as never,
      persistence as never,
    );

    await expect(service.run()).resolves.toEqual({
      status: 'partial',
      summary: {
        totalSources: 2,
        successfulSources: 1,
        failedSources: 1,
        totalItems: 1,
      },
      sources: [
        {
          sourceId: 1,
          sourceName: 'One',
          sourceUrl: 'https://one.example/feed.xml',
          status: 'ok',
          items: [item('one')],
          skippedItems: 0,
          insertedItems: 1,
          duplicateItems: 0,
        },
        {
          sourceId: 2,
          sourceName: 'Two',
          sourceUrl: 'https://two.example/feed.xml',
          status: 'error',
          items: [],
          skippedItems: 0,
          error: { code: 'FETCH_FAILED' },
        },
      ],
    });

    expect(persistence.persist).toHaveBeenCalledTimes(1);
    expect(persistence.persist).toHaveBeenCalledWith(1, item('one'));
  });

  it('returns failed when every source fails', async () => {
    const sources = {
      list: jest
        .fn()
        .mockResolvedValue([source(1, 'One', 'https://one.example/feed.xml')]),
    };
    const reader = {
      read: jest.fn().mockRejectedValue(new FeedReaderError('PARSE_FAILED')),
    };
    const persistence = { persist: jest.fn() };
    const service = new IngestionService(
      sources as never,
      reader as never,
      persistence as never,
    );

    await expect(service.run()).resolves.toEqual({
      status: 'failed',
      summary: {
        totalSources: 1,
        successfulSources: 0,
        failedSources: 1,
        totalItems: 0,
      },
      sources: [
        {
          sourceId: 1,
          sourceName: 'One',
          sourceUrl: 'https://one.example/feed.xml',
          status: 'error',
          items: [],
          skippedItems: 0,
          error: { code: 'PARSE_FAILED' },
        },
      ],
    });

    expect(persistence.persist).not.toHaveBeenCalled();
  });

  it('returns completed with empty results when no sources exist', async () => {
    const sources = {
      list: jest.fn().mockResolvedValue([]),
    };
    const reader = { read: jest.fn() };
    const persistence = { persist: jest.fn() };
    const service = new IngestionService(
      sources as never,
      reader as never,
      persistence as never,
    );

    await expect(service.run()).resolves.toEqual({
      status: 'completed',
      summary: {
        totalSources: 0,
        successfulSources: 0,
        failedSources: 0,
        totalItems: 0,
      },
      sources: [],
    });

    expect(reader.read).not.toHaveBeenCalled();
    expect(persistence.persist).not.toHaveBeenCalled();
  });

  it('returns a source error when persistence fails while retaining other sources', async () => {
    const sources = {
      list: jest
        .fn()
        .mockResolvedValue([
          source(1, 'One', 'https://one.example/feed.xml'),
          source(2, 'Two', 'https://two.example/feed.xml'),
        ]),
    };
    const reader = {
      read: jest
        .fn()
        .mockResolvedValueOnce({ items: [item('one')], skippedItems: 0 })
        .mockResolvedValueOnce({ items: [item('two')], skippedItems: 0 }),
    };
    const persistence = {
      persist: jest
        .fn()
        .mockRejectedValueOnce(new ArticlePersistenceError())
        .mockResolvedValueOnce('inserted'),
    };
    const service = new IngestionService(
      sources as never,
      reader as never,
      persistence as never,
    );

    await expect(service.run()).resolves.toEqual({
      status: 'partial',
      summary: {
        totalSources: 2,
        successfulSources: 1,
        failedSources: 1,
        totalItems: 1,
      },
      sources: [
        {
          sourceId: 1,
          sourceName: 'One',
          sourceUrl: 'https://one.example/feed.xml',
          status: 'error',
          items: [],
          skippedItems: 0,
          error: { code: 'PERSIST_FAILED' },
        },
        {
          sourceId: 2,
          sourceName: 'Two',
          sourceUrl: 'https://two.example/feed.xml',
          status: 'ok',
          items: [item('two')],
          skippedItems: 0,
          insertedItems: 1,
          duplicateItems: 0,
        },
      ],
    });
  });
});
