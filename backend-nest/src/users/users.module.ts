import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { SqliteModule } from '../sqlite/sqlite.module';
import { MemoryModule } from '../memory/memory.module';
import { UsersRepository } from './users.repository';

@Module({
  imports: [SqliteModule, MemoryModule],
  controllers: [UsersController],
  providers: [UsersService, UsersRepository],
})
export class UsersModule {}
