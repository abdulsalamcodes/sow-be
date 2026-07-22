import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import express from 'express';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.use('/monnify/webhooks', express.raw({ type: 'application/json' }));

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.enableCors();

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
