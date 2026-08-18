import { Logger } from '@nestjs/common';
import { CronJob } from 'cron';
import { IngestionSchedulerService } from './ingestion-scheduler.service';

const response = {
  status: 'completed',
  summary: {
    totalSources: 1,
    successfulSources: 1,
    failedSources: 0,
    totalItems: 2,
  },
  sources: [],
} as const;

const createConfig = (values: Record<string, string> = {}) => ({
  get: jest.fn((key: string, defaultValue: string) => values[key] ?? defaultValue),
});

const createRegistry = () => ({
  addCronJob: jest.fn(),
  deleteCronJob: jest.fn(),
});

describe('IngestionSchedulerService', () => {
  it('does not register a job when scheduling is disabled', async () => {
    const config = createConfig({ INGESTION_SCHEDULER_ENABLED: 'false' });
    const registry = createRegistry();
    const ingestion = { run: jest.fn() };
    const scheduler = new IngestionSchedulerService(
      config as never,
      registry as never,
      ingestion as never,
    );

    scheduler.onApplicationBootstrap();
    await scheduler.onApplicationShutdown();

    expect(registry.addCronJob).not.toHaveBeenCalled();
    expect(registry.deleteCronJob).not.toHaveBeenCalled();
  });

  it.each([
    [{}, '0 * * * *'],
    [{ INGESTION_CRON: '*/5 * * * *' }, '*/5 * * * *'],
  ])('registers the configured cron expression', async (values, expression) => {
    const config = createConfig(values);
    const registry = createRegistry();
    const ingestion = { run: jest.fn() };
    const scheduler = new IngestionSchedulerService(
      config as never,
      registry as never,
      ingestion as never,
    );

    scheduler.onApplicationBootstrap();

    expect(registry.addCronJob).toHaveBeenCalledWith(
      'techbrief-ingestion',
      expect.any(CronJob),
    );
    const job = registry.addCronJob.mock.calls[0][1] as CronJob;
    expect(job.cronTime.source).toBe(expression);

    await scheduler.onApplicationShutdown();
    expect(registry.deleteCronJob).toHaveBeenCalledWith('techbrief-ingestion');
  });

  it('delegates a scheduled run to the shared ingestion service', async () => {
    const config = createConfig();
    const registry = createRegistry();
    const ingestion = { run: jest.fn().mockResolvedValue(response) };
    const scheduler = new IngestionSchedulerService(
      config as never,
      registry as never,
      ingestion as never,
    );

    await scheduler.runScheduledIngestion();

    expect(ingestion.run).toHaveBeenCalledTimes(1);
  });

  it('logs and absorbs an ingestion failure', async () => {
    const logger = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    const config = createConfig();
    const registry = createRegistry();
    const ingestion = { run: jest.fn().mockRejectedValue(new Error('failed')) };
    const scheduler = new IngestionSchedulerService(
      config as never,
      registry as never,
      ingestion as never,
    );

    await expect(scheduler.runScheduledIngestion()).resolves.toBeUndefined();
    expect(logger).toHaveBeenCalled();
    logger.mockRestore();
  });

  it('skips an overlapping run and releases the guard after completion', async () => {
    let completeRun: ((value: typeof response) => void) | undefined;
    const pendingRun = new Promise<typeof response>((resolve) => {
      completeRun = resolve;
    });
    const config = createConfig();
    const registry = createRegistry();
    const ingestion = {
      run: jest.fn().mockReturnValueOnce(pendingRun).mockResolvedValue(response),
    };
    const scheduler = new IngestionSchedulerService(
      config as never,
      registry as never,
      ingestion as never,
    );

    const firstRun = scheduler.runScheduledIngestion();
    await Promise.resolve();
    await scheduler.runScheduledIngestion();
    expect(ingestion.run).toHaveBeenCalledTimes(1);

    completeRun?.(response);
    await firstRun;
    await scheduler.runScheduledIngestion();
    expect(ingestion.run).toHaveBeenCalledTimes(2);
  });
});
