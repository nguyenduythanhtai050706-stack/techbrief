import { RedisService } from './redis.service';

describe('RedisService', () => {
  it('connects lazily and returns PONG', async () => {
    const client = {
      isOpen: false,
      connect: jest.fn().mockResolvedValue(undefined),
      ping: jest.fn().mockResolvedValue('PONG'),
      quit: jest.fn().mockResolvedValue('OK'),
      on: jest.fn(),
    };
    const service = new RedisService(client as never);

    await expect(service.ping()).resolves.toBe('PONG');
    expect(client.connect).toHaveBeenCalledTimes(1);
  });

  it('does not connect again when the client is already open', async () => {
    const client = {
      isOpen: true,
      connect: jest.fn(),
      ping: jest.fn().mockResolvedValue('PONG'),
      quit: jest.fn().mockResolvedValue('OK'),
      on: jest.fn(),
    };
    const service = new RedisService(client as never);

    await service.ping();

    expect(client.connect).not.toHaveBeenCalled();
  });

  it('reads a cached value after lazily connecting', async () => {
    const client = {
      isOpen: false,
      connect: jest.fn().mockResolvedValue(undefined),
      get: jest.fn().mockResolvedValue('2'),
      quit: jest.fn().mockResolvedValue('OK'),
      on: jest.fn(),
    };
    const service = new RedisService(client as never);

    await expect(service.get('articles:v1:version')).resolves.toBe('2');

    expect(client.connect).toHaveBeenCalledTimes(1);
    expect(client.get).toHaveBeenCalledWith('articles:v1:version');
  });

  it('writes a cached value with its requested TTL', async () => {
    const client = {
      isOpen: true,
      connect: jest.fn(),
      set: jest.fn().mockResolvedValue('OK'),
      quit: jest.fn().mockResolvedValue('OK'),
      on: jest.fn(),
    };
    const service = new RedisService(client as never);

    await expect(
      service.set('articles:v1:2:list', '{"items":[]}', 60),
    ).resolves.toBeUndefined();

    expect(client.set).toHaveBeenCalledWith(
      'articles:v1:2:list',
      '{"items":[]}',
      { EX: 60 },
    );
  });

  it('increments a namespace version after lazily connecting', async () => {
    const client = {
      isOpen: false,
      connect: jest.fn().mockResolvedValue(undefined),
      incr: jest.fn().mockResolvedValue(3),
      quit: jest.fn().mockResolvedValue('OK'),
      on: jest.fn(),
    };
    const service = new RedisService(client as never);

    await expect(service.increment('articles:v1:version')).resolves.toBe(3);

    expect(client.connect).toHaveBeenCalledTimes(1);
    expect(client.incr).toHaveBeenCalledWith('articles:v1:version');
  });
});
