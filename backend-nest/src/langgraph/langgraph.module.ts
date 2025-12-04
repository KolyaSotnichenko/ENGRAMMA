import { Module } from '@nestjs/common';
import { LanggraphService } from './langgraph.service';
import { LanggraphController } from './langgraph.controller';
import { MemoryModule } from '../memory/memory.module';
import { SqliteModule } from '../sqlite/sqlite.module';

@Module({
  imports: [MemoryModule, SqliteModule],
  controllers: [LanggraphController],
  providers: [LanggraphService],
})
export class LanggraphModule {}
