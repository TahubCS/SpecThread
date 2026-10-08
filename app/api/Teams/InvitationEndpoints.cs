using System.Net.Mail;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using SpecThread.Api.Data;
using SpecThread.Api.Projects;

namespace SpecThread.Api.Teams;

internal static class InvitationEndpoints
{
    public static void MapInvitationEndpoints(this IEndpointRouteBuilder app)
    {
        var teams = app.MapGroup("/teams/{teamId:guid}/invitations").WithTags("Invitations").WithMetadata(ProjectEndpoints.Unauthorized);
        teams.MapGet("/", List).WithName("ListTeamInvitations").ProducesProblem(StatusCodes.Status403Forbidden);
        teams.MapPost("/", Create).WithName("CreateTeamInvitation").ProducesProblem(StatusCodes.Status403Forbidden).ProducesProblem(StatusCodes.Status409Conflict);
        teams.MapPost("/{invitationId:guid}/resend", Resend).WithName("ResendTeamInvitation").ProducesProblem(StatusCodes.Status403Forbidden).ProducesProblem(StatusCodes.Status409Conflict);
        teams.MapDelete("/{invitationId:guid}", Revoke).WithName("RevokeTeamInvitation").ProducesProblem(StatusCodes.Status403Forbidden).ProducesProblem(StatusCodes.Status409Conflict);
        app.MapGet("/invites/{token}", Preview).WithTags("Invitations").WithName("PreviewInvitation").AllowAnonymous();
        app.MapPost("/invites/{token}/accept", Accept).WithTags("Invitations").WithName("AcceptInvitation")
            .WithMetadata(ProjectEndpoints.Unauthorized).ProducesProblem(StatusCodes.Status403Forbidden)
            .ProducesProblem(StatusCodes.Status409Conflict).ProducesProblem(StatusCodes.Status410Gone);
    }

    private static async Task<Results<Ok<List<InvitationResponse>>, NotFound, ProblemHttpResult>> List(
        Guid teamId, ClaimsPrincipal user, SpecThreadDbContext db, CancellationToken cancel)
    {
        var caller = user.CallerId();
        var team = await TeamEndpoints.ForCaller(db, caller).SingleOrDefaultAsync(t => t.Id == teamId, cancel);
        if (team is null) return TypedResults.NotFound();
        if (!await db.CanManageTeam(teamId, caller, cancel)) return ProjectEndpoints.ManagersOnly();
        var now = Clock.UtcNow();
        var rows = await db.TeamInvitations.AsNoTracking().Where(i => i.TeamId == teamId)
            .OrderByDescending(i => i.CreatedAt).ThenBy(i => i.Id)
            .Select(i => new
            {
                Invitation = i,
                Inviter = db.Set<AuthUser>().Where(u => u.Id == i.InvitedBy).Select(u => u.Name).First(),
                Permitted = db.TeamMembers.Any(m => m.TeamId == teamId && m.UserId == i.InvitedBy &&
                    (i.InvitedBy == team.OwnerUserId || i.Role == "member" && m.Role == "admin")),
            }).ToListAsync(cancel);
        return TypedResults.Ok(rows.Select(row => Describe(row.Invitation, row.Inviter, row.Permitted, now)).ToList());
    }

