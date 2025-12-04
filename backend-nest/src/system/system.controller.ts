import { Controller, Get } from '@nestjs/common';
import { SystemService } from './system.service';
import { ConfigService } from '@nestjs/config';

@Controller('system')
export class SystemController {
  constructor(
    private readonly systemService: SystemService,
    private readonly cfg: ConfigService,
  ) {}

  @Get('/health')
  health() {
    return {
      ok: true,
      version: 'nest',
      mode: String(
        this.cfg.get<string>('ENGRAMMA_MODE') || 'standard',
      ).toLowerCase(),
      port: parseInt(this.cfg.get<string>('ENGRAMMA_PORT') || '8080', 10),
      vec_dim: parseInt(this.cfg.get<string>('ENGRAMMA_VEC_DIM') || '1536', 10),
      cache_segments: parseInt(
        this.cfg.get<string>('ENGRAMMA_CACHE_SEGMENTS') || '4',
        10,
      ),
      max_active: parseInt(
        this.cfg.get<string>('ENGRAMMA_MAX_ACTIVE') || '64',
        10,
      ),
    };
  }
}
