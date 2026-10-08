using Microsoft.EntityFrameworkCore;

namespace SpecThread.Api.Data;

public sealed class SpecThreadDbContext(DbContextOptions<SpecThreadDbContext> options)
    : DbContext(options)
{
    public DbSet<Project> Projects => Set<Project>();
    public DbSet<ProjectMember> ProjectMembers => Set<ProjectMember>();
    public DbSet<Requirement> Requirements => Set<Requirement>();
    public DbSet<AcceptanceCriterion> AcceptanceCriteria => Set<AcceptanceCriterion>();
    public DbSet<ProjectRepository> ProjectRepositories => Set<ProjectRepository>();
    public DbSet<RequirementEvidence> RequirementEvidence => Set<RequirementEvidence>();

    protected override void OnModelCreating(ModelBuilder model)
    {
        model.HasDefaultSchema("public");

        model.Entity<AuthUser>().ToTable("user");
        model.Entity<AuthSession>().ToTable("session");
        model.Entity<AuthAccount>().ToTable("account");
        model.Entity<AuthVerification>().ToTable("verification");
        model.Entity<AuthSigningKey>().ToTable("jwks");
        model.Entity<AuthRateLimit>().ToTable("rateLimit");

        // Preserve Better Auth's default text IDs and case-sensitive field names.
        foreach (var type in new[] { typeof(AuthUser), typeof(AuthSession), typeof(AuthAccount), typeof(AuthVerification), typeof(AuthSigningKey), typeof(AuthRateLimit) })
        {
            var entity = model.Entity(type);
            entity.HasKey("Id");
            entity.Property<string>("Id").ValueGeneratedNever();
            foreach (var property in entity.Metadata.GetProperties())
            {
                property.SetColumnName(char.ToLowerInvariant(property.Name[0]) + property.Name[1..]);
            }
        }

        model.Entity<AuthUser>().HasIndex(x => x.Email).IsUnique();
        model.Entity<AuthUser>().Property(x => x.EmailVerified).HasDefaultValue(false);
        model.Entity<AuthSession>().HasIndex(x => x.Token).IsUnique();
        model.Entity<AuthSession>().HasOne<AuthUser>().WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Cascade);
        model.Entity<AuthAccount>().HasOne<AuthUser>().WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Cascade);
        model.Entity<AuthAccount>().HasIndex(x => new { x.ProviderId, x.AccountId }).IsUnique();
        model.Entity<AuthVerification>().HasIndex(x => x.Identifier);
        model.Entity<AuthRateLimit>().HasIndex(x => x.Key).IsUnique();
        model.Entity<AuthRateLimit>().HasIndex(x => x.LastRequest);

        var project = model.Entity<Project>();
        project.ToTable("projects", table => table.HasCheckConstraint("ck_projects_name", "length(btrim(name)) > 0"));
        project.HasKey(x => x.Id);
        project.Property(x => x.Id).HasColumnName("id").HasDefaultValueSql("gen_random_uuid()");
        project.Property(x => x.Name).HasColumnName("name");
        project.Property(x => x.OwnerUserId).HasColumnName("owner_user_id");
        project.Property(x => x.CreatedAt).HasColumnName("created_at").HasDefaultValueSql("now()");
        project.Property(x => x.ArchivedAt).HasColumnName("archived_at");
        project.HasOne<AuthUser>().WithMany().HasForeignKey(x => x.OwnerUserId).OnDelete(DeleteBehavior.Restrict);

        var member = model.Entity<ProjectMember>();
        member.ToTable("project_members");
        member.HasKey(x => new { x.ProjectId, x.UserId });
        member.Property(x => x.ProjectId).HasColumnName("project_id");
        member.Property(x => x.UserId).HasColumnName("user_id");
        member.Property(x => x.JoinedAt).HasColumnName("joined_at").HasDefaultValueSql("now()");
        member.HasOne<Project>().WithMany().HasForeignKey(x => x.ProjectId).OnDelete(DeleteBehavior.Restrict);
        member.HasOne<AuthUser>().WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Restrict);

        var requirement = model.Entity<Requirement>();
        requirement.ToTable("requirements", table =>
        {
            table.HasCheckConstraint("ck_requirements_title", "length(btrim(title)) > 0");
            table.HasCheckConstraint("ck_requirements_version", "version > 0");
        });
        requirement.HasKey(x => x.Id);
        requirement.Property(x => x.Id).HasColumnName("id").HasDefaultValueSql("gen_random_uuid()");
        requirement.Property(x => x.ProjectId).HasColumnName("project_id");
        requirement.Property(x => x.Title).HasColumnName("title");
        requirement.Property(x => x.Description).HasColumnName("description");
        requirement.Property(x => x.CreatedBy).HasColumnName("created_by");
        requirement.Property(x => x.CreatedAt).HasColumnName("created_at").HasDefaultValueSql("now()");
        requirement.Property(x => x.UpdatedAt).HasColumnName("updated_at").HasDefaultValueSql("now()");
        requirement.Property(x => x.ArchivedAt).HasColumnName("archived_at");
        requirement.Property(x => x.Version).HasColumnName("version").HasDefaultValue(1).IsConcurrencyToken();
        requirement.HasOne<Project>().WithMany().HasForeignKey(x => x.ProjectId).OnDelete(DeleteBehavior.Restrict);
        requirement.HasOne<AuthUser>().WithMany().HasForeignKey(x => x.CreatedBy).OnDelete(DeleteBehavior.Restrict);

        var criterion = model.Entity<AcceptanceCriterion>();
        criterion.ToTable("acceptance_criteria", table =>
        {
            table.HasCheckConstraint("ck_criteria_text", "length(btrim(text)) > 0");
            table.HasCheckConstraint("ck_criteria_position", "position >= 0");
        });
        criterion.HasKey(x => x.Id);
        criterion.Property(x => x.Id).HasColumnName("id").HasDefaultValueSql("gen_random_uuid()");
        criterion.Property(x => x.RequirementId).HasColumnName("requirement_id");
        criterion.Property(x => x.Text).HasColumnName("text");
        criterion.Property(x => x.Position).HasColumnName("position");
        criterion.HasIndex(x => new { x.RequirementId, x.Position }).IsUnique();
        criterion.HasOne<Requirement>().WithMany().HasForeignKey(x => x.RequirementId).OnDelete(DeleteBehavior.Restrict);

        var repository = model.Entity<ProjectRepository>();
        repository.ToTable("project_repositories", table =>
        {
            table.HasCheckConstraint("ck_project_repositories_ids", "installation_id > 0 AND repository_id > 0");
            table.HasCheckConstraint("ck_project_repositories_name", "length(btrim(owner)) > 0 AND length(btrim(name)) > 0");
        });
        repository.HasKey(x => x.ProjectId);
        repository.Property(x => x.ProjectId).HasColumnName("project_id").ValueGeneratedNever();
        repository.Property(x => x.InstallationId).HasColumnName("installation_id");
        repository.Property(x => x.RepositoryId).HasColumnName("repository_id");
        repository.Property(x => x.Owner).HasColumnName("owner");
        repository.Property(x => x.Name).HasColumnName("name");
        repository.Property(x => x.IsPrivate).HasColumnName("is_private");
        repository.Property(x => x.ConnectedBy).HasColumnName("connected_by");
        repository.Property(x => x.ConnectedAt).HasColumnName("connected_at").HasDefaultValueSql("now()");
        repository.HasOne<Project>().WithOne().HasForeignKey<ProjectRepository>(x => x.ProjectId).OnDelete(DeleteBehavior.Restrict);
        repository.HasOne<AuthUser>().WithMany().HasForeignKey(x => x.ConnectedBy).OnDelete(DeleteBehavior.Restrict);

        var evidence = model.Entity<RequirementEvidence>();
        evidence.ToTable("requirement_evidence", table =>
        {
            table.HasCheckConstraint("ck_requirement_evidence_kind", "kind IN ('issue', 'pull_request', 'commit')");
            table.HasCheckConstraint("ck_requirement_evidence_state", "state IS NULL OR state IN ('open', 'closed', 'merged')");
            table.HasCheckConstraint("ck_requirement_evidence_repository", "repository_id > 0");
            // A commit is identified by its SHA; an issue or pull request by its number, and it has a state.
            table.HasCheckConstraint("ck_requirement_evidence_identity",
                "(kind = 'commit' AND sha IS NOT NULL AND sha ~ '^[0-9a-f]{40}$' AND number IS NULL AND state IS NULL) OR (kind <> 'commit' AND number IS NOT NULL AND number > 0 AND state IS NOT NULL)");
            table.HasCheckConstraint("ck_requirement_evidence_changes",
                "COALESCE(additions, 0) >= 0 AND COALESCE(deletions, 0) >= 0 AND COALESCE(changed_files, 0) >= 0 AND COALESCE(commit_count, 0) >= 0");
        });
        evidence.HasKey(x => x.Id);
        evidence.Property(x => x.Id).HasColumnName("id").HasDefaultValueSql("gen_random_uuid()");
        evidence.Property(x => x.RequirementId).HasColumnName("requirement_id");
        evidence.Property(x => x.Kind).HasColumnName("kind");
        evidence.Property(x => x.RepositoryId).HasColumnName("repository_id");
        evidence.Property(x => x.RepositoryOwner).HasColumnName("repository_owner");
        evidence.Property(x => x.RepositoryName).HasColumnName("repository_name");
        evidence.Property(x => x.Number).HasColumnName("number");
        evidence.Property(x => x.Sha).HasColumnName("sha");
        evidence.Property(x => x.Additions).HasColumnName("additions");
        evidence.Property(x => x.Deletions).HasColumnName("deletions");
        evidence.Property(x => x.ChangedFiles).HasColumnName("changed_files");
        evidence.Property(x => x.CommitCount).HasColumnName("commit_count");
        evidence.Property(x => x.Commits).HasColumnName("commits").HasColumnType("jsonb");
        evidence.Property(x => x.Title).HasColumnName("title");
        evidence.Property(x => x.State).HasColumnName("state");
        evidence.Property(x => x.Author).HasColumnName("author");
        evidence.Property(x => x.Url).HasColumnName("url");
        evidence.Property(x => x.GitHubCreatedAt).HasColumnName("github_created_at");
        evidence.Property(x => x.GitHubUpdatedAt).HasColumnName("github_updated_at");
        evidence.Property(x => x.GitHubClosedAt).HasColumnName("github_closed_at");
        evidence.Property(x => x.LinkedBy).HasColumnName("linked_by");
        evidence.Property(x => x.LinkedAt).HasColumnName("linked_at").HasDefaultValueSql("now()");
        evidence.Property(x => x.RefreshedAt).HasColumnName("refreshed_at").HasDefaultValueSql("now()");
        evidence.HasIndex(x => new { x.RequirementId, x.RepositoryId, x.Number }).IsUnique();
        evidence.HasIndex(x => new { x.RequirementId, x.RepositoryId, x.Sha }).IsUnique().HasFilter("kind = 'commit'");
        evidence.HasOne<Requirement>().WithMany().HasForeignKey(x => x.RequirementId).OnDelete(DeleteBehavior.Restrict);
        evidence.HasOne<AuthUser>().WithMany().HasForeignKey(x => x.LinkedBy).OnDelete(DeleteBehavior.Restrict);
    }
}