    private static async Task<Results<Created<IssuedInvitationResponse>, ValidationProblem, NotFound, ProblemHttpResult>> Create(
        Guid teamId, CreateInvitationRequest request, ClaimsPrincipal user, SpecThreadDbContext db, CancellationToken cancel)
    {
        var caller = user.CallerId();
        await using var transaction = await db.Database.BeginTransactionAsync(cancel);
        var team = await TeamManagementEndpoints.LockTeam(db, teamId, cancel);
        if (team is null || !await db.TeamMembers.AnyAsync(m => m.TeamId == teamId && m.UserId == caller, cancel)) return TypedResults.NotFound();
        if (!await db.CanManageTeam(teamId, caller, cancel)) return ProjectEndpoints.ManagersOnly();
        var errors = new InputErrors();
        var email = errors.Required("email", request.Email, InputErrors.MaxEmailLength)?.ToLowerInvariant();
        if (email is not null && (!MailAddress.TryCreate(email, out var address) || address.Address != email)) errors.Add("email", "Enter a valid email address.");
        if (request.Role is not ("member" or "admin")) errors.Add("role", "Choose Admin or Member.");
        if (errors.Any) return TypedResults.ValidationProblem(errors.ToDictionary());
        if (!await CanIssue(db, team, caller, request.Role!, cancel)) return AdminInvitesOwnerOnly();
        if (await db.TeamMembers.Where(m => m.TeamId == teamId).Join(db.Set<AuthUser>(), m => m.UserId, u => u.Id, (m, u) => u.Email)
            .AnyAsync(existing => existing.ToLower() == email, cancel)) return Conflict("This person is already a team member.");
        if (await db.TeamInvitations.AnyAsync(i => i.TeamId == teamId && i.Email == email && i.AcceptedAt == null && i.RevokedAt == null, cancel))
            return Conflict("An invitation already exists for this email. Resend it to issue a fresh link.");
        var now = Clock.UtcNow();
        var invitation = new TeamInvitation { Id = Guid.NewGuid(), TeamId = teamId, Email = email!, Role = request.Role!, InvitedBy = caller, TokenHash = "", CreatedAt = now };
        var token = Issue(invitation, now);
        db.TeamInvitations.Add(invitation);
        await db.SaveChangesAsync(cancel);
        var inviter = await db.Set<AuthUser>().Where(u => u.Id == caller).Select(u => u.Name).SingleAsync(cancel);
        await transaction.CommitAsync(cancel);
        return TypedResults.Created($"/teams/{teamId}/invitations/{invitation.Id}", new IssuedInvitationResponse(Describe(invitation, inviter, true, now), token, team.Name));
    }

    private static async Task<Results<Ok<IssuedInvitationResponse>, NotFound, ProblemHttpResult>> Resend(
        Guid teamId, Guid invitationId, ClaimsPrincipal user, SpecThreadDbContext db, CancellationToken cancel)
    {
        var caller = user.CallerId();
        await using var transaction = await db.Database.BeginTransactionAsync(cancel);
        var team = await TeamManagementEndpoints.LockTeam(db, teamId, cancel);
        if (team is null || !await db.TeamMembers.AnyAsync(m => m.TeamId == teamId && m.UserId == caller, cancel)) return TypedResults.NotFound();
        if (!await db.CanManageTeam(teamId, caller, cancel)) return ProjectEndpoints.ManagersOnly();
        var invitation = await db.TeamInvitations.SingleOrDefaultAsync(i => i.Id == invitationId && i.TeamId == teamId, cancel);
        if (invitation is null) return TypedResults.NotFound();
        if (!await CanIssue(db, team, caller, invitation.Role, cancel)) return AdminInvitesOwnerOnly();
        if (invitation.AcceptedAt is not null || invitation.RevokedAt is not null) return Conflict("Accepted or revoked invitations cannot be resent. Create a new invitation if needed.");
        invitation.InvitedBy = caller;
        var now = Clock.UtcNow();
        var token = Issue(invitation, now);
        await db.SaveChangesAsync(cancel);
        var inviter = await db.Set<AuthUser>().Where(u => u.Id == caller).Select(u => u.Name).SingleAsync(cancel);
        await transaction.CommitAsync(cancel);
        return TypedResults.Ok(new IssuedInvitationResponse(Describe(invitation, inviter, true, now), token, team.Name));
    }

