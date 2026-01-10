import { Test, TestingModule } from '@nestjs/testing';
import { McpController } from './mcp.controller';
import { McpService } from './mcp.service';
import { MemoryService } from '../memory/memory.service';
import { MemoryRepository } from '../memory/memory.repository';
import { SqliteService } from '../sqlite/sqlite.service';
import { RemindersService } from '../reminders/reminders.service';

describe('McpController', () => {
  let controller: McpController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [McpController],
      providers: [
        McpService,
        { provide: MemoryService, useValue: {} },
        { provide: MemoryRepository, useValue: {} },
        { provide: SqliteService, useValue: {} },
        { provide: RemindersService, useValue: {} },
      ],
    }).compile();

    controller = module.get<McpController>(McpController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
