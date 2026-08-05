import { HealthService } from './health.service';

describe('HealthService', () => {
  it('reports both dependencies up when both checks succeed', async () => {
    const database = { query: jest.fn().mockResolvedValue({ rows: [] }) };
    const redis = { ping: jest.fn().mockResolvedValue('PONG') };
    const service = new HealthService(database as never, redis as never);

    await expect(service.check()).resolves.toEqual({
      statusCode: 200,
      body: { status: 'ok', postgres: 'up', redis: 'up' },
    });
  });

  it('reports degraded when one dependency check fails', async () => {
    const database = {
      query: jest.fn().mockRejectedValue(new Error('database unavailable')),
    };
    const redis = { ping: jest.fn().mockResolvedValue('PONG') };
    const service = new HealthService(database as never, redis as never);

    await expect(service.check()).resolves.toEqual({
      statusCode: 503,
      body: { status: 'degraded', postgres: 'down', redis: 'up' },
    });
  });
});
