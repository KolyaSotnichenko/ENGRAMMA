import { Module } from '@nestjs/common';
import { MemoryService } from './memory.service';
import { MemoryController } from './memory.controller';
import { MemoryRepository } from './memory.repository';
import { EmbeddingService } from './embedding.service';
import { SqliteModule } from '../sqlite/sqlite.module';

@Module({
  imports: [SqliteModule],
  controllers: [MemoryController],
  providers: [MemoryService, MemoryRepository, EmbeddingService],
  exports: [MemoryService, MemoryRepository, EmbeddingService],
})
export class MemoryModule {}
