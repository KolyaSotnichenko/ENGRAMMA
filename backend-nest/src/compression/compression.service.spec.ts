import { Test, TestingModule } from '@nestjs/testing';
import { CompressionService } from './compression.service';

describe('CompressionService', () => {
  let service: CompressionService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [CompressionService],
    }).compile();

    service = module.get<CompressionService>(CompressionService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
