using System.Security.Claims;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.JsonWebTokens;
using SpecThread.Api.Auth;
using SpecThread.Api.Data;

var builder = WebApplication.CreateBuilder(args);

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

    options.UseNpgsql(connectionString);
});

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

// Requires a valid Better Auth JWT; the fallback policy guarantees a subject.
app.MapGet("/me", (ClaimsPrincipal user) =>
        TypedResults.Ok(new CurrentUserResponse(user.FindFirstValue(JwtRegisteredClaimNames.Sub)!)))
    .WithName("GetCurrentUser")
    .Produces(StatusCodes.Status401Unauthorized);

app.Run();

internal sealed record HealthResponse(string Status);

internal sealed record CurrentUserResponse(string UserId);
