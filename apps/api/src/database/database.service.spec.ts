import { DatabaseService } from './database.service';

describe('DatabaseService', () => {
  it('forwards SQL text and parameters to the PostgreSQL pool', async () => {
    const query = jest.fn().mockResolvedValue({
      rows: [{ value: 1 }],
      rowCount: 1,
    });
    const pool = { query, end: jest.fn() } as never;
    const service = new DatabaseService(pool);

    await service.query('SELECT $1 AS value', [1]);

    expect(query).toHaveBeenCalledWith('SELECT $1 AS value', [1]);
  });
});
