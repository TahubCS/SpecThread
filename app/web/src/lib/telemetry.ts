import type { AttributeValue, Attributes } from "@opentelemetry/api";
import { BatchSpanProcessor, type ReadableSpan, type SpanExporter } from "@opentelemetry/sdk-trace-base";
import { OTLPHttpProtoTraceExporter, registerOTel } from "@vercel/otel";
import { apiBaseUrl } from "./api-config";

/**
 * Starts tracing for the web server (ADR-055, docs/OBSERVABILITY.md). Called from
 * src/instrumentation.ts only when OTEL_EXPORTER_OTLP_ENDPOINT is set. Every span passes
 * through `redactSpan` before it leaves the process, so no URL path or query is ever sent.
 */
export function startTelemetry(endpoint: string, headers: string | undefined) {
  const exporter = new OTLPHttpProtoTraceExporter({ url: `${endpoint.replace(/\/+$/, "")}/v1/traces`, headers: parseHeaders(headers) });
  registerOTel({
    serviceName: "specthread-web",
    attributes: { "service.version": process.env.VERCEL_GIT_COMMIT_SHA },
    // The trace continues into the SpecThread API only; other services never receive its IDs.
    instrumentationConfig: { fetch: { propagateContextUrls: apiOrigin() } },
    // The visitor's IP address, which Vercel sets and visitors cannot override. @vercel/otel
    // reads headers only on Vercel, so a header sent to a local server is never recorded.
    attributesFromHeaders: { "client.address": "x-real-ip" },
    // Replaces the default processors, which would also export unredacted spans.
    spanProcessors: [new BatchSpanProcessor(new RedactingExporter(exporter))],
  });
}

function apiOrigin(): string[] {
  try { return [`${apiBaseUrl(process.env.SPECTHREAD_API_URL).origin}/`]; } catch { return []; }
}

/** Reads OTEL_EXPORTER_OTLP_HEADERS: comma-separated `name=value` pairs, percent-encoded. */
export function parseHeaders(value: string | undefined): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const pair of (value ?? "").split(",")) {
    const separator = pair.indexOf("=");
    if (separator <= 0) continue;
    headers[decodeURIComponent(pair.slice(0, separator).trim())] = decodeURIComponent(pair.slice(separator + 1).trim());
  }
  return headers;
}

/** Attributes that hold a raw path or query, which can carry an invitation or password-reset token. */
const PATH_ATTRIBUTES = new Set(["http.target", "url.path", "url.query", "resource.name"]);
/** An absolute URL: only its scheme and host are kept, never credentials, path, or query. */
const URL_PATTERN = /\b(https?:\/\/)(?:[^\s/?#@"'<>]*@)?([^\s/?#"'<>]+)[^\s"'<>]*/gi;

export function redactText(text: string) {
  return text.replace(URL_PATTERN, "$1$2");
}

function redactValue(value: AttributeValue | undefined): AttributeValue | undefined {
  if (typeof value === "string") return redactText(value);
  if (Array.isArray(value)) return value.map(item => typeof item === "string" ? redactText(item) : item) as AttributeValue;
  return value;
}

export function redactAttributes(attributes: Attributes): Attributes {
  const result: Attributes = {};
  for (const [key, value] of Object.entries(attributes)) {
    if (!PATH_ATTRIBUTES.has(key)) result[key] = redactValue(value);
  }
  return result;
}

/** A copy of the span with paths, queries, and URLs removed from its name, attributes, events, links, and status. */
export function redactSpan(span: ReadableSpan): ReadableSpan {
  return {
    name: redactText(span.name),
    kind: span.kind,
    spanContext: () => span.spanContext(),
    parentSpanContext: span.parentSpanContext,
    startTime: span.startTime,
    endTime: span.endTime,
    status: span.status.message === undefined ? span.status : { ...span.status, message: redactText(span.status.message) },
    attributes: redactAttributes(span.attributes),
    links: span.links.map(link => ({ ...link, attributes: link.attributes && redactAttributes(link.attributes) })),
    events: span.events.map(event => ({ ...event, attributes: event.attributes && redactAttributes(event.attributes) })),
    duration: span.duration,
    ended: span.ended,
    resource: span.resource,
    instrumentationScope: span.instrumentationScope,
    droppedAttributesCount: span.droppedAttributesCount,
    droppedEventsCount: span.droppedEventsCount,
    droppedLinksCount: span.droppedLinksCount,
  };
}

class RedactingExporter implements SpanExporter {
  private readonly inner: SpanExporter;
  constructor(inner: SpanExporter) { this.inner = inner; }
  export(spans: ReadableSpan[], resultCallback: Parameters<SpanExporter["export"]>[1]) {
    this.inner.export(spans.map(redactSpan), resultCallback);
  }
  shutdown() { return this.inner.shutdown(); }
  forceFlush() { return this.inner.forceFlush?.() ?? Promise.resolve(); }
}
