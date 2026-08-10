import { IngestionController } from './ingestion.controller';

describe('IngestionController', () => {
  it('delegates POST /ingestion/run to the ingestion service', async () => {
    const response = {
      status: 'completed',
      summary: {
        totalSources: 0,
        successfulSources: 0,
        failedSources: 0,
        totalItems: 0,
      },
      sources: [],
    } as const;

    const service = {
      run: jest.fn().mockResolvedValue(response),
    };
    const controller = new IngestionController(service as never);

    await expect(controller.run()).resolves.toBe(response);
    expect(service.run).toHaveBeenCalledTimes(1);
  });
});
