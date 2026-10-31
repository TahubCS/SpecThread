/**
 * Next.js calls this once when the server starts. Telemetry stays off unless
 * OTEL_EXPORTER_OTLP_ENDPOINT is set (ADR-055, docs/OBSERVABILITY.md): without that check
 * @vercel/otel would still try to send to localhost:4318.
 */
export async function register() {
  const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT?.trim();
  if (process.env.NEXT_RUNTIME !== "nodejs" || !endpoint) return;
  const { startTelemetry } = await import("./lib/telemetry");
  startTelemetry(endpoint, process.env.OTEL_EXPORTER_OTLP_HEADERS);
}
