import { Module } from '@nestjs/common';
import { DashboardController } from './dashboard.controller';
import { SqliteModule } from 'src/sqlite/sqlite.module';
import { MemoryModule } from 'src/memory/memory.module';

@Module({
  imports: [SqliteModule, MemoryModule],
  controllers: [DashboardController],
})
export class DashboardModule {}
