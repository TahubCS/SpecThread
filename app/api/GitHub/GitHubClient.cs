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

// One commit as GitHub reports it. Message is the first line only.
internal sealed record GitHubCommit(string Sha, string Message, string? Author, DateTime Date, string Url);

// Lines added and removed and files changed, and for a pull request how many commits it has.
internal sealed record GitHubChanges(int Additions, int Deletions, int ChangedFiles, int? CommitCount);

// An issue, pull request, or commit as GitHub reports it now. Issues and pull requests have a
// number and a state ("open", "closed", or "merged"); commits have neither. Sha is the commit,
// or a pull request's latest commit. Commits lists a pull request's commits, oldest first.
internal sealed record GitHubItem(
    string Kind, int? Number, string? Sha, string Title, string? State, string? Author, string Url,
    DateTime CreatedAt, DateTime UpdatedAt, DateTime? ClosedAt, GitHubChanges? Changes, List<GitHubCommit>? Commits);

internal enum GitHubFailure
{
    None,
    // The GitHub App settings are missing or GitHub rejects them.
    NotConfigured,
    // GitHub does not accept the user's token.
    TokenRejected,
    // The installation, repository, issue, or pull request does not exist, or this caller cannot see it.
    NotFound,
    // The app is no longer installed where the repository was connected.
    NotInstalled,
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

    // Reads one issue or pull request of a connected repository, acting as the app.
    Task<GitHubResult<GitHubItem>> GetItemAsync(long installationId, long repositoryId, int number, CancellationToken cancel);

    // Reads one commit of a connected repository by its full or abbreviated SHA, acting as the app.
    Task<GitHubResult<GitHubItem>> GetCommitAsync(long installationId, long repositoryId, string sha, CancellationToken cancel);
}

internal sealed class GitHubClient(HttpClient http, IConfiguration configuration, ILogger<GitHubClient> logger) : IGitHubClient
{
    private const int PageSize = 100;
    private const int MaxListPages = 5;
    private const int MaxListedRepositories = 500;
    private const int MaxSearchPages = 30;
    private const int MaxCommitMessageLength = 300;

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

    public async Task<GitHubFailure> CheckInstallationAsync(long installationId, CancellationToken cancel) =>
        (await CreateInstallationTokenAsync(installationId, cancel)).Failure;

    public async Task<GitHubResult<GitHubItem>> GetItemAsync(long installationId, long repositoryId, int number, CancellationToken cancel)
    {
        var token = await CreateInstallationTokenAsync(installationId, cancel);
        if (token.Failure != GitHubFailure.None) return GitHubResult<GitHubItem>.Fail(token.Failure);

        // GitHub serves pull requests from the issues endpoint too, marked with "pull_request".
        var (failure, body) = await SendAsync(HttpMethod.Get, $"repositories/{repositoryId}/issues/{number}", token.Value!, cancel);
        if (failure != GitHubFailure.None) return GitHubResult<GitHubItem>.Fail(AsInstallation(failure));
        using (body)
        {
            var root = body!.RootElement;
            if (!TryReadItem(root, number, out var item)) return GitHubResult<GitHubItem>.Fail(GitHubFailure.Unavailable);
            if (!root.TryGetProperty("pull_request", out var marker) || marker.ValueKind != JsonValueKind.Object)
            {
                return GitHubResult<GitHubItem>.Ok(item!);
            }

            var (pullFailure, pull) = await SendAsync(HttpMethod.Get, $"repositories/{repositoryId}/pulls/{number}", token.Value!, cancel);
            if (pullFailure != GitHubFailure.None) return GitHubResult<GitHubItem>.Fail(AsInstallation(pullFailure));
            GitHubItem pullRequest;
            using (pull)
            {
                var details = pull!.RootElement;
                if (details.ValueKind != JsonValueKind.Object ||
                    !details.TryGetProperty("merged", out var merged) || merged.ValueKind is not (JsonValueKind.True or JsonValueKind.False) ||
                    !TryReadCount(details, "commits", out var commitCount) || !TryReadCount(details, "additions", out var additions) ||
                    !TryReadCount(details, "deletions", out var deletions) || !TryReadCount(details, "changed_files", out var changedFiles) ||
                    !details.TryGetProperty("head", out var head) || head.ValueKind != JsonValueKind.Object ||
                    !head.TryGetProperty("sha", out var headSha) || !IsFullSha(headSha.GetStringOrNull()))
                {
                    return GitHubResult<GitHubItem>.Fail(GitHubFailure.Unavailable);
                }
                pullRequest = item! with
                {
                    Kind = "pull_request",
                    State = merged.GetBoolean() ? "merged" : item.State,
                    Sha = headSha.GetString(),
                    Changes = new GitHubChanges(additions, deletions, changedFiles, commitCount),
                };
            }

            // The first page is enough to show what changed; CommitCount carries the true total.
            var (listFailure, list) = await SendAsync(
                HttpMethod.Get, $"repositories/{repositoryId}/pulls/{number}/commits?per_page={PageSize}", token.Value!, cancel);
            if (listFailure != GitHubFailure.None) return GitHubResult<GitHubItem>.Fail(AsInstallation(listFailure));
            using (list)
            {
                if (list!.RootElement.ValueKind != JsonValueKind.Array) return GitHubResult<GitHubItem>.Fail(GitHubFailure.Unavailable);
                var commits = new List<GitHubCommit>();
                foreach (var entry in list.RootElement.EnumerateArray())
                {
                    if (!TryReadCommit(entry, out var commit)) return GitHubResult<GitHubItem>.Fail(GitHubFailure.Unavailable);
                    commits.Add(commit!);
                }
                return GitHubResult<GitHubItem>.Ok(pullRequest with { Commits = commits });
            }
        }
    }