    private static async Task<Results<NoContent, NotFound, ProblemHttpResult>> Revoke(
        Guid teamId, Guid invitationId, ClaimsPrincipal user, SpecThreadDbContext db, CancellationToken cancel)
    {
        var caller = user.CallerId();
        await using var transaction = await db.Database.BeginTransactionAsync(cancel);
        var team = await TeamManagementEndpoints.LockTeam(db, teamId, cancel);
        if (team is null || !await db.TeamMembers.AnyAsync(m => m.TeamId == teamId && m.UserId == caller, cancel)) return TypedResults.NotFound();
        if (!await db.CanManageTeam(teamId, caller, cancel)) return ProjectEndpoints.ManagersOnly();
        var invitation = await db.TeamInvitations.SingleOrDefaultAsync(i => i.Id == invitationId && i.TeamId == teamId, cancel);
        if (invitation is null) return TypedResults.NotFound();
        if (!await CanIssue(db, team, caller, invitation.Role, cancel)) return AdminInvitesOwnerOnly();
        if (invitation.AcceptedAt is not null) return Conflict("This invitation has already been accepted.");
        invitation.RevokedAt ??= Clock.UtcNow();
        await db.SaveChangesAsync(cancel);
        await transaction.CommitAsync(cancel);
        return TypedResults.NoContent();
    }

    private static async Task<Results<Ok<InvitationPreview>, NotFound>> Preview(string token, HttpContext http, SpecThreadDbContext db, CancellationToken cancel)
    {
        http.Response.Headers.CacheControl = "no-store";
        if (!ValidToken(token)) return TypedResults.NotFound();
        var digest = Hash(token);
        var invitation = await db.TeamInvitations.AsNoTracking().SingleOrDefaultAsync(i => i.TokenHash == digest, cancel);
        if (invitation is null) return TypedResults.NotFound();
        var team = await db.Teams.AsNoTracking().SingleAsync(t => t.Id == invitation.TeamId, cancel);
        var inviter = await db.Set<AuthUser>().Where(u => u.Id == invitation.InvitedBy).Select(u => u.Name).SingleAsync(cancel);
        var permitted = await CanIssue(db, team, invitation.InvitedBy, invitation.Role, cancel);
        return TypedResults.Ok(new InvitationPreview(team.Id, team.Name, inviter, invitation.Email, invitation.Role, invitation.ExpiresAt,
            Status(invitation, permitted, Clock.UtcNow())));
    }

    private static async Task<Results<Ok<TeamResponse>, NotFound, ProblemHttpResult>> Accept(
        string token, ClaimsPrincipal user, SpecThreadDbContext db, CancellationToken cancel)
    {
        if (!ValidToken(token)) return TypedResults.NotFound();
        var caller = user.CallerId();
        var account = await db.Set<AuthUser>().AsNoTracking().SingleOrDefaultAsync(u => u.Id == caller, cancel);
        if (account is null || !account.EmailVerified) return TypedResults.Problem("A verified account is required to accept an invitation.", statusCode: StatusCodes.Status403Forbidden);
        var digest = Hash(token);
        var teamId = await db.TeamInvitations.Where(i => i.TokenHash == digest).Select(i => (Guid?)i.TeamId).SingleOrDefaultAsync(cancel);
        if (teamId is null) return TypedResults.NotFound();
        await using var transaction = await db.Database.BeginTransactionAsync(cancel);
        var team = await TeamManagementEndpoints.LockTeam(db, teamId.Value, cancel);
        if (team is null) return TypedResults.NotFound();
        // Resend/revoke/permission changes use the same team lock. Re-read after acquiring it.
        var invitation = await db.TeamInvitations.SingleOrDefaultAsync(i => i.TeamId == team.Id && i.TokenHash == digest, cancel);
        if (invitation is null) return TypedResults.NotFound();
        if (!string.Equals(account.Email.Trim(), invitation.Email, StringComparison.OrdinalIgnoreCase))
            return TypedResults.Problem("Sign in with the verified account matching the invited email.", statusCode: StatusCodes.Status403Forbidden);
        var membership = await db.TeamMembers.SingleOrDefaultAsync(m => m.TeamId == team.Id && m.UserId == caller, cancel);
        if (invitation.AcceptedAt is not null)
        {
            if (invitation.AcceptedBy == caller && membership is not null)
                return TypedResults.Ok(await TeamEndpoints.Response(db, team.Id, caller, cancel));
            return Conflict("This invitation has already been used. Ask for a new invitation.");
        }
        var now = Clock.UtcNow();
        if (Status(invitation, await CanIssue(db, team, invitation.InvitedBy, invitation.Role, cancel), now) != "pending")
            return TypedResults.Problem("This invitation is no longer available. Ask a team Owner or Admin for a fresh link.", statusCode: StatusCodes.Status410Gone);
        if (membership is null) db.TeamMembers.Add(new TeamMember { TeamId = team.Id, UserId = caller, Role = invitation.Role, JoinedAt = now });
        invitation.AcceptedAt = now;
        invitation.AcceptedBy = caller;
        // Handles simultaneous acceptance in different teams, and first-team creation, without
        // completing onboarding outside the membership/acceptance transaction.
        await db.Database.ExecuteSqlInterpolatedAsync($"INSERT INTO public.user_onboarding(user_id,completed_at) VALUES ({caller},{now}) ON CONFLICT (user_id) DO NOTHING", cancel);
        await db.SaveChangesAsync(cancel);
        var response = await TeamEndpoints.Response(db, team.Id, caller, cancel);
        await transaction.CommitAsync(cancel);
        return TypedResults.Ok(response);
    }

