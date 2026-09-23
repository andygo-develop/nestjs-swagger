/**
 * Nest's global prefix as given to `setGlobalPrefix()` (`api`, `/api/`),
 * normalized to `/api`, or `''` when there is none.
 */
export function normalizeGlobalPrefix(globalPrefix: string): string {
  const trimmed = globalPrefix.replace(/^\/+|\/+$/g, '');

  return trimmed === '' ? '' : `/${trimmed}`;
}

/**
 * Nest adds the global prefix to every middleware route, so an absolute path
 * (`/api/docs`) is handed over relative to it (`/docs`). A path outside the
 * prefix can't be reached through the consumer at all, so it fails loudly
 * rather than leaving the guard on the wrong path. That includes the prefix
 * itself: the guard would land on `/` and cover the whole API, while
 * `-json`/`-yaml` (`/api-json`) would sit outside the prefix.
 */
export function routeUnderGlobalPrefix(
  path: string,
  globalPrefix: string,
): string {
  const prefix = normalizeGlobalPrefix(globalPrefix);

  if (prefix === '') {
    return path;
  }
  if (path.startsWith(`${prefix}/`) && path.length > prefix.length + 1) {
    return path.slice(prefix.length);
  }

  throw new Error(
    `Swagger path "${path}" must be under the global prefix "${prefix}"`,
  );
}

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
