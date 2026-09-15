INSERT INTO sources (name, url)
VALUES
  ('The Verge', 'https://www.theverge.com/rss/index.xml'),
  ('Ars Technica', 'https://feeds.arstechnica.com/arstechnica/index'),
  ('Engadget', 'https://www.engadget.com/rss.xml'),
  ('WIRED', 'https://www.wired.com/feed/rss')
ON CONFLICT (url) DO NOTHING;
