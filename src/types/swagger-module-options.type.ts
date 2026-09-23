import type { NestExpressApplication } from '@nestjs/platform-express';
import type { SwaggerCustomOptions } from '@nestjs/swagger';

export type TSwaggerModuleOptions = {
  /**
   * Read in `onModuleInit`, not when `forRoot()` runs: `@Module({ imports })`
   * is evaluated as the file loads, before `NestFactory.create()` has returned
   * the app, so the app itself can't be passed directly.
   */
  getApp: () => NestExpressApplication | undefined;
  /** API versions to list in the definition switcher; see `swaggerBootstrap`. */
  versions?: number[];
  /**
   * `swagger://user:password@host/prefix`. Defaults to `process.env.SWAGGER_URI`,
   * then to `swagger://admin:admin@api/docs`.
   */
  uri?: string;
  /** Document title. Defaults to `API`; the version is appended either way. */
  title?: string;
  /** Document description. Defaults to the title. */
  description?: string;
  /** Document version. Defaults to `npm_package_version`, then `0.0.0`. */
  version?: string;
  /** Merged over the built-in Swagger UI options. */
  customOptions?: SwaggerCustomOptions;
};
