import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { IngestionService } from './ingestion.service';

const JOB_NAME = 'techbrief-ingestion';

@Injectable()
export class IngestionSchedulerService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(IngestionSchedulerService.name);
  private isRunning = false;
  private job: CronJob | undefined;

  constructor(
    private readonly config: ConfigService,
    private readonly schedulerRegistry: SchedulerRegistry,
    private readonly ingestion: IngestionService,
  ) {}

  onApplicationBootstrap(): void {
    const enabled =
      this.config.get<string>('INGESTION_SCHEDULER_ENABLED', 'true') !==
      'false';
    if (!enabled) return;

    const expression = this.config.get<string>('INGESTION_CRON', '0 * * * *');
    this.job = new CronJob(expression, () => {
      void this.runScheduledIngestion();
    });
    this.schedulerRegistry.addCronJob(JOB_NAME, this.job);
    this.job.start();
  }

  async onApplicationShutdown(): Promise<void> {
    if (!this.job) return;

    await this.job.stop();
    this.schedulerRegistry.deleteCronJob(JOB_NAME);
    this.job = undefined;
  }

  async runScheduledIngestion(): Promise<void> {
    if (this.isRunning) {
      this.logger.warn('Skipping overlapping scheduled ingestion run');
      return;
    }

    this.isRunning = true;
    try {
      const result = await this.ingestion.run();
      this.logger.log(
        `Scheduled ingestion ${result.status}: ${result.summary.successfulSources} source(s) succeeded`,
      );
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Scheduled ingestion failed: ${message}`);
    } finally {
      this.isRunning = false;
    }
  }
}
