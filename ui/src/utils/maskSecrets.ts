/**
 * Hides credentials before text reaches the UI or the console. Civitai API
 * keys travel as a `token=<key>` query parameter on download URLs, and the
 * backend's download error messages often echo the full URL - a toast with
 * the raw text would leak the key into screenshots and bug reports.
 *
 * Masks `token=`, `api_key=`/`apikey=` query values and `Bearer <key>`
 * authorization values. Pure, no dependencies (tested in
 * tests/frontend/maskSecrets.test.ts).
 */
export function maskSecrets(text: string): string {
  if (!text) return text;
  return text
    .replace(/([?&;\s"'(]|^)(token|api_key|apikey)=([^&\s"'#)]+)/gi, "$1$2=***")
    .replace(/(Bearer\s+)[A-Za-z0-9._~+/=-]+/g, "$1***");
}
