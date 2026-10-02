/** Accepts only an origin: HTTPS, or HTTP on loopback for local development. */
export function apiBaseUrl(value: string | undefined): URL {
  let url: URL | undefined;
  try { url = value ? new URL(value.trim()) : undefined; } catch { url = undefined; }
  const loopback = url?.hostname === "localhost" || url?.hostname === "127.0.0.1" || url?.hostname === "[::1]";
  const secure = url?.protocol === "https:" || (url?.protocol === "http:" && loopback);
  if (!url || !secure || url.pathname !== "/" || url.search || url.hash || url.username || url.password) {
    throw new Error("Configure SPECTHREAD_API_URL as the API origin (HTTPS, or HTTP on loopback). See docs/DEPLOYMENT.md.");
  }
  return url;
}
