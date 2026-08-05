import { ConflictException } from '@nestjs/common';
import { SourcesService } from './sources.service';

describe('SourcesService', () => {
  it('lists sources newest first', async () => {
    const rows = [
      {
        id: 1,
        name: 'TechBrief Demo',
        url: 'https://example.com/feed.xml',
        created_at: new Date('2026-08-05T00:00:00.000Z'),
      },
    ];
    const database = { query: jest.fn().mockResolvedValue({ rows }) };
    const service = new SourcesService(database as never);

    await expect(service.list()).resolves.toEqual(rows);
    expect(database.query).toHaveBeenCalledWith(
      expect.stringContaining('ORDER BY created_at DESC'),
    );
  });

  it('creates a source with parameterized SQL', async () => {
    const created = {
      id: 1,
      name: 'TechBrief Demo',
      url: 'https://example.com/feed.xml',
      created_at: new Date('2026-08-05T00:00:00.000Z'),
    };
    const database = {
      query: jest.fn().mockResolvedValue({ rows: [created] }),
    };
    const service = new SourcesService(database as never);

    await expect(
      service.create({ name: created.name, url: created.url }),
    ).resolves.toEqual(created);
    expect(database.query).toHaveBeenCalledWith(
      expect.stringContaining('VALUES ($1, $2)'),
      [created.name, created.url],
    );
  });

  it('maps a duplicate URL database error to a conflict', async () => {
    const duplicateError = Object.assign(new Error('duplicate'), {
      code: '23505',
    });
    const database = { query: jest.fn().mockRejectedValue(duplicateError) };
    const service = new SourcesService(database as never);

    await expect(
      service.create({ name: 'Duplicate', url: 'https://example.com/feed.xml' }),
    ).rejects.toThrow(ConflictException);
  });
});
