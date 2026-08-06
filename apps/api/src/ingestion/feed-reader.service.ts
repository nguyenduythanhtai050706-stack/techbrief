interface FeedItem {
  guid?: string;
  link?: string;
  title?: string;
  contentSnippet?: string;
}

interface FeedParser {
  parseURL(url: string): Promise<{
    items?: FeedItem[];
  }>;
}

export class FeedReaderService {
  constructor(private readonly parser: FeedParser) {}

  async read(url: string) {
    const feed = await this.parser.parseURL(url);
    const item = feed.items?.[0];

    if (!item) {
      return {
        items: [],
        skippedItems: 0,
      };
    }

    return {
      items: [
        {
          externalId: item.guid ?? item.link,
          title: item.title,
          url: item.link,
          summary: item.contentSnippet ?? null,
          publishedAt: null,
          author: null,
          categories: [],
        },
      ],
      skippedItems: 0,
    };
  }
}