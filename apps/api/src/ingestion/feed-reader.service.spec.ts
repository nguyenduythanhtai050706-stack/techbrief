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

    await expect(
      service.read('https://example.com/feed.xml'),
    ).resolves.toEqual({
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
    });

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