using Microsoft.EntityFrameworkCore;

namespace SpecThread.Api.Data;

public sealed class SpecThreadDbContext(DbContextOptions<SpecThreadDbContext> options)
    : DbContext(options)
{
    public DbSet<Project> Projects => Set<Project>();
    public DbSet<ProjectMember> ProjectMembers => Set<ProjectMember>();
    public DbSet<Requirement> Requirements => Set<Requirement>();
    public DbSet<AcceptanceCriterion> AcceptanceCriteria => Set<AcceptanceCriterion>();

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
    }
}
