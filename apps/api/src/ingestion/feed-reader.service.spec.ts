import { FeedReaderService } from './feed-reader.service';

describe('FeedReaderService', () => {
  it('reads and normalizes one feed item', async () => {
    const parser = {
      parseURL: jest.fn().mockResolvedValue({
        items: [
          {
            guid: 'guid-1',
            link: 'https://example.com/article-1',
            title: 'Article 1',
          },
        ],
      }),
    };

    const service = new FeedReaderService(parser);

    await expect(service.read('https://example.com/feed.xml')).resolves.toEqual(
      {
        items: [
          {
            externalId: 'guid-1',
            title: 'Article 1',
            url: 'https://example.com/article-1',
            summary: null,
            publishedAt: null,
            author: null,
            categories: [],
          },
        ],
        skippedItems: 0,
      },
    );

    expect(parser.parseURL).toHaveBeenCalledWith(
      'https://example.com/feed.xml',
    );
  });
});

it('uses contentSnippet as the summary', async () => {
  const parser = {
    parseURL: jest.fn().mockResolvedValue({
      items: [
        {
          link: 'https://example.com/article-2',
          title: 'Article 2',
          contentSnippet: 'Short summary',
        },
      ],
    }),
  };

  const service = new FeedReaderService(parser);

  await expect(
    service.read('https://example.com/feed.xml'),
  ).resolves.toMatchObject({
    items: [
      {
        title: 'Article 2',
        summary: 'Short summary',
      },
    ],
  });
});

it('normalizes isoDate to publishedAt', async () => {
  const parser = {
    parseURL: jest.fn().mockResolvedValue({
      items: [
        {
          link: 'https://example.com/article-3',
          title: 'Article 3',
          isoDate: '2026-08-10T08:00:00Z',
        },
      ],
    }),
  };

  const service = new FeedReaderService(parser);

  await expect(
    service.read('https://example.com/feed.xml'),
  ).resolves.toMatchObject({
    items: [
      {
        title: 'Article 3',
        publishedAt: '2026-08-10T08:00:00.000Z',
      },
    ],
  });
});

it('falls back to author when creator is absent', async () => {
  const parser = {
    parseURL: jest.fn().mockResolvedValue({
      items: [
        {
          link: 'https://example.com/article-5',
          title: 'Article 5',
          author: 'Grace Hopper',
        },
      ],
    }),
  };

  const service = new FeedReaderService(parser);

  await expect(
    service.read('https://example.com/feed.xml'),
  ).resolves.toMatchObject({
    items: [
      {
        title: 'Article 5',
        author: 'Grace Hopper',
      },
    ],
  });
});

it('keeps feed categories', async () => {
  const parser = {
    parseURL: jest.fn().mockResolvedValue({
      items: [
        {
          link: 'https://example.com/article-6',
          title: 'Article 6',
          categories: ['AI', 'Cloud'],
        },
      ],
    }),
  };

  const service = new FeedReaderService(parser);

  await expect(
    service.read('https://example.com/feed.xml'),
  ).resolves.toMatchObject({
    items: [
      {
        title: 'Article 6',
        categories: ['AI', 'Cloud'],
      },
    ],
  });
});

it('skips an item without a title', async () => {
  const parser = {
    parseURL: jest.fn().mockResolvedValue({
      items: [
        {
          link: 'https://example.com/article-7',
        },
      ],
    }),
  };

  const service = new FeedReaderService(parser);

  await expect(service.read('https://example.com/feed.xml')).resolves.toEqual({
    items: [],
    skippedItems: 1,
  });
});

it('normalizes multiple valid feed items', async () => {
  const parser = {
    parseURL: jest.fn().mockResolvedValue({
      items: [
        {
          guid: 'guid-8',
          link: 'https://example.com/article-8',
          title: 'Article 8',
        },
        {
          guid: 'guid-9',
          link: 'https://example.com/article-9',
          title: 'Article 9',
        },
      ],
    }),
  };

  const service = new FeedReaderService(parser);

  const result = await service.read('https://example.com/feed.xml');

  expect(result.items).toHaveLength(2);
  expect(result.items.map((item) => item.title)).toEqual([
    'Article 8',
    'Article 9',
  ]);
  expect(result.skippedItems).toBe(0);
});

it('uses null for an invalid isoDate', async () => {
  const parser = {
    parseURL: jest.fn().mockResolvedValue({
      items: [
        {
          link: 'https://example.com/article-10',
          title: 'Article 10',
          isoDate: 'not-a-date',
        },
      ],
    }),
  };

  const service = new FeedReaderService(parser);

  await expect(
    service.read('https://example.com/feed.xml'),
  ).resolves.toMatchObject({
    items: [
      {
        title: 'Article 10',
        publishedAt: null,
      },
    ],
  });
});

it('returns at most 50 valid items', async () => {
  const parser = {
    parseURL: jest.fn().mockResolvedValue({
      items: Array.from({ length: 51 }, (_, index) => ({
        guid: `guid-${index}`,
        link: `https://example.com/article-${index}`,
        title: `Article ${index}`,
      })),
    }),
  };

  const service = new FeedReaderService(parser);

  const result = await service.read('https://example.com/feed.xml');

  expect(result.items).toHaveLength(50);
  expect(result.skippedItems).toBe(0);
});

