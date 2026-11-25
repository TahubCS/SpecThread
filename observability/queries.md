# Service-health queries

The queries behind `observability/service-health.json` (Grafana: **SpecThread service health**),
one section per panel. Use them in Explore or from an agent with read-only Grafana access. Every
query is limited to production (D48): Prometheus with `deployment_environment_name="production"`,
TraceQL with `resource.deployment.environment.name = "production"`. Uptime-check metrics
(`probe_success`) have no environment label; they come only from the checks in
docs/OBSERVABILITY.md. `tests/api/dashboard.spec.ts` checks both rules and that each panel has a
section here.

Grafana fills in the variables: `$__range` is the dashboard's time range (7 days by default),
`$__interval` the step between points, `$__rate_interval` a safe window for `rate`. Outside a
dashboard, write the window yourself, such as `[7d]`.

Things to know before changing a query:

- **Data sources**: Prometheus `grafanacloud-prom`, Tempo `grafanacloud-traces`.
- **API metrics** come from the API's own OpenTelemetry instruments, labelled
  `service_name="specthread-api"`. The web app sends no metrics of its own.
- **Web metrics** are span metrics that Grafana Cloud builds from web traces
  (`traces_spanmetrics_calls_total`, and `traces_spanmetrics_latency`, a native histogram), labelled
  `service="specthread-web"`. They have the span name (`GET /login`, `RSC GET /login`) and the span
  status, but no HTTP status code. Queries strip the `RSC ` prefix so client navigations and full
  page loads share a row.
- **TraceQL metrics** can't span more than 25 hours on this stack, so panels that need trace
  attributes (HTTP status on the web, SQL text) are fixed to the last 24 hours.
- **API routes** are keyed `METHOD /route`. Requests that matched no route (mostly 404s from
  scanners) show as `METHOD (no matching route)`. `/health` and `/health/ready` are left out of
  the request tables; Render's health check alone is about 60,000 requests a week.
- **GitHub calls**: filter on `server_address="api.github.com"`. The same HttpClient metric also
  counts the OTLP exporter's calls and the API's JWKS fetch.
- **Percentiles** from Prometheus histograms are estimates within a bucket; TraceQL quantiles
  are rounded to powers of two. Look at the count beside a slow percentile.

## Render API

### API up (/health)

Uptime check every 5 minutes from one probe. Red means at least one failed check in that slot.

```promql
min(min_over_time(probe_success{job="specthread-api-health"}[$__interval]))
```

### API uptime, 7 days

Share of successful /health checks over the dashboard's time range.

```promql
avg(avg_over_time(probe_success{job="specthread-api-health"}[$__range]))
```

### API CPU

CPU used by the API process, in cores. The line is Render free's 0.1 CPU (to recheck on Render).

```promql
sum(rate(dotnet_process_cpu_time_seconds_total{service_name="specthread-api", deployment_environment_name="production"}[$__rate_interval]))
```

### API memory

Working set of the API process (largest instance during a deploy overlap). The line is 512 MB; sources disagree between 512 MB and 256 MB for Render free (to recheck).

```promql
max(dotnet_process_memory_working_set_bytes{service_name="specthread-api", deployment_environment_name="production"})
```


## Vercel web

### Web up (/login)

Uptime check every 5 minutes from one probe. /login runs the Next.js server; the landing page is static and would not.

```promql
min(min_over_time(probe_success{job="specthread-web"}[$__interval]))
```

### Web requests per hour

Server requests per route, from span metrics. Includes the uptime check's 12 requests an hour to GET /login.

```promql
sum by (route) (label_replace(increase(traces_spanmetrics_calls_total{service="specthread-web", span_kind="SPAN_KIND_SERVER", deployment_environment_name="production"}[1h]), "route", "$1", "span_name", "(?:RSC )?(.+)")) > 0
```

### Web failed requests per hour

Server spans marked as errors (5xx or a thrown error). Span metrics carry no HTTP status, so 4xx is only in the web failures table (last 24 h).

