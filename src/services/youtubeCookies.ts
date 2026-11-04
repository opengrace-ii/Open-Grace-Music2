/** Strip CR/LF/NUL so a cookie header cannot inject HTTP headers. */
export function sanitizeCookieHeader(value: string): string {
  return value.replace(/[\r\n\0]/g, '').trim();
}
