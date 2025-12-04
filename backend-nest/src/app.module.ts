import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from '@nestjs/config';
import { SystemModule } from './system/system.module';
import { MemoryModule } from './memory/memory.module';
import { ApiKeyGuard } from './guards/api-key.guard';
import { APP_GUARD } from '@nestjs/core';
import { CompressionModule } from './compression/compression.module';
import { SqliteModule } from './sqlite/sqlite.module';
import { UsersModule } from './users/users.module';
import { TemporalModule } from './temporal/temporal.module';
import { DynamicsModule } from './dynamics/dynamics.module';
import { LanggraphModule } from './langgraph/langgraph.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { McpModule } from './mcp/mcp.module';

@Module({
  imports: ((): any[] => {
    const base = [
      ConfigModule.forRoot({
        envFilePath: ['../.env', '.env'],
        isGlobal: true,
      }),
      SystemModule,
      MemoryModule,
      CompressionModule,
      SqliteModule,
      UsersModule,
      TemporalModule,
      DynamicsModule,
      DashboardModule,
      McpModule,
    ];
    const mode = String(process.env.ENGRAMMA_MODE || 'standard').toLowerCase();
    if (mode === 'langgraph') base.push(LanggraphModule);
    return base;
  })(),
  controllers: [AppController],
  providers: [AppService, { provide: APP_GUARD, useClass: ApiKeyGuard }],
})
export class AppModule {}
