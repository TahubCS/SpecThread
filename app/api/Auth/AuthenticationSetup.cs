using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Protocols;
using Microsoft.IdentityModel.Protocols.OpenIdConnect;
using Microsoft.IdentityModel.Tokens;

namespace SpecThread.Api.Auth;

// Validates Better Auth JWTs (ES256) issued by the web app. See ADR-015.
internal static class AuthenticationSetup
{
    private const string IssuerSetting = "Auth:Issuer";
    private const string JwksPath = "/api/auth/jwks";

    public static void AddSpecThreadAuthentication(this WebApplicationBuilder builder)
    {
        var issuer = ReadIssuer(builder.Configuration[IssuerSetting]);

        builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
            .AddJwtBearer(options =>
            {
                options.MapInboundClaims = false;

                // Like the database, missing configuration fails explicitly on use,
                // not at startup, so /health stays available.
                if (issuer is null)
                {
                    options.ConfigurationManager = new UnconfiguredIssuer();
                    return;
                }

                var origin = issuer.GetLeftPart(UriPartial.Authority);
                options.ConfigurationManager = new ConfigurationManager<OpenIdConnectConfiguration>(
                    origin + JwksPath,
                    new JwksRetriever(),
                    new HttpDocumentRetriever { RequireHttps = !issuer.IsLoopback });
                options.TokenValidationParameters = new TokenValidationParameters
                {
                    ValidIssuer = origin,
                    ValidAudience = origin,
                    ValidAlgorithms = [SecurityAlgorithms.EcdsaSha256],
                    RequireSignedTokens = true,
                    RequireExpirationTime = true,
                    ValidateLifetime = true,
                    ClockSkew = TimeSpan.FromSeconds(30),
                };
            });

        // Endpoints require an authenticated user unless marked AllowAnonymous.
        builder.Services.AddAuthorizationBuilder()
            .SetFallbackPolicy(new AuthorizationPolicyBuilder(JwtBearerDefaults.AuthenticationScheme)
                .RequireAuthenticatedUser()
                .RequireClaim(JwtRegisteredClaimNames.Sub)
                .Build());
    }

    // Accepts only an exact origin: HTTPS, or HTTP on loopback for local development.
    private static Uri? ReadIssuer(string? value)
    {
        if (!Uri.TryCreate(value?.Trim(), UriKind.Absolute, out var uri)) return null;
        var secure = uri.Scheme == Uri.UriSchemeHttps || (uri.Scheme == Uri.UriSchemeHttp && uri.IsLoopback);
        var originOnly = uri.AbsolutePath == "/" && uri.Query.Length == 0 && uri.Fragment.Length == 0 && uri.UserInfo.Length == 0;
        return secure && originOnly ? uri : null;
    }

    private sealed class UnconfiguredIssuer : IConfigurationManager<OpenIdConnectConfiguration>
    {
        public Task<OpenIdConnectConfiguration> GetConfigurationAsync(CancellationToken cancel) =>
            throw new InvalidOperationException(
                $"Configure {IssuerSetting} as the web app's exact origin (HTTPS, or HTTP on loopback) before authenticating API requests. See docs/DEPLOYMENT.md.");

        public void RequestRefresh() { }
    }
}
