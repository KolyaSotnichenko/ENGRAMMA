import { Test, TestingModule } from '@nestjs/testing';
import { TemporalController } from './temporal.controller';
import { TemporalService } from './temporal.service';

describe('TemporalController', () => {
  let controller: TemporalController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TemporalController],
      providers: [TemporalService],
    }).compile();

    controller = module.get<TemporalController>(TemporalController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
