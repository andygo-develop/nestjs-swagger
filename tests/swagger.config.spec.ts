import { parseSwaggerUri } from '../src';

describe('parseSwaggerUri', () => {
  const original = process.env.SWAGGER_URI;

  afterEach(() => {
    if (original === undefined) {
      delete process.env.SWAGGER_URI;
    } else {
      process.env.SWAGGER_URI = original;
    }
  });

  it('parses the uri into mount prefix and credentials', () => {
    expect(parseSwaggerUri('swagger://alice:s3cret@api/internal/docs')).toEqual({
      prefix: '/internal/docs',
      userName: 'alice',
      userPassword: 's3cret',
    });
  });

  it('decodes percent-encoded credentials', () => {
    expect(parseSwaggerUri('swagger://a%40b:p%40ss%3Aword@api/docs')).toMatchObject({
      userName: 'a@b',
      userPassword: 'p@ss:word',
    });
  });

  it('reads SWAGGER_URI when no uri is passed', () => {
    process.env.SWAGGER_URI = 'swagger://env:pw@api/env-docs';

    expect(parseSwaggerUri()).toEqual({
      prefix: '/env-docs',
      userName: 'env',
      userPassword: 'pw',
    });
  });

  it('falls back to the default uri', () => {
    delete process.env.SWAGGER_URI;

    expect(parseSwaggerUri()).toEqual({
      prefix: '/docs',
      userName: 'admin',
      userPassword: 'admin',
    });
  });
});
