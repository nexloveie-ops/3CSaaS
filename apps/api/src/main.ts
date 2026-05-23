import './load-env';
import { existsSync } from 'fs';
import { join } from 'path';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';

function webDistRoot(): string | null {
  const root = join(__dirname, '../../web/dist');
  return existsSync(join(root, 'index.html')) ? root : null;
}

function requireProductionEnv(): void {
  if (process.env.NODE_ENV !== 'production') return;
  const missing: string[] = [];
  if (!process.env.MONGODB_URI?.trim()) missing.push('MONGODB_URI');
  if (!process.env.JWT_SECRET?.trim()) missing.push('JWT_SECRET');
  if (missing.length === 0) return;
  console.error(
    `[startup] Missing required env: ${missing.join(', ')}. ` +
      'Cloud Run → lz3csaas → Edit → Variables & secrets → map Secret Manager secrets.',
  );
  process.exit(1);
}

async function bootstrap() {
  requireProductionEnv();

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );
  app.setGlobalPrefix('api');
  app.enableCors({
    origin: process.env.CORS_ORIGIN?.split(',') ?? ['http://localhost:5173'],
    credentials: true,
  });

  const webRoot = process.env.SERVE_WEB === '1' ? webDistRoot() : null;
  if (webRoot) {
    app.useStaticAssets(webRoot, { index: false });
    const http = app.getHttpAdapter().getInstance();
    http.get(/^(?!\/api(?:\/|$)).*/, (_req, res) => {
      res.sendFile(join(webRoot, 'index.html'));
    });
  }

  const port = Number(process.env.PORT ?? 3000);
  const host = process.env.HOST ?? '0.0.0.0';
  await app.listen(port, host);
  const mode = webRoot ? 'API + Web' : 'API';
  console.log(`[startup] ${mode} listening on http://${host}:${port}`);
}

bootstrap().catch((err: unknown) => {
  console.error('[startup] Bootstrap failed:', err);
  process.exit(1);
});