it('maps a network failure to FETCH_FAILED', async () => {
  const networkError = Object.assign(new Error('DNS lookup failed'), {
    code: 'ENOTFOUND',
  });

  const parser = {
    parseURL: jest.fn().mockRejectedValue(networkError),
  };

  const service = new FeedReaderService(parser);

  await expect(
    service.read('https://example.com/feed.xml'),
  ).rejects.toMatchObject({
    code: 'FETCH_FAILED',
  });
});

it('maps a parser failure to PARSE_FAILED', async () => {
  const parser = {
    parseURL: jest.fn().mockRejectedValue(new Error('malformed XML')),
  };

  const service = new FeedReaderService(parser);

  await expect(
    service.read('https://example.com/feed.xml'),
  ).rejects.toMatchObject({
    code: 'PARSE_FAILED',
  });
});

it('uses creator as the author', async () => {
  const parser = {
    parseURL: jest.fn().mockResolvedValue({
      items: [
        {
          link: 'https://example.com/article-4',
          title: 'Article 4',
          creator: 'Ada Lovelace',
        },
      ],
    }),
  };

  const service = new FeedReaderService(parser);

  await expect(
    service.read('https://example.com/feed.xml'),
  ).resolves.toMatchObject({
    items: [
      {
        title: 'Article 4',
        author: 'Ada Lovelace',
      },
    ],
  });
});

it('maps a parsed feed without an items array to INVALID_FEED', async () => {
  const parser = {
    parseURL: jest.fn().mockResolvedValue({}),
  };

  const service = new FeedReaderService(parser);

  await expect(
    service.read('https://example.com/feed.xml'),
  ).rejects.toMatchObject({
    code: 'INVALID_FEED',
  });
});

it('uses content as the summary when contentSnippet is absent', async () => {
  const parser = {
    parseURL: jest.fn().mockResolvedValue({
      items: [
        {
          link: 'https://example.com/atom-1',
          title: 'Atom article',
          content: '<p>Atom body</p>',
        },
      ],
    }),
  };

  const service = new FeedReaderService(parser);

  await expect(
    service.read('https://example.com/atom.xml'),
  ).resolves.toMatchObject({
    items: [
      {
        title: 'Atom article',
        summary: '<p>Atom body</p>',
      },
    ],
  });
});

it('skips an item with a relative link', async () => {
  const parser = {
    parseURL: jest.fn().mockResolvedValue({
      items: [
        {
          link: '/article-1',
          title: 'Relative article',
        },
      ],
    }),
  };

  const service = new FeedReaderService(parser);

  await expect(service.read('https://example.com/feed.xml')).resolves.toEqual({
    items: [],
    skippedItems: 1,
  });
});

it('falls back to the link when guid is empty', async () => {
  const parser = {
    parseURL: jest.fn().mockResolvedValue({
      items: [
        {
          guid: '',
          link: 'https://example.com/article-1',
          title: 'Article 1',
        },
      ],
    }),
  };

  const service = new FeedReaderService(parser);

  await expect(
    service.read('https://example.com/feed.xml'),
  ).resolves.toMatchObject({
    items: [
      {
        externalId: 'https://example.com/article-1',
      },
    ],
  });
});

it('maps a timeout to FETCH_FAILED', async () => {
  const timeoutError = Object.assign(new Error('request timed out'), {
    code: 'ETIMEDOUT',
  });

  const parser = {
    parseURL: jest.fn().mockRejectedValue(timeoutError),
  };

  const service = new FeedReaderService(parser);

  await expect(
    service.read('https://example.com/feed.xml'),
  ).rejects.toMatchObject({
    code: 'FETCH_FAILED',
  });
});

it('maps a refused connection to FETCH_FAILED', async () => {
  const refusedError = Object.assign(new Error('connection refused'), {
    code: 'ECONNREFUSED',
  });

  const parser = {
    parseURL: jest.fn().mockRejectedValue(refusedError),
  };

  const service = new FeedReaderService(parser);

  await expect(
    service.read('https://example.com/feed.xml'),
  ).rejects.toMatchObject({
    code: 'FETCH_FAILED',
  });
});
it('maps a reset connection to FETCH_FAILED', async () => {
  const resetError = Object.assign(new Error('connection reset'), {
    code: 'ECONNRESET',
  });

  const parser = {
    parseURL: jest.fn().mockRejectedValue(resetError),
  };

  const service = new FeedReaderService(parser);

  await expect(
    service.read('https://example.com/feed.xml'),
  ).rejects.toMatchObject({
    code: 'FETCH_FAILED',
  });
});

it('maps an Undici connection timeout to FETCH_FAILED', async () => {
  const timeoutError = Object.assign(new Error('connection timed out'), {
    code: 'UND_ERR_CONNECT_TIMEOUT',
  });

  const parser = {
    parseURL: jest.fn().mockRejectedValue(timeoutError),
  };

  const service = new FeedReaderService(parser);

  await expect(
    service.read('https://example.com/feed.xml'),
  ).rejects.toMatchObject({
    code: 'FETCH_FAILED',
  });
});