    private static Task<bool> CanIssue(SpecThreadDbContext db, Team team, string userId, string role, CancellationToken cancel) =>
        db.TeamMembers.AnyAsync(m => m.TeamId == team.Id && m.UserId == userId &&
            (team.OwnerUserId == userId || role == "member" && m.Role == "admin"), cancel);
    private static string Issue(TeamInvitation invitation, DateTime now)
    {
        var token = Convert.ToHexString(RandomNumberGenerator.GetBytes(32)).ToLowerInvariant();
        invitation.TokenHash = Hash(token);
        invitation.IssuedAt = now;
        invitation.ExpiresAt = now.AddDays(7);
        return token;
    }
    private static bool ValidToken(string token) => token.Length == 64 && token.All(char.IsAsciiHexDigit);
    private static string Hash(string token) => Convert.ToHexString(SHA256.HashData(Encoding.ASCII.GetBytes(token.ToLowerInvariant()))).ToLowerInvariant();
    private static string Status(TeamInvitation invitation, bool permitted, DateTime now) => invitation.AcceptedAt is not null ? "accepted" :
        invitation.RevokedAt is not null ? "revoked" : invitation.ExpiresAt <= now ? "expired" : !permitted ? "unavailable" : "pending";
    private static InvitationResponse Describe(TeamInvitation i, string inviter, bool permitted, DateTime now) =>
        new(i.Id, i.TeamId, i.Email, i.Role, inviter, i.CreatedAt, i.IssuedAt, i.ExpiresAt, Status(i, permitted, now));
    private static ProblemHttpResult Conflict(string detail) => TypedResults.Problem(detail, statusCode: StatusCodes.Status409Conflict);
    private static ProblemHttpResult AdminInvitesOwnerOnly() => TypedResults.Problem("Only the Owner can manage Admin invitations.", statusCode: StatusCodes.Status403Forbidden);
}

internal sealed record CreateInvitationRequest(string? Email, string? Role);
internal sealed record InvitationResponse(Guid Id, Guid TeamId, string Email, string Role, string InviterName, DateTime CreatedAt, DateTime IssuedAt, DateTime ExpiresAt, string Status);
internal sealed record IssuedInvitationResponse(InvitationResponse Invitation, string Token, string TeamName);
internal sealed record InvitationPreview(Guid TeamId, string TeamName, string InviterName, string Email, string Role, DateTime ExpiresAt, string Status);
