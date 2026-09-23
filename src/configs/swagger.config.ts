import { URL } from 'node:url';

import { DEFAULT_SWAGGER_URI } from '../constants/swagger.constants';

export type TSwaggerConfig = {
  prefix: string;
  userName: string;
  userPassword: string;
};

/**
 * The whole setup rides on a single URL so it can be pasted into a browser
 * as-is:
 *
 *   swagger://admin:admin@api/docs
 *
 * The credentials guard the docs with HTTP basic auth and the pathname becomes
 * the mount prefix. Falls back to `SWAGGER_URI`, then to the default above.
 */
export function parseSwaggerUri(
  uri: string = process.env.SWAGGER_URI ?? DEFAULT_SWAGGER_URI,
): TSwaggerConfig {
  const { pathname: prefix, username, password } = new URL(uri);

  return {
    prefix,
    // URL keeps credentials percent-encoded; basic auth compares them raw.
    userName: decodeURIComponent(username),
    userPassword: decodeURIComponent(password),
  };
}
