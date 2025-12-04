import { Module } from '@nestjs/common';
import { DynamicsService } from './dynamics.service';
import { DynamicsController } from './dynamics.controller';
import { SqliteModule } from 'src/sqlite/sqlite.module';
import { MemoryModule } from 'src/memory/memory.module';

@Module({
  imports: [SqliteModule, MemoryModule],
  controllers: [DynamicsController],
  providers: [DynamicsService],
})
export class DynamicsModule {}