```promql
sum by (route) (label_replace(increase(traces_spanmetrics_calls_total{service="specthread-web", span_kind="SPAN_KIND_SERVER", deployment_environment_name="production", status_code="STATUS_CODE_ERROR"}[1h]), "route", "$1", "span_name", "(?:RSC )?(.+)")) > 0
```

### Web slow requests per hour (over 2 s)

Estimated from span-metric histograms, so counts are approximate.

```promql
sum by (route) (label_replace(histogram_count(increase(traces_spanmetrics_latency{service="specthread-web", span_kind="SPAN_KIND_SERVER", deployment_environment_name="production"}[1h])) * (1 - histogram_fraction(0, 2, increase(traces_spanmetrics_latency{service="specthread-web", span_kind="SPAN_KIND_SERVER", deployment_environment_name="production"}[1h]))), "route", "$1", "span_name", "(?:RSC )?(.+)")) > 0.5
```


## Database

### Database ready (/health/ready)

Uptime check of the API's readiness endpoint, which runs SELECT 1 (ADR-061). Red with the API strip green means the database, or a full pool, is the problem.

```promql
min(min_over_time(probe_success{job="specthread-api-ready"}[$__interval]))
```

### API connection pool

Npgsql pool "specthread". Waiting above 0 means requests queued for a connection. Better Auth's own pool in the web app is not shown.

A (In use):

```promql
max(db_client_connection_count{service_name="specthread-api", deployment_environment_name="production", db_client_connection_state="used"})
```

B (Waiting):

```promql
max(db_client_connection_npgsql_pending_requests{service_name="specthread-api", deployment_environment_name="production"})
```

C (Cap):

```promql
max(db_client_connection_max{service_name="specthread-api", deployment_environment_name="production"})
```

### Slowest queries, last 24 h (API)

From API SQL spans grouped by query text. TraceQL is limited to 24 hours here, so this table ignores the dashboard's 7 days. p95 is bucketed (powers of two). Better Auth's queries run in the web app and have no query text, so they are not included. Total time is each query's share of database time (D20). Time range fixed to the last 24h.

A:

```traceql
{ resource.service.name = "specthread-api" && resource.deployment.environment.name = "production" && span.db.query.text != nil } | count_over_time() by (span.db.query.text)
```

B:

```traceql
{ resource.service.name = "specthread-api" && resource.deployment.environment.name = "production" && span.db.query.text != nil } | avg_over_time(span:duration) by (span.db.query.text)
```

C:

```traceql
{ resource.service.name = "specthread-api" && resource.deployment.environment.name = "production" && span.db.query.text != nil } | quantile_over_time(span:duration, .95) by (span.db.query.text)
```

D:

```traceql
{ resource.service.name = "specthread-api" && resource.deployment.environment.name = "production" && span.db.query.text != nil } | sum_over_time(span:duration) by (span.db.query.text)
```


## Outside services

### GitHub, Resend, Google sign-in

GitHub and Resend: their status page reports a major or critical outage. Google: the sign-in discovery document is unreachable. Minor incidents stay green.

A (GitHub):

```promql
min(min_over_time(probe_success{job="github-status"}[$__interval]))
```

B (Resend):

```promql
min(min_over_time(probe_success{job="resend-status"}[$__interval]))
```

C (Google sign-in):

```promql
min(min_over_time(probe_success{job="google-sign-in"}[$__interval]))
```

### GitHub calls per hour

API calls to api.github.com (evidence links and refreshes). Empty until someone links or refreshes evidence.

A (Calls):

```promql
sum(increase(http_client_request_duration_seconds_count{service_name="specthread-api", deployment_environment_name="production", server_address="api.github.com"}[1h]))
```

B (Failed):

```promql
sum(increase(http_client_request_duration_seconds_count{service_name="specthread-api", deployment_environment_name="production", server_address="api.github.com", error_type!=""}[1h]))
```

### GitHub call latency (p95)

From the API's HttpClient histogram for api.github.com.

