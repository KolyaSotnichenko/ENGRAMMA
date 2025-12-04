import { Module } from '@nestjs/common';
import { TemporalService } from './temporal.service';
import { TemporalController } from './temporal.controller';
import { SqliteModule } from '../sqlite/sqlite.module';
import { TemporalRepository } from './temporal.repository';

@Module({
  imports: [SqliteModule],
  controllers: [TemporalController],
  providers: [TemporalService, TemporalRepository],
})
export class TemporalModule {}
