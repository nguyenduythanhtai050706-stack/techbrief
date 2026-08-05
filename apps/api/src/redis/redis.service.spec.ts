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
});
