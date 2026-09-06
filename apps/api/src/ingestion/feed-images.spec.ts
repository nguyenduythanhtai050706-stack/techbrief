import { createFeedParser } from './feed-parser';
import { FeedReaderService } from './feed-reader.service';

describe('Feed images from RSS XML', () => {
  it.each([
    [
      '<media:thumbnail url="https://cdn.example/thumb.jpg"/>',
      'https://cdn.example/thumb.jpg',
    ],
    [
      '<media:content url="https://cdn.example/video.mp4" type="video/mp4"/><media:content url="https://cdn.example/photo.jpg" medium="image"/>',
      'https://cdn.example/photo.jpg',
    ],
    [
      '<enclosure url="https://cdn.example/photo.jpg" type="image/jpeg"/>',
      'https://cdn.example/photo.jpg',
    ],
    [
      '<enclosure url="https://cdn.example/audio.mp3" type="audio/mpeg"/>',
      null,
    ],
    [
      '<media:thumbnail url="javascript:alert(1)"/><enclosure url="https://cdn.example/fallback.jpg" type="image/jpeg"/>',
      'https://cdn.example/fallback.jpg',
    ],
    ['', null],
  ])('normalizes image metadata: %s', async (metadata, imageUrl) => {
    const parser = createFeedParser();
    const feed = await parser.parseString(`
      <rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/">
        <channel><title>Example</title><link>https://example.com</link>
          <item><title>Story</title><link>https://example.com/story</link>
            ${metadata}
          </item>
        </channel>
      </rss>`);
    const reader = new FeedReaderService({ parseURL: async () => feed });
    const result = await reader.read('https://example.com/feed');
    expect(result.items[0].imageUrl).toBe(imageUrl);
    expect(result.skippedItems).toBe(0);
  });
});
