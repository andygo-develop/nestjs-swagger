# @andygo.dev/nestjs-swagger

A drop-in NestJS module that mounts **Swagger UI behind HTTP basic auth**,
configured from a single URI:

```
swagger://admin:admin@api/docs
```

- **Basic auth** on the UI and on `-json` / `-yaml` endpoints.
- **URI versioning** switched on for you (`/v1/...`, `/v2/...`).
- **Per-version documents** — a definition switcher with one document per API
  version (with and without deprecated routes); routes not re-published in a
  newer version are carried forward.
- **Discriminator examples** — responses and request bodies with a
  `discriminator` get one named example per variant, so every shape is
  selectable in the UI.

> **Runnable example:** [`examples/`](examples/) — `npm run example`, then
> open http://localhost:3000/docs (admin / admin).

## Install

```bash
npm install @andygo.dev/nestjs-swagger
```

Peer dependencies:

- `@nestjs/common`, `@nestjs/core`, `@nestjs/platform-express` `^10 || ^11`
- `@nestjs/swagger` `^8 || ^11`

## Quick start

`@Module({ imports })` is evaluated before `NestFactory.create()` returns, so
the module takes a **getter** for the app and reads it during `app.init()`.

```ts
// app.module.ts
import { Module } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { SwaggerModule } from '@andygo.dev/nestjs-swagger';

export const AppContainer: { app?: NestExpressApplication } = {};

@Module({
  imports: [
    SwaggerModule.forRoot({
      getApp: () => AppContainer.app,
      title: 'My API',
    }),
  ],
})
export class AppModule {}
```

```ts
// main.ts
const app = await NestFactory.create<NestExpressApplication>(AppModule);

AppContainer.app = app; // before app.init() / app.listen()
await app.listen(3000);
```

Set the URI through the environment (or pass `uri` to `forRoot`):

```bash
SWAGGER_URI=swagger://admin:s3cret@api/docs
```

The credentials guard the docs; the pathname is the mount prefix. Percent-encode
special characters in credentials (`p%40ss` → `p@ss`).

## Options

```ts
SwaggerModule.forRoot({
  getApp: () => NestExpressApplication | undefined; // required
  uri?: string;          // default: process.env.SWAGGER_URI ?? 'swagger://admin:admin@api/docs'
  versions?: number[];   // enables the definition switcher, e.g. [1, 2]
  title?: string;        // default: 'API' — rendered as `${title} v${version}`
  description?: string;  // default: same as the title
  version?: string;      // default: process.env.npm_package_version ?? '0.0.0'
  customOptions?: SwaggerCustomOptions; // merged over the built-in UI options
});
```

## Versioned documents

With `versions: [1, 2]` the UI gets a definition switcher backed by these
endpoints (all behind basic auth):

| Endpoint | Contents |
|---|---|
| `<prefix>/docs/v2` | For each `method + route`, the highest version ≤ 2 |
| `<prefix>/docs/v2-without-deprecated` | Same, minus deprecated operations |
| `<prefix>/docs/initial` | The earliest version of each operation |
| `<prefix>/docs/initial-without-deprecated` | Same, minus deprecated operations |

Operations keep the path they are actually served at, so a v1 route carried
into the v2 document still shows as `/v1/...` and "Try it out" works.

## Without the module

`swaggerBootstrap(app, options)` builds the document and mounts the UI without
basic auth or versioning — useful when you configure those yourself:

```ts
import { swaggerBootstrap } from '@andygo.dev/nestjs-swagger';

swaggerBootstrap(app, { prefix: '/docs', title: 'My API', versions: [1, 2] });
```

## License

MIT
