using System.Net;
using System.Net.Http.Headers;
using System.Security.Cryptography;
using System.Text.Json;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;

namespace SpecThread.Api.GitHub;

// A repository the signed-in GitHub user can reach through one installation of the GitHub App.
internal sealed record GitHubRepository(long InstallationId, long RepositoryId, string Owner, string Name, bool IsPrivate);

internal sealed record GitHubRepositoryList(List<GitHubRepository> Repositories, bool Truncated);

internal enum GitHubFailure
{
    None,
    // The GitHub App settings are missing or GitHub rejects them.
    NotConfigured,
    // GitHub does not accept the user's token.
    TokenRejected,
    // The installation or repository does not exist, or this caller cannot see it.
    NotFound,
    // GitHub could not be reached, is rate limiting, or answered with something unexpected.
    Unavailable,
}

internal sealed record GitHubResult<T>(GitHubFailure Failure, T? Value)
{
    public static GitHubResult<T> Ok(T value) => new(GitHubFailure.None, value);

    public static GitHubResult<T> Fail(GitHubFailure failure) => new(failure, default);
}

// The only place the API talks to GitHub (ADR-032). User tokens are passed through for
// one call and are never stored or logged.
internal interface IGitHubClient
{
    // Where a user installs the GitHub App, or null when the app's public name is not configured.
    string? InstallUrl { get; }

    // Repositories the user can reach through any installation of the app.
    Task<GitHubResult<GitHubRepositoryList>> ListRepositoriesAsync(string userToken, CancellationToken cancel);

    // One repository, only if the user can reach it through that installation.
    Task<GitHubResult<GitHubRepository>> FindRepositoryAsync(string userToken, long installationId, long repositoryId, CancellationToken cancel);

    // Confirms the API can act as the app on that installation.
    Task<GitHubFailure> CheckInstallationAsync(long installationId, CancellationToken cancel);
}

internal sealed class GitHubClient(HttpClient http, IConfiguration configuration, ILogger<GitHubClient> logger) : IGitHubClient
{
    private const int PageSize = 100;
    private const int MaxListPages = 5;
    private const int MaxListedRepositories = 500;
    private const int MaxSearchPages = 30;

    public static void Configure(HttpClient client)
    {
        client.Timeout = TimeSpan.FromSeconds(10);
        client.DefaultRequestHeaders.Accept.Add(new MediaTypeWithQualityHeaderValue("application/vnd.github+json"));
        client.DefaultRequestHeaders.Add("X-GitHub-Api-Version", "2022-11-28");
        client.DefaultRequestHeaders.UserAgent.Add(new ProductInfoHeaderValue("SpecThread", "1.0"));
    }

    public string? InstallUrl
    {
        get
        {
            var slug = configuration["GitHub:AppSlug"]?.Trim();
            return string.IsNullOrEmpty(slug) ? null : $"https://github.com/apps/{Uri.EscapeDataString(slug)}/installations/new";
        }
    }

    public async Task<GitHubResult<GitHubRepositoryList>> ListRepositoriesAsync(string userToken, CancellationToken cancel)
    {
        var installations = new List<long>();
        for (var page = 1; page <= MaxListPages; page++)
        {
            var (failure, body) = await SendAsync(HttpMethod.Get, $"user/installations?per_page={PageSize}&page={page}", userToken, cancel);
            if (failure != GitHubFailure.None) return GitHubResult<GitHubRepositoryList>.Fail(failure);
            using (body)
            {
                if (!TryReadArray(body!, "installations", out var items)) return GitHubResult<GitHubRepositoryList>.Fail(GitHubFailure.Unavailable);
                foreach (var item in items)
                {
                    if (!TryReadId(item, out var id)) return GitHubResult<GitHubRepositoryList>.Fail(GitHubFailure.Unavailable);
                    installations.Add(id);
                }
                if (items.Count < PageSize) break;
            }
        }

        var repositories = new List<GitHubRepository>();
        var truncated = false;
        foreach (var installationId in installations)
        {
            for (var page = 1; ; page++)
            {
                if (page > MaxListPages || repositories.Count >= MaxListedRepositories)
                {
                    truncated = true;
                    break;
                }
                var result = await ReadRepositoryPageAsync(userToken, installationId, page, cancel);
                // An installation removed between the two calls is skipped, not an error.
                if (result.Failure == GitHubFailure.NotFound) break;
                if (result.Failure != GitHubFailure.None) return GitHubResult<GitHubRepositoryList>.Fail(result.Failure);
                repositories.AddRange(result.Value!);
                if (result.Value!.Count < PageSize) break;
            }
        }

        repositories.Sort((a, b) => string.Compare($"{a.Owner}/{a.Name}", $"{b.Owner}/{b.Name}", StringComparison.OrdinalIgnoreCase));
        return GitHubResult<GitHubRepositoryList>.Ok(new GitHubRepositoryList(repositories, truncated));
    }