```promql
histogram_quantile(0.95, sum by (le) (rate(http_client_request_duration_seconds_bucket{service_name="specthread-api", deployment_environment_name="production", server_address="api.github.com"}[$__rate_interval])))
```


## Tables

### Most-failed requests, API, 7 days

4xx and 5xx are separate because some 4xx (401, 404, 409) are normal. Health checks are left out.

A:

```promql
round((sum by (route) (label_replace(label_join(sum by (http_request_method, http_route) (increase(http_server_request_duration_seconds_count{service_name="specthread-api", deployment_environment_name="production", http_route!~"/health.*"}[$__range])), "route", " ", "http_request_method", "http_route"), "route", "$1 (no matching route)", "route", "([A-Z]+) ")) > 0))
```

B:

```promql
round((sum by (route) (label_replace(label_join(sum by (http_request_method, http_route) (increase(http_server_request_duration_seconds_count{service_name="specthread-api", deployment_environment_name="production", http_route!~"/health.*", http_response_status_code=~"4.."}[$__range])), "route", " ", "http_request_method", "http_route"), "route", "$1 (no matching route)", "route", "([A-Z]+) ")) or 0 * (sum by (route) (label_replace(label_join(sum by (http_request_method, http_route) (increase(http_server_request_duration_seconds_count{service_name="specthread-api", deployment_environment_name="production", http_route!~"/health.*"}[$__range])), "route", " ", "http_request_method", "http_route"), "route", "$1 (no matching route)", "route", "([A-Z]+) ")) > 0)))
```

C:

```promql
round((sum by (route) (label_replace(label_join(sum by (http_request_method, http_route) (increase(http_server_request_duration_seconds_count{service_name="specthread-api", deployment_environment_name="production", http_route!~"/health.*", http_response_status_code=~"5.."}[$__range])), "route", " ", "http_request_method", "http_route"), "route", "$1 (no matching route)", "route", "([A-Z]+) ")) or 0 * (sum by (route) (label_replace(label_join(sum by (http_request_method, http_route) (increase(http_server_request_duration_seconds_count{service_name="specthread-api", deployment_environment_name="production", http_route!~"/health.*"}[$__range])), "route", " ", "http_request_method", "http_route"), "route", "$1 (no matching route)", "route", "([A-Z]+) ")) > 0)))
```

D:

```promql
(sum by (route) (label_replace(label_join(sum by (http_request_method, http_route) (increase(http_server_request_duration_seconds_count{service_name="specthread-api", deployment_environment_name="production", http_route!~"/health.*", http_response_status_code=~"[45].."}[$__range])), "route", " ", "http_request_method", "http_route"), "route", "$1 (no matching route)", "route", "([A-Z]+) ")) or 0 * (sum by (route) (label_replace(label_join(sum by (http_request_method, http_route) (increase(http_server_request_duration_seconds_count{service_name="specthread-api", deployment_environment_name="production", http_route!~"/health.*"}[$__range])), "route", " ", "http_request_method", "http_route"), "route", "$1 (no matching route)", "route", "([A-Z]+) ")) > 0)) / (sum by (route) (label_replace(label_join(sum by (http_request_method, http_route) (increase(http_server_request_duration_seconds_count{service_name="specthread-api", deployment_environment_name="production", http_route!~"/health.*"}[$__range])), "route", " ", "http_request_method", "http_route"), "route", "$1 (no matching route)", "route", "([A-Z]+) ")) > 0)
```

### Most-failed requests, web, last 24 h

From web traces, which carry the HTTP status; span metrics don't, so this table is limited to TraceQL's 24 hours. Requests to /api/auth/[...all] are every Better Auth endpoint together, so sign-in 429s and sign-up 429s share a row. Time range fixed to the last 24h.

A:

```traceql
{ resource.service.name = "specthread-web" && resource.deployment.environment.name = "production" && span:kind = server } | count_over_time() by (span.http.method, span.http.route)
```

B:

