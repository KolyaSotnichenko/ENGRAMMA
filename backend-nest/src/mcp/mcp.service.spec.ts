import { Test, TestingModule } from '@nestjs/testing';
import { McpService } from './mcp.service';
import { MemoryService } from '../memory/memory.service';
import { MemoryRepository } from '../memory/memory.repository';
import { SqliteService } from '../sqlite/sqlite.service';
import { RemindersService } from '../reminders/reminders.service';

describe('McpService', () => {
  let service: McpService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        McpService,
        { provide: MemoryService, useValue: {} },
        { provide: MemoryRepository, useValue: {} },
        { provide: SqliteService, useValue: {} },
        { provide: RemindersService, useValue: {} },
      ],
    }).compile();

    service = module.get<McpService>(McpService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
