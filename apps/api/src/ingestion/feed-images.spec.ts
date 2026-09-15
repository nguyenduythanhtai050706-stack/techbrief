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
    [
      '<description><![CDATA[<figure><img src="https://cdn.example/atom.jpg?width=1200&#038;quality=90" /></figure>]]></description>',
      'https://cdn.example/atom.jpg?width=1200&quality=90',
    ],
    [
      '<content:encoded><![CDATA[<p><img data-src="https://cdn.example/encoded.jpg" /></p>]]></content:encoded>',
      'https://cdn.example/encoded.jpg',
    ],
    ['', null],
  ])('normalizes image metadata: %s', async (metadata, imageUrl) => {
    const parser = createFeedParser();
    const feed = await parser.parseString(`
      <rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/" xmlns:content="http://purl.org/rss/1.0/modules/content/">
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