    public async Task<GitHubResult<GitHubRepository>> FindRepositoryAsync(string userToken, long installationId, long repositoryId, CancellationToken cancel)
    {
        for (var page = 1; page <= MaxSearchPages; page++)
        {
            var result = await ReadRepositoryPageAsync(userToken, installationId, page, cancel);
            if (result.Failure != GitHubFailure.None) return GitHubResult<GitHubRepository>.Fail(result.Failure);
            var match = result.Value!.Find(repository => repository.RepositoryId == repositoryId);
            if (match is not null) return GitHubResult<GitHubRepository>.Ok(match);
            if (result.Value.Count < PageSize) break;
        }
        return GitHubResult<GitHubRepository>.Fail(GitHubFailure.NotFound);
    }

    public async Task<GitHubFailure> CheckInstallationAsync(long installationId, CancellationToken cancel)
    {
        var appToken = CreateAppToken();
        if (appToken is null) return GitHubFailure.NotConfigured;

        var (failure, body) = await SendAsync(HttpMethod.Post, $"app/installations/{installationId}/access_tokens", appToken, cancel);
        body?.Dispose();
        if (failure == GitHubFailure.TokenRejected)
        {
            logger.LogError("GitHub rejected the GitHub App credentials. Check GitHub:AppId and GitHub:PrivateKey.");
            return GitHubFailure.NotConfigured;
        }
        return failure;
    }

    private async Task<GitHubResult<List<GitHubRepository>>> ReadRepositoryPageAsync(string userToken, long installationId, int page, CancellationToken cancel)
    {
        var (failure, body) = await SendAsync(
            HttpMethod.Get, $"user/installations/{installationId}/repositories?per_page={PageSize}&page={page}", userToken, cancel);
        if (failure != GitHubFailure.None) return GitHubResult<List<GitHubRepository>>.Fail(failure);
        using (body)
        {
            if (!TryReadArray(body!, "repositories", out var items)) return GitHubResult<List<GitHubRepository>>.Fail(GitHubFailure.Unavailable);
            var repositories = new List<GitHubRepository>(items.Count);
            foreach (var item in items)
            {
                if (!TryReadId(item, out var id) ||
                    !item.TryGetProperty("name", out var name) || name.ValueKind != JsonValueKind.String ||
                    !item.TryGetProperty("private", out var isPrivate) || isPrivate.ValueKind is not (JsonValueKind.True or JsonValueKind.False) ||
                    !item.TryGetProperty("owner", out var owner) || owner.ValueKind != JsonValueKind.Object ||
                    !owner.TryGetProperty("login", out var login) || login.ValueKind != JsonValueKind.String)
                {
                    return GitHubResult<List<GitHubRepository>>.Fail(GitHubFailure.Unavailable);
                }
                repositories.Add(new GitHubRepository(installationId, id, login.GetString()!, name.GetString()!, isPrivate.GetBoolean()));
            }
            return GitHubResult<List<GitHubRepository>>.Ok(repositories);
        }
    }

