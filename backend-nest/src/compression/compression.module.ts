import { Module } from '@nestjs/common';
import { CompressionService } from './compression.service';
import { CompressionController } from './compression.controller';

@Module({
  controllers: [CompressionController],
  providers: [CompressionService],
})
export class CompressionModule {}
