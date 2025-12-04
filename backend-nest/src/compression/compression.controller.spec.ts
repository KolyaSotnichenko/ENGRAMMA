import { Test, TestingModule } from '@nestjs/testing';
import { CompressionController } from './compression.controller';
import { CompressionService } from './compression.service';

describe('CompressionController', () => {
  let controller: CompressionController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CompressionController],
      providers: [CompressionService],
    }).compile();

    controller = module.get<CompressionController>(CompressionController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
