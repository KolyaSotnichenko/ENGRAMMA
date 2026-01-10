import { Test, TestingModule } from '@nestjs/testing';
import { RemindersService } from './reminders.service';
import { SqliteService } from '../sqlite/sqlite.service';

describe('RemindersService', () => {
  let service: RemindersService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RemindersService,
        {
          provide: SqliteService,
          useValue: {
            run: async () => undefined,
            get: async () => null,
            all: async () => [],
          },
        },
      ],
    }).compile();

    service = module.get<RemindersService>(RemindersService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
