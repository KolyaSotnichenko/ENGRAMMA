import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    cors: {
      origin: '*',
      methods: 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
      allowedHeaders: 'Content-Type,Authorization,x-api-key,Mcp-Session-Id',
    },
  });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  const cfg = app.get(ConfigService);
  const port = parseInt(cfg.get<string>('ENGRAMMA_PORT') || '8080', 10);
  await app.listen(port);
}
bootstrap();
