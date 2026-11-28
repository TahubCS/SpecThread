using System.Security.Claims;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.JsonWebTokens;
using SpecThread.Api.Auth;
using SpecThread.Api.Data;
using SpecThread.Api.Documents;
using SpecThread.Api.GitHub;
using SpecThread.Api.Observability;
using SpecThread.Api.Projects;
using SpecThread.Api.Requirements;
using SpecThread.Api.Teams;

var builder = WebApplication.CreateBuilder(args);

// Hosting request-start/finish logs include raw invitation secrets in the URL.
builder.Logging.AddFilter("Microsoft.AspNetCore.Hosting.Diagnostics", LogLevel.Warning);
builder.AddSpecThreadObservability();

builder.Services.AddOpenApi();
builder.AddSpecThreadAuthentication();
builder.Services.AddDbContext<SpecThreadDbContext>(options =>
{
    var connectionString = builder.Configuration.GetConnectionString("Database");
    if (string.IsNullOrWhiteSpace(connectionString))
    {
        throw new InvalidOperationException(
            "Configure ConnectionStrings:Database before using EF Core. See docs/DATABASE.md.");
    }

    // Supabase's session pooler allows 15 connections in total, shared with the web app and
    // every other running copy of the API. Npgsql would open up to 100, so cap it unless the
    // connection string sets its own limit. Requests beyond the cap wait for a free connection.
    if (!connectionString.Contains("Pool Size", StringComparison.OrdinalIgnoreCase))
    {
        connectionString = new Npgsql.NpgsqlConnectionStringBuilder(connectionString) { MaxPoolSize = 5 }.ConnectionString;
    }

    // Telemetry labels the pool and SQL spans with this name. By default Npgsql uses the
    // connection string, which holds the database host and username.
    options.UseNpgsql(connectionString, npgsql => npgsql.ConfigureDataSource(dataSource => dataSource.Name = "specthread"));
});

builder.Services.AddHttpClient<IGitHubClient, GitHubClient>(GitHubClient.Configure);

var app = builder.Build();

app.UseAuthentication();
app.UseAuthorization();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi().AllowAnonymous();
}

// Liveness only: starting the API never connects to or changes the database.
app.MapGet("/health", () => TypedResults.Ok(new HealthResponse("ok")))
    .WithName("GetHealth")
    .AllowAnonymous();

// Readiness for uptime checks: runs one query, so it fails while the database is unreachable.
// Render keeps checking /health, so a database outage never restarts a healthy API.
app.MapGet("/health/ready", CheckDatabase)
    .WithName("GetReadiness")
    .AllowAnonymous();

// Requires a valid Better Auth JWT; the fallback policy guarantees a subject.
app.MapGet("/me", (ClaimsPrincipal user) =>
        TypedResults.Ok(new CurrentUserResponse(user.FindFirstValue(JwtRegisteredClaimNames.Sub)!)))
    .WithName("GetCurrentUser")
    .Produces(StatusCodes.Status401Unauthorized);

app.MapProjectEndpoints();
app.MapMemberEndpoints();
app.MapRequirementEndpoints();
app.MapDocumentEndpoints();
app.MapRepositoryEndpoints();
app.MapEvidenceEndpoints();
app.MapReviewEndpoints();
app.MapCriteriaVersionEndpoints();
app.MapFollowUpEndpoints();
app.MapCommentEndpoints();
app.MapReleaseEndpoints();
app.MapMilestoneEndpoints();
app.MapTeamEndpoints();
app.MapTeamManagementEndpoints();
app.MapInvitationEndpoints();

app.Run();

// Answers 503 with no detail, so the reason a check failed never reaches the caller.
static async Task<Results<Ok<HealthResponse>, JsonHttpResult<HealthResponse>>> CheckDatabase(HttpContext context, ILoggerFactory loggers)
{
    using var timeout = CancellationTokenSource.CreateLinkedTokenSource(context.RequestAborted);
    timeout.CancelAfter(TimeSpan.FromSeconds(5));
    try
    {
        // Resolved here, not injected, because a missing connection string throws on resolve.
        var database = context.RequestServices.GetRequiredService<SpecThreadDbContext>();
        await database.Database.ExecuteSqlAsync($"SELECT 1", timeout.Token);
        return TypedResults.Ok(new HealthResponse("ok"));
    }
    catch (Exception exception) when (!context.RequestAborted.IsCancellationRequested)
    {
        // The type only: Npgsql messages can name the database host.
        loggers.CreateLogger("SpecThread.Api.Health").LogWarning("Database readiness check failed: {ExceptionType}", exception.GetType().Name);
        return TypedResults.Json(new HealthResponse("unavailable"), statusCode: StatusCodes.Status503ServiceUnavailable);
    }
}

internal sealed record HealthResponse(string Status);

internal sealed record CurrentUserResponse(string UserId);
