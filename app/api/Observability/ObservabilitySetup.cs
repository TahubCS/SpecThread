using System.Diagnostics;
using System.Security.Claims;
using Microsoft.IdentityModel.JsonWebTokens;
using Npgsql;
using OpenTelemetry;
using OpenTelemetry.Exporter;
using OpenTelemetry.Logs;
using OpenTelemetry.Metrics;
using OpenTelemetry.Resources;
using OpenTelemetry.Trace;

namespace SpecThread.Api.Observability;

// Sends traces, metrics, and logs over OTLP/HTTP when OTEL_EXPORTER_OTLP_ENDPOINT is set
// (ADR-055, docs/OBSERVABILITY.md). Without it nothing is registered, so local runs, tests,
// and CI behave exactly as before. OTEL_EXPORTER_OTLP_HEADERS carries the backend's credentials.
internal static class ObservabilitySetup
{
    private const string EndpointSetting = "OTEL_EXPORTER_OTLP_ENDPOINT";

    public static void AddSpecThreadObservability(this WebApplicationBuilder builder)
    {
        var endpoint = ReadEndpoint(builder.Configuration[EndpointSetting]);
        if (endpoint is null) return;

        // Framework Information logs repeat what spans already record, and some include raw
        // request paths. Only warnings and errors from them are sent.
        foreach (var category in new[] { "Microsoft", "System", "Npgsql" })
        {
            builder.Logging.AddFilter<OpenTelemetryLoggerProvider>(category, LogLevel.Warning);
        }

        builder.Services.AddOpenTelemetry()
            .ConfigureResource(resource => resource
                // Render sets RENDER_GIT_COMMIT to the deployed commit.
                .AddService("specthread-api", serviceVersion: builder.Configuration["RENDER_GIT_COMMIT"])
                .AddAttributes([new("deployment.environment.name", builder.Environment.EnvironmentName.ToLowerInvariant())]))
            .WithTracing(tracing => tracing
                .AddAspNetCoreInstrumentation(options =>
                {
                    // Render's health checks would outnumber real requests; metrics still count them.
                    options.Filter = context => context.Request.Path != "/health";
                    options.EnrichWithHttpResponse = RedactAndIdentify;
                })
                .AddHttpClientInstrumentation()
                .AddNpgsql())
            .WithMetrics(metrics => metrics
                .AddMeter("Microsoft.AspNetCore.Hosting", "Microsoft.AspNetCore.Server.Kestrel", "System.Net.Http", "System.Runtime", "Npgsql"))
            .WithLogging(configureBuilder: null, configureOptions: options => options.IncludeFormattedMessage = true)
            .UseOtlpExporter(OtlpExportProtocol.HttpProtobuf, endpoint);
    }

    // The raw path can hold an invitation token, so it is replaced by the route template, or
    // dropped when no route matched. The caller is recorded by user ID only, never email or name.
    private static void RedactAndIdentify(Activity activity, HttpResponse response)
    {
        var context = response.HttpContext;
        activity.SetTag("url.path", (context.GetEndpoint() as RouteEndpoint)?.RoutePattern.RawText);
        var userId = context.User.FindFirstValue(JwtRegisteredClaimNames.Sub);
        if (userId is not null) activity.SetTag("user.id", userId);
    }

    // Blank means off. Anything else must be an HTTP(S) URL, so a typo fails the deploy visibly
    // instead of silently sending nothing.
    private static Uri? ReadEndpoint(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return null;
        if (Uri.TryCreate(value.Trim(), UriKind.Absolute, out var uri) && (uri.Scheme == Uri.UriSchemeHttps || uri.Scheme == Uri.UriSchemeHttp))
        {
            return uri;
        }
        throw new InvalidOperationException(
            $"{EndpointSetting} must be an HTTP(S) URL, or empty to turn telemetry off. See docs/OBSERVABILITY.md.");
    }
}
