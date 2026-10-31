import { randomBytes } from "node:crypto";

// Reads what the fake OTLP receiver (scripts/test-otlp.mjs, port 5126) has received.
const receiver = "http://127.0.0.1:5126/__otlp/requests";

export type OtlpRequest = { path: string; authorization: string | null; body: Buffer };

/** A W3C traceparent header with a fresh trace ID, so a test can find its own spans and logs. */
export function newTrace() {
  const traceId = randomBytes(16).toString("hex");
  return { traceId, header: `00-${traceId}-${randomBytes(8).toString("hex")}-01`, bytes: Buffer.from(traceId, "hex") };
}

/** Requests whose body contains every needle. Strings are searched as UTF-8, as OTLP protobuf stores them. */
export async function received(...needles: (string | Buffer)[]): Promise<OtlpRequest[]> {
  const query = new URLSearchParams(needles.map(needle =>
    ["contains", (typeof needle === "string" ? Buffer.from(needle) : needle).toString("hex")]));
  const response = await fetch(`${receiver}?${query}`);
  if (!response.ok) throw new Error(`The fake OTLP receiver answered ${response.status}.`);
  const requests = await response.json() as { path: string; authorization: string | null; body: string }[];
  return requests.map(request => ({ ...request, body: Buffer.from(request.body, "base64") }));
}

/** The test value of OTEL_EXPORTER_OTLP_HEADERS ("Authorization=Basic%20dGVzdA=="), as it should arrive. */
export const testAuthorization = "Basic dGVzdA==";
