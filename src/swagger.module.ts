import {
  DynamicModule,
  Inject,
  MiddlewareConsumer,
  Module,
  NestModule,
  OnModuleInit,
  VersioningType,
} from '@nestjs/common';
import { ApplicationConfig } from '@nestjs/core';
import basicAuth from 'express-basic-auth';

import { parseSwaggerUri, TSwaggerConfig } from './configs/swagger.config';
import { SWAGGER_MODULE_OPTIONS } from './constants/swagger.constants';
import { swaggerBootstrap } from './swagger.bootstrap';
import { TSwaggerModuleOptions } from './types/swagger-module-options.type';
import { routeUnderGlobalPrefix } from './utils/global-prefix';

/**
 * Mounts the Swagger UI behind basic auth, so an application only has to
 * import `SwaggerModule.forRoot()`.
 *
 * Split across two hooks by what each step needs, in the order `app.init()`
 * runs them (registerModules → registerRouter → onModuleInit → 404 handler):
 *
 * - `configure()`, like Bull Board's root module: basic auth goes through the
 *   middleware consumer, and URI versioning is switched on via the injected
 *   `ApplicationConfig`. Both must happen before the router registers
 *   controller routes, or versioning never reaches them. The URI path is
 *   absolute (global prefix included), and Nest prefixes middleware routes
 *   itself, so the guard gets it relative to the prefix.
 * - `onModuleInit()`: `@nestjs/swagger` scans the application's own module
 *   container and serves static assets through the app itself, so the
 *   document needs the built app, read here from `options.getApp()`. This is
 *   the last point where routes can be added before Nest's 404 handler.
 */
@Module({})
export class SwaggerModule implements NestModule, OnModuleInit {
  @Inject()
  protected readonly applicationConfig: ApplicationConfig;

  @Inject(SWAGGER_MODULE_OPTIONS)
  protected readonly options: TSwaggerModuleOptions;

  static forRoot(options: TSwaggerModuleOptions): DynamicModule {
    return {
      module: SwaggerModule,
      providers: [{ provide: SWAGGER_MODULE_OPTIONS, useValue: options }],
    };
  }

  protected get config(): TSwaggerConfig {
    return parseSwaggerUri(this.options.uri);
  }

  configure(consumer: MiddlewareConsumer) {
    const { prefix, userName, userPassword } = this.config;
    const route = routeUnderGlobalPrefix(
      prefix,
      this.applicationConfig.getGlobalPrefix(),
    );

    this.applicationConfig.enableVersioning({ type: VersioningType.URI });

    // `-json`/`-yaml` sit beside the prefix, not under it, so they need
    // their own entries.
    consumer
      .apply(
        basicAuth({ challenge: true, users: { [userName]: userPassword } }),
      )
      .forRoutes(route, `${route}-json`, `${route}-yaml`);
  }

  onModuleInit() {
    const { getApp, versions, title, description, version, customOptions } =
      this.options;
    const app = getApp();

    if (app === undefined) {
      throw new Error(
        'SwaggerModule.forRoot(): getApp() returned undefined — the app must ' +
          'be available before app.init() / app.listen() runs.',
      );
    }

    swaggerBootstrap(app, {
      prefix: this.config.prefix,
      globalPrefix: this.applicationConfig.getGlobalPrefix(),
      versions,
      title,
      description,
      version,
      customOptions,
    });
  }
}
