/**
 * Paths the API server answers itself, not the web app. The service worker
 * must never answer a navigation to one of them with the app's index.html:
 * the app has no route for them, so it would redirect to "/". The public
 * pages under /u/ (SPEC-019, SPEC-020) are the ones people open in a
 * browser; the rest are listed so that nothing the server owns is ever
 * swallowed.
 *
 * Imported by vite.config.ts (navigateFallbackDenylist), so keep it free of
 * app imports.
 */
export const SERVER_PATHS: RegExp[] = [
  /^\/api\//,
  /^\/u\//,
  /^\/websub\//,
  /^\/(?:healthz|readyz)$/,
];

/** True when the server, not the app, answers this path. */
export function isServerPath(pathname: string): boolean {
  return SERVER_PATHS.some((re) => re.test(pathname));
}