```traceql
{ resource.service.name = "specthread-web" && resource.deployment.environment.name = "production" && span:kind = server && span.http.status_code >= 400 && span.http.status_code < 500 } | count_over_time() by (span.http.method, span.http.route)
```

C:

```traceql
{ resource.service.name = "specthread-web" && resource.deployment.environment.name = "production" && span:kind = server && span.http.status_code >= 500 } | count_over_time() by (span.http.method, span.http.route)
```

D:

```traceql
{ resource.service.name = "specthread-web" && resource.deployment.environment.name = "production" && span:kind = server && span.http.status_code >= 400 } | count_over_time() by (span.http.method, span.http.route)
```

### Slowest routes, 7 days

Layers stack: web time includes the API time it waits for. API figures come from the request histogram, web figures from span metrics, so their percentiles are estimated differently. Linking and refreshing evidence call GitHub and are expected to take tens of seconds. Check Count before trusting a slow p95.

A:

```promql
label_replace(label_replace(round(sum by (route) (label_replace(label_join(sum by (http_request_method, http_route) (increase(http_server_request_duration_seconds_count{service_name="specthread-api", deployment_environment_name="production", http_route!~"/health.*"}[$__range])), "route", " ", "http_request_method", "http_route"), "route", "$1 (no matching route)", "route", "([A-Z]+) ")) > 0), "route", "$1 (expected slow)", "route", "(POST /requirements/[^/]+/evidence/(refresh)?)"), "layer", "API", "", "") or label_replace(round(histogram_count(sum by (route) (label_replace(increase(traces_spanmetrics_latency{service="specthread-web", span_kind="SPAN_KIND_SERVER", deployment_environment_name="production"}[$__range]), "route", "$1", "span_name", "(?:RSC )?(.+)"))) > 0), "layer", "web", "", "")
```

B:

```promql
label_replace(label_replace(sum by (route) (label_replace(label_join(sum by (http_request_method, http_route) (increase(http_server_request_duration_seconds_sum{service_name="specthread-api", deployment_environment_name="production", http_route!~"/health.*"}[$__range])), "route", " ", "http_request_method", "http_route"), "route", "$1 (no matching route)", "route", "([A-Z]+) ")) / (sum by (route) (label_replace(label_join(sum by (http_request_method, http_route) (increase(http_server_request_duration_seconds_count{service_name="specthread-api", deployment_environment_name="production", http_route!~"/health.*"}[$__range])), "route", " ", "http_request_method", "http_route"), "route", "$1 (no matching route)", "route", "([A-Z]+) ")) > 0), "route", "$1 (expected slow)", "route", "(POST /requirements/[^/]+/evidence/(refresh)?)"), "layer", "API", "", "") or label_replace(histogram_avg(sum by (route) (label_replace(increase(traces_spanmetrics_latency{service="specthread-web", span_kind="SPAN_KIND_SERVER", deployment_environment_name="production"}[$__range]), "route", "$1", "span_name", "(?:RSC )?(.+)"))) >= 0, "layer", "web", "", "")
```

C:

```promql
label_replace(label_replace(histogram_quantile(0.95, sum by (route, le) (label_replace(label_join(sum by (http_request_method, http_route, le) (increase(http_server_request_duration_seconds_bucket{service_name="specthread-api", deployment_environment_name="production", http_route!~"/health.*"}[$__range])), "route", " ", "http_request_method", "http_route"), "route", "$1 (no matching route)", "route", "([A-Z]+) "))) >= 0, "route", "$1 (expected slow)", "route", "(POST /requirements/[^/]+/evidence/(refresh)?)"), "layer", "API", "", "") or label_replace(histogram_quantile(0.95, sum by (route) (label_replace(increase(traces_spanmetrics_latency{service="specthread-web", span_kind="SPAN_KIND_SERVER", deployment_environment_name="production"}[$__range]), "route", "$1", "span_name", "(?:RSC )?(.+)"))) >= 0, "layer", "web", "", "")
```
