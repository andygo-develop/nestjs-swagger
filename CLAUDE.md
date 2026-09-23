# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

`@andygo.dev/nestjs-swagger` is a published NestJS library (extracted from `platinum-os-backend/src/components/swagger`) that mounts Swagger UI behind basic auth. Exports:

- `SwaggerModule.forRoot(options)` — the module; wires basic auth, URI versioning and the UI.
- `swaggerBootstrap(app, options)` — builds the document and mounts the UI only.
- `parseSwaggerUri(uri?)` — parses `swagger://user:pass@host/prefix` (falls back to `SWAGGER_URI`).

## Commands

```bash
npm test                     # run all tests (jest)
npm run lint                 # eslint with --max-warnings=0
npm run build                # tsc → dist/
npm run example              # run the example NestJS app on :3000

# Run a single test file
npx jest tests/swagger.module.spec.ts
```

### Publishing

`npm run bump:{patch,minor,major}` bumps `package.json` only (no tag, no publish). `npm run release` publishes, and refuses unless on a clean, pushed, up-to-date `main`. `preversion` runs lint + test + build.

## Architecture

### Two lifecycle hooks

`SwaggerModule` splits its work by what each step needs, in the order `app.init()` runs them (registerModules → registerRouter → onModuleInit → 404 handler):

- `configure()` — basic auth via the middleware consumer, and `enableVersioning` via the injected `ApplicationConfig`. Must run before the router registers routes. The URI path is absolute (global prefix included) but Nest prefixes middleware routes itself, so `routeUnderGlobalPrefix()` (`src/utils/global-prefix.ts`) hands the consumer the path relative to the prefix, and throws for a path outside it (or equal to it).
- `onModuleInit()` — `@nestjs/swagger` needs the built app to scan and to serve static assets, so the app is read from `options.getApp()` here. Last point where routes can be added before the 404 handler.

`getApp` is a getter because `@Module({ imports })` is evaluated before `NestFactory.create()` returns.

### `swagger.bootstrap.ts`

- `prepareDoc` / `getSchemaExamples` — expand `discriminator` schemas into one named example per variant (Swagger UI renders only one example per media type). Keys look like `prop=value:prop2=value2`.
- `filterRoutesByVersion` — reads the version segment right after the global prefix (`/api/v1/...`, prefix optional for excluded routes); per `method + route`, the highest version ≤ requested wins (initial document: the earliest). Selection is per operation, and each operation keeps its real path (`/v1/...`) so "Try it out" works. Summaries get a `(Version: vN)` suffix once, tracked in a `WeakMap`.

### Test structure

Tests live in `tests/`. `swagger.module.spec.ts` boots a real Nest app from `tests/test-app.ts` (versioned + discriminated routes) and hits it with `supertest`. Close the app in `afterEach`.