    // Sends one request. The body is returned only on success and must be disposed by the caller.
    private async Task<(GitHubFailure Failure, JsonDocument? Body)> SendAsync(HttpMethod method, string path, string bearer, CancellationToken cancel)
    {
        var baseAddress = ReadBaseAddress();
        if (baseAddress is null) return (GitHubFailure.NotConfigured, null);
        try
        {
            using var request = new HttpRequestMessage(method, new Uri(baseAddress, path));
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", bearer);
            using var response = await http.SendAsync(request, cancel);
            if (response.StatusCode == HttpStatusCode.Unauthorized) return (GitHubFailure.TokenRejected, null);
            if (response.StatusCode is HttpStatusCode.NotFound or HttpStatusCode.Forbidden)
            {
                // A 403 with no remaining quota is rate limiting, not a missing resource.
                var exhausted = response.Headers.TryGetValues("x-ratelimit-remaining", out var remaining) && remaining.FirstOrDefault() == "0";
                return (exhausted ? GitHubFailure.Unavailable : GitHubFailure.NotFound, null);
            }
            if (!response.IsSuccessStatusCode)
            {
                logger.LogWarning("GitHub answered {Status} for {Method} {Path}.", (int)response.StatusCode, method, path.Split('?')[0]);
                return (GitHubFailure.Unavailable, null);
            }
            await using var stream = await response.Content.ReadAsStreamAsync(cancel);
            return (GitHubFailure.None, await JsonDocument.ParseAsync(stream, cancellationToken: cancel));
        }
        catch (Exception error) when (error is HttpRequestException or JsonException || (error is TaskCanceledException && !cancel.IsCancellationRequested))
        {
            logger.LogWarning("GitHub request failed for {Method} {Path}: {Reason}", method, path.Split('?')[0], error.GetType().Name);
            return (GitHubFailure.Unavailable, null);
        }
    }

    // Accepts HTTPS, or HTTP on loopback so tests can stand in for GitHub.
    private Uri? ReadBaseAddress()
    {
        var value = configuration["GitHub:ApiBaseUrl"];
        if (string.IsNullOrWhiteSpace(value)) return new Uri("https://api.github.com/");
        if (!Uri.TryCreate(value.Trim().TrimEnd('/') + "/", UriKind.Absolute, out var uri) ||
            !(uri.Scheme == Uri.UriSchemeHttps || (uri.Scheme == Uri.UriSchemeHttp && uri.IsLoopback)))
        {
            logger.LogError("GitHub:ApiBaseUrl must be an HTTPS URL, or HTTP on loopback.");
            return null;
        }
        return uri;
    }

    // A short-lived token that identifies the API as the GitHub App, or null when the app is not configured.
    private string? CreateAppToken()
    {
        var appId = configuration["GitHub:AppId"]?.Trim();
        var privateKey = configuration["GitHub:PrivateKey"];
        if (string.IsNullOrEmpty(appId) || string.IsNullOrWhiteSpace(privateKey)) return null;
        try
        {
            using var rsa = RSA.Create();
            // Hosting platforms often store the key on one line with literal \n.
            rsa.ImportFromPem(privateKey.Replace("\\n", "\n"));
            // No caching: the cached signer would outlive this RSA instance.
            var key = new RsaSecurityKey(rsa) { CryptoProviderFactory = new CryptoProviderFactory { CacheSignatureProviders = false } };
            var now = DateTime.UtcNow;
            return new JsonWebTokenHandler().CreateToken(new SecurityTokenDescriptor
            {
                Issuer = appId,
                IssuedAt = now.AddSeconds(-60),
                NotBefore = now.AddSeconds(-60),
                Expires = now.AddMinutes(9),
                SigningCredentials = new SigningCredentials(key, SecurityAlgorithms.RsaSha256),
            });
        }
        catch (Exception error) when (error is ArgumentException or CryptographicException)
        {
            logger.LogError("GitHub:PrivateKey could not be read as a PEM RSA key ({Reason}).", error.GetType().Name);
            return null;
        }
    }

    private static bool TryReadArray(JsonDocument body, string property, out List<JsonElement> items)
    {
        items = [];
        if (body.RootElement.ValueKind != JsonValueKind.Object ||
            !body.RootElement.TryGetProperty(property, out var array) || array.ValueKind != JsonValueKind.Array)
        {
            return false;
        }
        items = [.. array.EnumerateArray()];
        return items.TrueForAll(item => item.ValueKind == JsonValueKind.Object);
    }

    private static bool TryReadId(JsonElement item, out long id)
    {
        id = 0;
        return item.TryGetProperty("id", out var value) && value.ValueKind == JsonValueKind.Number && value.TryGetInt64(out id) && id > 0;
    }
}
