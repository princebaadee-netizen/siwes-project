import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import { AppModule } from './app.module';

async function bootstrap() {
  // rawBody is required so the Paystack webhook's HMAC signature can be checked
  // against the exact bytes Paystack sent.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true });
  app.enableCors({ origin: process.env.FRONTEND_URL ?? 'http://localhost:3000' });
  // Uploaded report logos and cover images are served straight from disk under
  // /uploads; the frontend reaches them through a matching proxy rewrite.
  app.useStaticAssets(join(process.cwd(), 'uploads'), { prefix: '/uploads/' });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.listen(process.env.PORT ?? 4000);
}
bootstrap();
