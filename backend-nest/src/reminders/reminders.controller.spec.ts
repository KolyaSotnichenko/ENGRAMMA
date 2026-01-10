import { Test, TestingModule } from '@nestjs/testing';
import { RemindersController } from './reminders.controller';
import { RemindersService } from './reminders.service';
import { SqliteService } from '../sqlite/sqlite.service';

describe('RemindersController', () => {
  let controller: RemindersController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [RemindersController],
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

    controller = module.get<RemindersController>(RemindersController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
