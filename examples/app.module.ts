import { Module } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';

import { SwaggerModule } from '../src';
import { CatsController } from './cats.controller';

export const AppContainer: { app?: NestExpressApplication } = {};

@Module({
  imports: [
    SwaggerModule.forRoot({
      getApp: () => AppContainer.app,
      uri: 'swagger://admin:admin@api-host/api/docs',
      title: 'Example API',
      versions: [1, 2],
    }),
  ],
  controllers: [CatsController],
})
export class AppModule {}
