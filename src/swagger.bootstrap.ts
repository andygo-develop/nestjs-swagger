import type { NestExpressApplication } from '@nestjs/platform-express';
import {
  DocumentBuilder,
  getSchemaPath,
  OpenAPIObject,
  SwaggerCustomOptions,
  SwaggerModule,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import type { JSONSchema7 } from 'json-schema';
import { sample } from 'openapi-sampler';
import type {
  MediaTypeObject,
  OperationObject,
  PathItemObject,
  PathsObject,
  ReferenceObject,
  ResponsesObject,
  SchemaObject,
} from 'openapi3-ts/oas30';

import { parseSwaggerUri } from './configs/swagger.config';
import { escapeRegExp, normalizeGlobalPrefix } from './utils/global-prefix';

export type TSwaggerBootstrapOptions = {
  /** Mount prefix. Defaults to the pathname of `SWAGGER_URI`. */
  prefix?: string;
  /**
   * Nest's global prefix, stripped before reading a route's version. Defaults
   * to the app's own, read the same way `@nestjs/swagger` does.
   */
  globalPrefix?: string;
  /** API versions to list in the definition switcher. */
  versions?: number[];
  title?: string;
  description?: string;
  version?: string;
  /** Merged over the built-in Swagger UI options. */
  customOptions?: SwaggerCustomOptions;
};

const patchedSummary = new WeakMap<any, true>();

function getSchemaByRef(
  ref: string,
  document: OpenAPIObject,
): SchemaObject | undefined {
  if (document?.components?.schemas) {
    const name = ref.slice(getSchemaPath('').length);
    const schemaOrReferenceObject = <SchemaObject | ReferenceObject>(
      document.components.schemas[name]
    );

    return '$ref' in schemaOrReferenceObject
      ? getSchemaByRef(schemaOrReferenceObject.$ref, document)
      : schemaOrReferenceObject;
  }

  return undefined;
}

type TJsonPrimitive = string | number | boolean | null | undefined;
type TJsonObjectEntity = { [key: string]: TJsonValue };
type TJsonObject = TJsonObjectEntity | TJsonObjectEntity[];
type TJsonArray = TJsonValue[];
type TJsonValue = TJsonPrimitive | TJsonObject | TJsonArray;
type TExamples = Map<string, TJsonObject>;

function allCombinations(
  items: Record<string, Set<string>>,
): Record<string, string>[] {
  const keys = Object.keys(items);
  const result: Record<string, string>[] = [];

  function backtrack(index: number, current: Record<string, string>) {
    if (index === keys.length) {
      result.push({ ...current });

      return;
    }

    const key = keys[index];

    for (const value of items[key]) {
      current[key] = value;
      backtrack(index + 1, current);
    }

    delete current[key];
  }

  backtrack(0, {});

  return result;
}

function schemaOrReferenceToSchema(
  schemaOrReferenceObject: SchemaObject | ReferenceObject,
  document: OpenAPIObject,
): SchemaObject {
  return '$ref' in schemaOrReferenceObject
    ? <SchemaObject>getSchemaByRef(schemaOrReferenceObject.$ref, document)
    : schemaOrReferenceObject;
}

/**
 * Walks a schema and returns one example per discriminator combination, keyed
 * by `prop=value:prop2=value2`. A schema with no discriminator yields a single
 * entry under the empty key.
 */
function getSchemaExamples(
  schemaOrReferenceObject: SchemaObject | ReferenceObject,
  document: OpenAPIObject,
  processed = new Map<SchemaObject, TExamples>(),
): TExamples {
  const schemaObject = schemaOrReferenceToSchema(
    schemaOrReferenceObject,
    document,
  );
  const result: TExamples = new Map();

  if (processed.has(schemaObject)) {
    return processed.get(schemaObject)!;
  }
  processed.set(schemaObject, result);

  if (schemaObject.properties) {
    const examplesByPropertyByDiscriminator = new Map<string, TExamples>();
    const valuesByDiscriminator: Record<string, Set<string>> = {};

    for (const [property, schemaOrReferenceObject2] of Object.entries<
      SchemaObject | ReferenceObject
    >(schemaObject.properties)) {
      const exampleByDiscriminator: TExamples = new Map();
      const schemaObject2 = schemaOrReferenceToSchema(
        schemaOrReferenceObject2,
        document,
      );

      examplesByPropertyByDiscriminator.set(property, exampleByDiscriminator);
      for (const [discriminatorsValues, example] of getSchemaExamples(
        schemaObject2,
        document,
        processed,
      ).entries()) {
        exampleByDiscriminator.set(discriminatorsValues, example);
        for (const discriminatorValue of discriminatorsValues.split(':')) {
          if (discriminatorValue !== '') {
            const [discriminator, value] = discriminatorValue.split('=');

            if (!valuesByDiscriminator[discriminator]) {
              valuesByDiscriminator[discriminator] = new Set<string>();
            }
            valuesByDiscriminator[discriminator].add(value);
          }
        }
      }
    }

    if (Object.keys(valuesByDiscriminator).length === 0) {
      result.set(
        '',
        Object.fromEntries(
          [...examplesByPropertyByDiscriminator.entries()].map(([k, v]) => [
            k,
            v.get(''),
          ]),
        ),
      );
    } else {
      for (const variant of allCombinations(valuesByDiscriminator)) {
        const discriminators = Object.entries(variant).map(
          ([d, value]) => `${d}=${value}`,
        );
        const example: TJsonValue = {};

        for (const [
          property,
          examplesByDiscriminator,
        ] of examplesByPropertyByDiscriminator.entries()) {
          const matchedKey =
            [...examplesByDiscriminator.keys()].find((key) => {
              return key.split(':').every((p) => discriminators.includes(p));
            }) ?? '';

          example[property] = examplesByDiscriminator.get(matchedKey);
        }

        result.set(discriminators.join(':'), example);
      }
    }

    return result;
  }

  if (schemaObject.type === 'array' && schemaObject.items) {
    const { discriminator, items } = schemaObject;

    if (schemaObject.discriminator) {
      (<SchemaObject>items).discriminator = discriminator;
      delete schemaObject.discriminator;
    }
    const subResult = new Map(getSchemaExamples(items, document, processed));

    for (const [key, example] of subResult.entries()) {
      if (!Array.isArray(example)) {
        subResult.set(key, [example]);
      }
    }

    return subResult;
  }

  if (schemaObject?.discriminator?.mapping) {
    const { propertyName } = schemaObject.discriminator;
    const mapping = new Map<string, string>(
      Object.entries<string>(schemaObject.discriminator.mapping).map(
        ([k, v]) => [v, k],
      ),
    );

    for (const [ref, discriminator] of mapping.entries()) {
      for (const [discriminator2, example] of getSchemaExamples(
        { $ref: ref },
        document,
        processed,
      )) {
        example[propertyName] = discriminator;
        result.set(
          discriminator2 === ''
            ? `${propertyName}=${discriminator}`
            : `${propertyName}=${discriminator}:${discriminator2}`,
          example,
        );
      }
    }

    return result;
  }

  return new Map([
    [
      '',
      <TJsonObject>sample(<JSONSchema7>(<unknown>schemaObject), {}, document),
    ],
  ]);
}

/**
 * Swagger UI only renders one example per media type. Where a schema has a
 * discriminator, expand it into a named example per variant so every shape is
 * visible from the dropdown.
 */
function prepareDoc(document: OpenAPIObject): OpenAPIObject {
  for (const pathsObject of Object.values(document.paths)) {
    for (const operationObject of Object.values(pathsObject)) {
      for (const responsesObject of Object.values<ResponsesObject>(
        operationObject.responses,
      )) {
        if (responsesObject.content) {
          for (const mediaTypeObject of Object.values<MediaTypeObject>(
            responsesObject.content,
          )) {
            if (mediaTypeObject.schema) {
              const result: TExamples = new Map();

              for (const [discriminator, example] of getSchemaExamples(
                mediaTypeObject.schema,
                document,
              ).entries()) {
                result.set(discriminator, example);
              }

              if (result.size > 1) {
                mediaTypeObject.examples = {};
                for (const [discriminator, example] of result.entries()) {
                  mediaTypeObject.examples[discriminator] = {
                    summary: `By discriminator ${discriminator}`,
                    value: example,
                  };
                }
              }
            }
          }
        }
      }
      if (operationObject.requestBody) {
        for (const requestBodyObject of Object.values<MediaTypeObject>(
          operationObject.requestBody.content,
        )) {
          if (requestBodyObject.schema) {
            const result: TExamples = new Map();

            for (const [discriminator, example] of getSchemaExamples(
              requestBodyObject.schema,
              document,
            ).entries()) {
              result.set(discriminator, example);
            }
            if (result.size > 1) {
              requestBodyObject.examples = {};

              for (const [discriminator, example] of result.entries()) {
                requestBodyObject.examples[discriminator] = {
                  summary: `By discriminator ${discriminator}`,
                  value: example,
                };
              }
            }
          }
        }
      }
    }
  }

  return document;
}

/**
 * Collapses the versioned routes down to one document per version: for each
 * `method + route` pair the highest version not above `version` wins, so a v1
 * route that was never re-published still shows up in the v2 document. Each
 * operation keeps the path it is actually served at, so "Try it out" works.
 */
function filterRoutesByVersion(
  document: OpenAPIObject,
  globalPrefix: string,
  skipDeprecated = false,
  version = -1,
) {
  const doc = { ...document };
  // Document paths carry the global prefix (`/api/v1/pets`); the version
  // segment comes right after it. The prefix is optional, since routes in
  // `setGlobalPrefix(..., { exclude })` are served without it (`/v1/health`).
  const regEx = new RegExp(`^(${escapeRegExp(globalPrefix)})?/v([0-9]+)/`);
  // Keyed by `method route`, so each operation is picked on its own: a route
  // can take its GET from v2 and its POST from v1.
  const operationsByKey = new Map<
    string,
    {
      route: string;
      method: string;
      path: string;
      operationObject: OperationObject;
      version: number;
    }
  >();

  for (const [route, pathItemObject] of Object.entries(
    <PathsObject>(<unknown>doc.paths),
  )) {
    const [, , vStr] = route.match(regEx) ?? [];
    const v = vStr === undefined ? -1 : parseInt(vStr, 10);
    const routeWithoutVersion = route.replace(regEx, '$1/');

    for (const [method, operationObject] of Object.entries(
      <PathItemObject>pathItemObject,
    )) {
      if (v > -1 && !patchedSummary.has(operationObject)) {
        operationObject.summary = operationObject.summary
          ? `${operationObject.summary} (Version: v${v})`
          : `(Version: v${v})`;
        patchedSummary.set(operationObject, true);
      }

      // For a version, the highest one not above it wins; unversioned
      // routes (-1) are kept unless a versioned one qualifies. The initial
      // document (no version) takes the earliest of each.
      if (version > -1 && v > version) {
        continue;
      }

      const key = `${method} ${routeWithoutVersion}`;
      const prev = operationsByKey.get(key);
      const wins =
        prev === undefined ||
        (version < 0 ? v < prev.version : prev.version <= v);

      if (wins) {
        operationsByKey.set(key, {
          route: routeWithoutVersion,
          method,
          path: route,
          operationObject,
          version: v,
        });
      }
    }
  }

  const paths: Record<string, PathItemObject> = {};

  for (const { path, method, operationObject } of operationsByKey.values()) {
    if (skipDeprecated && operationObject.deprecated) {
      continue;
    }

    paths[path] ??= {};
    paths[path][method] = operationObject;
  }

  doc.paths = <OpenAPIObject['paths']>paths;

  return doc;
}

/**
 * Builds the document and mounts Swagger UI at the prefix. Basic auth and URI
 * versioning are not set up here: `SwaggerModule.configure()` does both,
 * because they have to be in place before Nest registers routes.
 *
 * Passing `versions` adds the definition switcher: two documents per version
 * (with and without deprecated routes) plus the unversioned "initial" pair,
 * each served from its own JSON endpoint.
 */
export function swaggerBootstrap(
  app: NestExpressApplication,
  {
    prefix = parseSwaggerUri().prefix,
    globalPrefix = (<{ config?: { getGlobalPrefix(): string } }>(<unknown>app))
      .config?.getGlobalPrefix() ?? '',
    versions = [],
    title = 'API',
    description,
    version = process.env.npm_package_version ?? '0.0.0',
    customOptions = {},
  }: TSwaggerBootstrapOptions = {},
) {
  const normalizedGlobalPrefix = normalizeGlobalPrefix(globalPrefix);
  const builder = new DocumentBuilder()
    .setTitle(`${title} v${version}`)
    .setDescription(description ?? `${title} v${version}`)
    .setVersion(version)
    .addBearerAuth({ in: 'header', type: 'http' });

  const options: Omit<OpenAPIObject, 'paths'> = builder.build();
  const document = prepareDoc(SwaggerModule.createDocument(app, options));
  const expressApp = app.getHttpAdapter().getInstance();
  const swaggerCustomOptions: SwaggerCustomOptions = {
    customfavIcon: '/favicon.ico',
    ...customOptions,
    swaggerOptions: {
      tagsSorter: 'alpha',
      persistAuthorization: true,
      ...customOptions.swaggerOptions,
    },
  };

  if (versions.length > 0) {
    swaggerCustomOptions.explorer = true;
    const urls: { url: string; name: string }[] = [];

    for (const version of versions) {
      const url = `${prefix}/docs/v${version}`;

      urls.push({
        url: `${url}-without-deprecated`,
        name: `API v${version} (without deprecated)`,
      });
      expressApp.get(`${url}-without-deprecated`, <any>(
        ((_req: Request, res: Response) =>
          res.json(
            filterRoutesByVersion(
              document,
              normalizedGlobalPrefix,
              true,
              version,
            ),
          ))
      ));

      urls.push({ url, name: `API v${version}` });
      expressApp.get(url, <any>(
        ((_req: Request, res: Response) =>
          res.json(
            filterRoutesByVersion(
              document,
              normalizedGlobalPrefix,
              false,
              version,
            ),
          ))
      ));
    }

    const url = `${prefix}/docs/initial`;

    urls.push({
      url: `${url}-without-deprecated`,
      name: 'API Initial (without deprecated)',
    });
    expressApp.get(`${url}-without-deprecated`, <any>(
      ((_req: Request, res: Response) =>
        res.json(filterRoutesByVersion(document, normalizedGlobalPrefix, true)))
    ));

    urls.push({ url, name: 'API Initial' });
    expressApp.get(url, <any>(
      ((_req: Request, res: Response) =>
        res.json(filterRoutesByVersion(document, normalizedGlobalPrefix)))
    ));

    swaggerCustomOptions.swaggerOptions ??= {};
    swaggerCustomOptions.swaggerOptions.urls = urls;
    swaggerCustomOptions.swaggerOptions['urls.primaryName'] = urls[0].name;
  } else {
    swaggerCustomOptions.url = prefix;
  }

  SwaggerModule.setup(prefix, app, document, swaggerCustomOptions);

  return document;
}
