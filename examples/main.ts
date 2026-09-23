import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';

import { AppContainer, AppModule } from './app.module';

async function main() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  AppContainer.app = app;
  await app.listen(3000);

  console.log('Swagger UI: http://localhost:3000/docs (admin / admin)');
}

void main();
