using System.Security.Claims;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using SpecThread.Api.Data;
using SpecThread.Api.Projects;

namespace SpecThread.Api.GitHub;

// Connects one GitHub repository to a project (ADR-032). Any member reads the connection;
// only the owner changes it, and only with a repository GitHub confirms they can reach.
internal static class RepositoryEndpoints
{
    private const int MaxTokenLength = 1_000;

    public static void MapRepositoryEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPost("/github/repositories", ListAvailable).WithName("ListGitHubRepositories").WithTags("GitHub")
            .WithMetadata(ProjectEndpoints.Unauthorized)
            .ProducesProblem(StatusCodes.Status502BadGateway).ProducesProblem(StatusCodes.Status503ServiceUnavailable);

        var repository = app.MapGroup("/projects/{projectId:guid}/repository").WithTags("GitHub")
            .WithMetadata(ProjectEndpoints.Unauthorized);
        repository.MapGet("/", Get).WithName("GetProjectRepository");
        repository.MapPut("/", Connect).WithName("ConnectProjectRepository")
            .ProducesProblem(StatusCodes.Status403Forbidden).ProducesProblem(StatusCodes.Status409Conflict)
            .ProducesProblem(StatusCodes.Status502BadGateway).ProducesProblem(StatusCodes.Status503ServiceUnavailable);
        repository.MapDelete("/", Disconnect).WithName("DisconnectProjectRepository")
            .ProducesProblem(StatusCodes.Status403Forbidden).ProducesProblem(StatusCodes.Status409Conflict);
    }

    private static async Task<Results<Ok<AvailableRepositoriesResponse>, ValidationProblem, ProblemHttpResult>> ListAvailable(
        GitHubTokenRequest request, IGitHubClient github, CancellationToken cancel)
    {
        var errors = new InputErrors();
        var token = errors.Required("githubToken", request.GithubToken, MaxTokenLength);
        if (errors.Any) return TypedResults.ValidationProblem(errors.ToDictionary());

        var result = await github.ListRepositoriesAsync(token!, cancel);
        if (result.Failure == GitHubFailure.TokenRejected) return TokenRejected();
        if (result.Failure != GitHubFailure.None) return Failed(result.Failure);

        return TypedResults.Ok(new AvailableRepositoriesResponse(
            github.InstallUrl,
            result.Value!.Repositories.ConvertAll(r => new AvailableRepository(r.InstallationId, r.RepositoryId, r.Owner, r.Name, $"{r.Owner}/{r.Name}", r.IsPrivate)),
            result.Value.Truncated));
    }

    private static async Task<Results<Ok<ProjectRepositoryEnvelope>, NotFound>> Get(
        Guid projectId, ClaimsPrincipal user, SpecThreadDbContext db, CancellationToken cancel)
    {
        if (!await db.ProjectsFor(user.CallerId()).AnyAsync(p => p.Id == projectId, cancel)) return TypedResults.NotFound();
        var repository = await db.ProjectRepositories.AsNoTracking().SingleOrDefaultAsync(r => r.ProjectId == projectId, cancel);
        return TypedResults.Ok(new ProjectRepositoryEnvelope(repository is null ? null : ToResponse(repository)));
    }

    private static async Task<Results<Ok<ProjectRepositoryEnvelope>, ValidationProblem, NotFound, ProblemHttpResult>> Connect(
        Guid projectId, ConnectRepositoryRequest request, ClaimsPrincipal user, SpecThreadDbContext db, IGitHubClient github, CancellationToken cancel)
    {
        var errors = new InputErrors();
        var token = errors.Required("githubToken", request.GithubToken, MaxTokenLength);
        if (request.InstallationId is not > 0) errors.Add("installationId", "Choose an installation.");
        if (request.RepositoryId is not > 0) errors.Add("repositoryId", "Choose a repository.");
        if (errors.Any) return TypedResults.ValidationProblem(errors.ToDictionary());

        var userId = user.CallerId();
        var project = await db.ProjectsFor(userId).AsNoTracking().SingleOrDefaultAsync(p => p.Id == projectId, cancel);
        if (project is null) return TypedResults.NotFound();
        if (project.OwnerUserId != userId) return ProjectEndpoints.OwnerOnly();
        if (project.ArchivedAt is not null) return ProjectEndpoints.Archived();

        // GitHub decides whether this user can reach the repository through this installation.
        var found = await github.FindRepositoryAsync(token!, request.InstallationId!.Value, request.RepositoryId!.Value, cancel);
        if (found.Failure == GitHubFailure.TokenRejected) return TokenRejected();
        if (found.Failure == GitHubFailure.NotFound)
        {
            errors.Add("repositoryId", "GitHub does not show this repository to you through that installation.");
            return TypedResults.ValidationProblem(errors.ToDictionary());
        }
        if (found.Failure != GitHubFailure.None) return Failed(found.Failure);

        var installation = await github.CheckInstallationAsync(request.InstallationId.Value, cancel);
        if (installation == GitHubFailure.NotInstalled)
        {
            errors.Add("installationId", "The SpecThread app is no longer installed there.");
            return TypedResults.ValidationProblem(errors.ToDictionary());
        }
        if (installation != GitHubFailure.None) return Failed(installation);

        var repository = await db.ProjectRepositories.SingleOrDefaultAsync(r => r.ProjectId == projectId, cancel);
        if (repository is null)
        {
            repository = new ProjectRepository { ProjectId = projectId, Owner = "", Name = "", ConnectedBy = userId };
            db.ProjectRepositories.Add(repository);
        }
        repository.InstallationId = found.Value!.InstallationId;
        repository.RepositoryId = found.Value.RepositoryId;
        repository.Owner = found.Value.Owner;
        repository.Name = found.Value.Name;
        repository.IsPrivate = found.Value.IsPrivate;
        repository.ConnectedBy = userId;
        repository.ConnectedAt = Clock.UtcNow();
        try
        {
            await db.SaveChangesAsync(cancel);
        }
        catch (DbUpdateException)
        {
            // Two connects at once: the other one created the row first.
            return TypedResults.Problem("The repository connection changed while saving. Reload and try again.", statusCode: StatusCodes.Status409Conflict);
        }

        return TypedResults.Ok(new ProjectRepositoryEnvelope(ToResponse(repository)));
    }

    private static async Task<Results<NoContent, NotFound, ProblemHttpResult>> Disconnect(
        Guid projectId, ClaimsPrincipal user, SpecThreadDbContext db, CancellationToken cancel)
    {
        var userId = user.CallerId();
        var project = await db.ProjectsFor(userId).AsNoTracking().SingleOrDefaultAsync(p => p.Id == projectId, cancel);
        if (project is null) return TypedResults.NotFound();
        if (project.OwnerUserId != userId) return ProjectEndpoints.OwnerOnly();
        if (project.ArchivedAt is not null) return ProjectEndpoints.Archived();

        // Idempotent: disconnecting a project with no repository succeeds.
        await db.ProjectRepositories.Where(r => r.ProjectId == projectId).ExecuteDeleteAsync(cancel);
        return TypedResults.NoContent();
    }

    private static ValidationProblem TokenRejected() => TypedResults.ValidationProblem(new Dictionary<string, string[]>
    {
        ["githubToken"] = ["GitHub did not accept your GitHub sign-in. Link GitHub again and retry."],
    });

    internal static ProblemHttpResult Failed(GitHubFailure failure) => failure == GitHubFailure.NotConfigured
        ? TypedResults.Problem("GitHub is not configured for this deployment.", statusCode: StatusCodes.Status503ServiceUnavailable)
        : TypedResults.Problem("GitHub could not be reached. Try again in a moment.", statusCode: StatusCodes.Status502BadGateway);

    private static ProjectRepositoryResponse ToResponse(ProjectRepository r) => new(
        r.InstallationId, r.RepositoryId, r.Owner, r.Name, $"{r.Owner}/{r.Name}",
        $"https://github.com/{Uri.EscapeDataString(r.Owner)}/{Uri.EscapeDataString(r.Name)}", r.IsPrivate, r.ConnectedBy, r.ConnectedAt);
}

internal sealed record GitHubTokenRequest(string? GithubToken);

internal sealed record ConnectRepositoryRequest(long? InstallationId, long? RepositoryId, string? GithubToken);

internal sealed record AvailableRepository(long InstallationId, long RepositoryId, string Owner, string Name, string FullName, bool IsPrivate);

internal sealed record AvailableRepositoriesResponse(string? InstallUrl, List<AvailableRepository> Repositories, bool Truncated);

internal sealed record ProjectRepositoryResponse(
    long InstallationId, long RepositoryId, string Owner, string Name, string FullName, string Url, bool IsPrivate, string ConnectedBy, DateTime ConnectedAt);

internal sealed record ProjectRepositoryEnvelope(ProjectRepositoryResponse? Repository);
