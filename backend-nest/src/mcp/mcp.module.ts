import { Module } from '@nestjs/common';
import { McpService } from './mcp.service';
import { McpController } from './mcp.controller';
import { MemoryModule } from 'src/memory/memory.module';
import { SqliteModule } from 'src/sqlite/sqlite.module';
import { RemindersModule } from 'src/reminders/reminders.module';

@Module({
  imports: [MemoryModule, SqliteModule, RemindersModule],
  controllers: [McpController],
  providers: [McpService],
})
export class McpModule {}
