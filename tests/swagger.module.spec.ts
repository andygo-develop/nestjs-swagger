import { Module } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { SwaggerModule, TSwaggerModuleOptions } from '../src';
import { PetsModule } from './test-app';

const AUTH = { user: 'alice', pass: 's3cret' };
const URI = `swagger://${AUTH.user}:${AUTH.pass}@api/docs`;

async function createApp(
  options: Omit<TSwaggerModuleOptions, 'getApp'> = {},
): Promise<NestExpressApplication> {
  const holder: { app?: NestExpressApplication } = {};

  @Module({
    imports: [
      PetsModule,
      SwaggerModule.forRoot({ uri: URI, getApp: () => holder.app, ...options }),
    ],
  })
  class AppModule {}

  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleRef.createNestApplication<NestExpressApplication>({
    logger: false,
  });

  holder.app = app;
  await app.init();

  return app;
}

describe('SwaggerModule', () => {
  let app: NestExpressApplication;

  afterEach(async () => {
    await app?.close();
  });

  it('guards the ui and the json document with basic auth', async () => {
    app = await createApp();
    const server = app.getHttpServer();

    await request(server).get('/docs').expect(401);
    await request(server).get('/docs-json').expect(401);
    await request(server)
      .get('/docs-json')
      .auth(AUTH.user, AUTH.pass)
      .expect(200);
  });

  it('enables uri versioning for application routes', async () => {
    app = await createApp();

    await request(app.getHttpServer()).get('/v1/pets').expect(200);
    await request(app.getHttpServer()).get('/v2/pets').expect(200);
  });

  it('uses the configured title and version', async () => {
    app = await createApp({ title: 'Pets API', version: '9.9.9' });

    const { body } = await request(app.getHttpServer())
      .get('/docs-json')
      .auth(AUTH.user, AUTH.pass)
      .expect(200);

    expect(body.info).toMatchObject({
      title: 'Pets API v9.9.9',
      version: '9.9.9',
    });
  });

  it('expands discriminated schemas into one example per variant', async () => {
    app = await createApp();

    const { body } = await request(app.getHttpServer())
      .get('/docs-json')
      .auth(AUTH.user, AUTH.pass)
      .expect(200);
    const { examples } =
      body.paths['/v1/pets'].post.responses['200'].content['application/json'];

    expect(Object.keys(examples).sort()).toEqual(['kind=cat', 'kind=dog']);
    expect(examples['kind=dog'].value).toMatchObject({ kind: 'dog' });
  });

  it('serves one document per version, carrying older routes forward', async () => {
    app = await createApp({ versions: [1, 2] });

    const { body } = await request(app.getHttpServer())
      .get('/docs/docs/v2')
      .auth(AUTH.user, AUTH.pass)
      .expect(200);

    // GET comes from v2; POST and legacy are carried forward from v1 at the
    // paths they are actually served at.
    expect(Object.keys(body.paths).sort()).toEqual([
      '/v1/pets',
      '/v1/pets/legacy',
      '/v2/pets',
    ]);
    expect(Object.keys(body.paths['/v1/pets'])).toEqual(['post']);
    expect(Object.keys(body.paths['/v2/pets'])).toEqual(['get']);
  });

  it('serves the earliest version of each route as the initial document', async () => {
    app = await createApp({ versions: [1, 2] });

    const { body } = await request(app.getHttpServer())
      .get('/docs/docs/initial')
      .auth(AUTH.user, AUTH.pass)
      .expect(200);

    expect(Object.keys(body.paths['/v1/pets']).sort()).toEqual(['get', 'post']);
    expect(body.paths['/v2/pets']).toBeUndefined();
  });

  it('fails fast when the app is not available yet', async () => {
    @Module({
      imports: [SwaggerModule.forRoot({ uri: URI, getApp: () => undefined })],
    })
    class AppModule {}

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({
      logger: false,
    });

    await expect(app.init()).rejects.toThrow(/getApp\(\) returned undefined/);
  });
});