    public async Task<GitHubResult<GitHubItem>> GetCommitAsync(long installationId, long repositoryId, string sha, CancellationToken cancel)
    {
        var token = await CreateInstallationTokenAsync(installationId, cancel);
        if (token.Failure != GitHubFailure.None) return GitHubResult<GitHubItem>.Fail(token.Failure);

        var (failure, body) = await SendAsync(HttpMethod.Get, $"repositories/{repositoryId}/commits/{Uri.EscapeDataString(sha)}", token.Value!, cancel);
        if (failure != GitHubFailure.None) return GitHubResult<GitHubItem>.Fail(AsInstallation(failure));
        using (body)
        {
            var root = body!.RootElement;
            if (!TryReadCommit(root, out var commit) || !commit!.Sha.StartsWith(sha, StringComparison.OrdinalIgnoreCase) ||
                !root.TryGetProperty("stats", out var stats) || stats.ValueKind != JsonValueKind.Object ||
                !TryReadCount(stats, "additions", out var additions) || !TryReadCount(stats, "deletions", out var deletions) ||
                !root.TryGetProperty("files", out var files) || files.ValueKind != JsonValueKind.Array)
            {
                return GitHubResult<GitHubItem>.Fail(GitHubFailure.Unavailable);
            }
            return GitHubResult<GitHubItem>.Ok(new GitHubItem(
                "commit", null, commit.Sha, commit.Message, null, commit.Author, commit.Url, commit.Date, commit.Date, null,
                new GitHubChanges(additions, deletions, files.GetArrayLength(), null), null));
        }
    }

    // A short-lived token that lets the API read what the installation was granted.
    private async Task<GitHubResult<string>> CreateInstallationTokenAsync(long installationId, CancellationToken cancel)
    {
        var appToken = CreateAppToken();
        if (appToken is null) return GitHubResult<string>.Fail(GitHubFailure.NotConfigured);

        var (failure, body) = await SendAsync(HttpMethod.Post, $"app/installations/{installationId}/access_tokens", appToken, cancel);
        if (failure == GitHubFailure.TokenRejected)
        {
            logger.LogError("GitHub rejected the GitHub App credentials. Check GitHub:AppId and GitHub:PrivateKey.");
            return GitHubResult<string>.Fail(GitHubFailure.NotConfigured);
        }
        if (failure == GitHubFailure.NotFound) return GitHubResult<string>.Fail(GitHubFailure.NotInstalled);
        if (failure != GitHubFailure.None) return GitHubResult<string>.Fail(failure);
        using (body)
        {
            var root = body!.RootElement;
            return root.ValueKind == JsonValueKind.Object && root.TryGetProperty("token", out var token) &&
                token.ValueKind == JsonValueKind.String && token.GetString() is { Length: > 0 } value
                ? GitHubResult<string>.Ok(value)
                : GitHubResult<string>.Fail(GitHubFailure.Unavailable);
        }
    }

