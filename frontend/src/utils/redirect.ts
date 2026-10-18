/**
 * The in-app path to return to after sign-in, from a `?redirect=` query value.
 * Only same-site paths are accepted ("/team"), never "//host", "/\host" or absolute URLs (no open redirects).
 */
export function safeRedirect(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') && !value.startsWith('/\\')
    ? value
    : fallback;
}
