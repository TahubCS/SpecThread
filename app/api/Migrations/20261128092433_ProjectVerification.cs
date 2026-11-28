using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SpecThread.Api.Migrations
{
    /// <inheritdoc />
    public partial class ProjectVerification : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "project_verifications",
                schema: "public",
                columns: table => new
                {
                    project_id = table.Column<Guid>(type: "uuid", nullable: false),
                    repository_id = table.Column<long>(type: "bigint", nullable: false),
                    workflow = table.Column<string>(type: "text", nullable: false),
                    branch = table.Column<string>(type: "text", nullable: false),
                    configured_by = table.Column<string>(type: "text", nullable: false),
                    configured_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_project_verifications", x => x.project_id);
                    table.CheckConstraint("ck_project_verifications_branch", "char_length(branch) BETWEEN 1 AND 255 AND branch !~ '\\s'");
                    table.CheckConstraint("ck_project_verifications_workflow", "workflow ~ '^[A-Za-z0-9._-]{1,100}\\.ya?ml$'");
                    table.ForeignKey(
                        name: "FK_project_verifications_projects_project_id",
                        column: x => x.project_id,
                        principalSchema: "public",
                        principalTable: "projects",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_project_verifications_user_configured_by",
                        column: x => x.configured_by,
                        principalSchema: "public",
                        principalTable: "user",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "verification_runs",
                schema: "public",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "gen_random_uuid()"),
                    requirement_id = table.Column<Guid>(type: "uuid", nullable: false),
                    repository_id = table.Column<long>(type: "bigint", nullable: false),
                    workflow = table.Column<string>(type: "text", nullable: false),
                    branch = table.Column<string>(type: "text", nullable: false),
                    status = table.Column<string>(type: "text", nullable: false),
                    result = table.Column<string>(type: "text", nullable: true),
                    github_run_id = table.Column<long>(type: "bigint", nullable: true),
                    url = table.Column<string>(type: "text", nullable: true),
                    requested_by = table.Column<string>(type: "text", nullable: false),
                    requested_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()"),
                    started_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    completed_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    checked_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_verification_runs", x => x.id);
                    table.CheckConstraint("ck_verification_runs_result", "(status = 'completed') = (result IS NOT NULL) AND (result IS NULL OR result IN ('passed', 'failed', 'cancelled', 'skipped', 'neutral', 'not_started'))");
                    table.CheckConstraint("ck_verification_runs_status", "status IN ('requested', 'running', 'completed')");
                    table.ForeignKey(
                        name: "FK_verification_runs_requirements_requirement_id",
                        column: x => x.requirement_id,
                        principalSchema: "public",
                        principalTable: "requirements",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_verification_runs_user_requested_by",
                        column: x => x.requested_by,
                        principalSchema: "public",
                        principalTable: "user",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_project_verifications_configured_by",
                schema: "public",
                table: "project_verifications",
                column: "configured_by");

            migrationBuilder.CreateIndex(
                name: "IX_verification_runs_requested_by",
                schema: "public",
                table: "verification_runs",
                column: "requested_by");

            migrationBuilder.CreateIndex(
                name: "IX_verification_runs_requirement_id_requested_at",
                schema: "public",
                table: "verification_runs",
                columns: new[] { "requirement_id", "requested_at" });

            migrationBuilder.Sql("""
                ALTER TABLE public."project_verifications" ENABLE ROW LEVEL SECURITY;
                REVOKE ALL ON TABLE public."project_verifications" FROM PUBLIC;
                DO $security$
                BEGIN
                  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
                    REVOKE ALL ON TABLE public."project_verifications" FROM anon;
                  END IF;
                  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
                    REVOKE ALL ON TABLE public."project_verifications" FROM authenticated;
                  END IF;
                END $security$;
                """);

            migrationBuilder.Sql("""
                ALTER TABLE public."verification_runs" ENABLE ROW LEVEL SECURITY;
                REVOKE ALL ON TABLE public."verification_runs" FROM PUBLIC;
                DO $security$
                BEGIN
                  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
                    REVOKE ALL ON TABLE public."verification_runs" FROM anon;
                  END IF;
                  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
                    REVOKE ALL ON TABLE public."verification_runs" FROM authenticated;
                  END IF;
                END $security$;
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "project_verifications",
                schema: "public");

            migrationBuilder.DropTable(
                name: "verification_runs",
                schema: "public");
        }
    }
}