    // An installation token GitHub just issued and then rejects is GitHub's problem, not the user's.
    private static GitHubFailure AsInstallation(GitHubFailure failure) =>
        failure == GitHubFailure.TokenRejected ? GitHubFailure.Unavailable : failure;

    private static bool TryReadItem(JsonElement root, int number, out GitHubItem? item)
    {
        item = null;
        if (root.ValueKind != JsonValueKind.Object ||
            !root.TryGetProperty("number", out var found) || found.ValueKind != JsonValueKind.Number || !found.TryGetInt32(out var read) || read != number ||
            !root.TryGetProperty("title", out var title) || title.ValueKind != JsonValueKind.String ||
            !root.TryGetProperty("state", out var state) || state.GetStringOrNull() is not ("open" or "closed") ||
            !root.TryGetProperty("html_url", out var url) || !IsGitHubLink(url.GetStringOrNull()) ||
            !root.TryGetProperty("created_at", out var created) || created.ValueKind != JsonValueKind.String || !created.TryGetDateTime(out var createdAt) ||
            !root.TryGetProperty("updated_at", out var updated) || updated.ValueKind != JsonValueKind.String || !updated.TryGetDateTime(out var updatedAt))
        {
            return false;
        }
        DateTime? closedAt = null;
        if (root.TryGetProperty("closed_at", out var closed) && closed.ValueKind == JsonValueKind.String)
        {
            if (!closed.TryGetDateTime(out var value)) return false;
            closedAt = value.ToUniversalTime();
        }
        item = new GitHubItem("issue", number, null, title.GetString()!, state.GetString()!, ReadLogin(root, "user"), url.GetString()!,
            createdAt.ToUniversalTime(), updatedAt.ToUniversalTime(), closedAt, null, null);
        return true;
    }

    // Reads a commit from either the commit or the pull-request-commits response.
    private static bool TryReadCommit(JsonElement root, out GitHubCommit? commit)
    {
        commit = null;
        if (root.ValueKind != JsonValueKind.Object ||
            !root.TryGetProperty("sha", out var sha) || !IsFullSha(sha.GetStringOrNull()) ||
            !root.TryGetProperty("html_url", out var url) || !IsGitHubLink(url.GetStringOrNull()) ||
            !root.TryGetProperty("commit", out var detail) || detail.ValueKind != JsonValueKind.Object ||
            !detail.TryGetProperty("message", out var message) || message.ValueKind != JsonValueKind.String ||
            !detail.TryGetProperty("author", out var author) || author.ValueKind != JsonValueKind.Object ||
            !author.TryGetProperty("date", out var date) || date.ValueKind != JsonValueKind.String || !date.TryGetDateTime(out var committed))
        {
            return false;
        }
        var firstLine = message.GetString()!.Split('\n', 2)[0].Trim();
        if (firstLine.Length > MaxCommitMessageLength) firstLine = firstLine[..MaxCommitMessageLength];
        // The GitHub account when the commit email matches one, otherwise the name written in the commit.
        var name = ReadLogin(root, "author") ?? (author.TryGetProperty("name", out var written) ? written.GetStringOrNull() : null);
        commit = new GitHubCommit(sha.GetString()!.ToLowerInvariant(), firstLine.Length == 0 ? "(no message)" : firstLine, name, committed.ToUniversalTime(), url.GetString()!);
        return true;
    }

    // Deleted GitHub accounts leave items without a user.
    private static string? ReadLogin(JsonElement root, string property) =>
        root.TryGetProperty(property, out var user) && user.ValueKind == JsonValueKind.Object && user.TryGetProperty("login", out var login)
            ? login.GetStringOrNull()
            : null;

    private static bool TryReadCount(JsonElement root, string property, out int count)
    {
        count = 0;
        return root.TryGetProperty(property, out var value) && value.ValueKind == JsonValueKind.Number && value.TryGetInt32(out count) && count >= 0;
    }

    private static bool IsGitHubLink(string? value) => value?.StartsWith("https://github.com/", StringComparison.Ordinal) == true;

    private static bool IsFullSha(string? value) => value is { Length: 40 } && value.All(Uri.IsHexDigit);

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
            if (response.StatusCode is HttpStatusCode.NotFound or HttpStatusCode.Forbidden or HttpStatusCode.UnprocessableEntity)
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

internal static class JsonElementExtensions
{
    public static string? GetStringOrNull(this JsonElement element) =>
        element.ValueKind == JsonValueKind.String ? element.GetString() : null;
}
