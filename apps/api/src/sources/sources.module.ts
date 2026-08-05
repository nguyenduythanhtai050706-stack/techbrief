import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { SourcesController } from './sources.controller';
import { SourcesService } from './sources.service';

@Module({
  imports: [DatabaseModule],
  controllers: [SourcesController],
  providers: [SourcesService],
})
export class SourcesModule {}
