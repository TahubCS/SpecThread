using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SpecThread.Api.Migrations
{
    /// <inheritdoc />
    public partial class ProjectReleases : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "project_releases",
                schema: "public",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "gen_random_uuid()"),
                    project_id = table.Column<Guid>(type: "uuid", nullable: false),
                    repository_id = table.Column<long>(type: "bigint", nullable: false),
                    tag = table.Column<string>(type: "text", nullable: false),
                    name = table.Column<string>(type: "text", nullable: false),
                    sha = table.Column<string>(type: "text", nullable: false),
                    url = table.Column<string>(type: "text", nullable: false),
                    author = table.Column<string>(type: "text", nullable: true),
                    prerelease = table.Column<bool>(type: "boolean", nullable: false),
                    published_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    environment = table.Column<string>(type: "text", nullable: false),
                    deployed_on = table.Column<DateOnly>(type: "date", nullable: false),
                    recorded_by = table.Column<string>(type: "text", nullable: false),
                    recorded_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()"),
                    contains = table.Column<string>(type: "text", nullable: false),
                    compared_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_project_releases", x => x.id);
                    table.CheckConstraint("ck_project_releases_environment", "char_length(environment) BETWEEN 1 AND 50 AND environment = btrim(environment)");
                    table.CheckConstraint("ck_project_releases_sha", "sha ~ '^[0-9a-f]{40}$'");
                    table.CheckConstraint("ck_project_releases_tag", "char_length(tag) BETWEEN 1 AND 255");
                    table.ForeignKey(
                        name: "FK_project_releases_projects_project_id",
                        column: x => x.project_id,
                        principalSchema: "public",
                        principalTable: "projects",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_project_releases_user_recorded_by",
                        column: x => x.recorded_by,
                        principalSchema: "public",
                        principalTable: "user",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_project_releases_project_id_repository_id_tag_environment",
                schema: "public",
                table: "project_releases",
                columns: new[] { "project_id", "repository_id", "tag", "environment" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_project_releases_recorded_by",
                schema: "public",
                table: "project_releases",
                column: "recorded_by");

            migrationBuilder.Sql("""
                ALTER TABLE public."project_releases" ENABLE ROW LEVEL SECURITY;
                REVOKE ALL ON TABLE public."project_releases" FROM PUBLIC;
                DO $security$
                BEGIN
                  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
                    REVOKE ALL ON TABLE public."project_releases" FROM anon;
                  END IF;
                  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
                    REVOKE ALL ON TABLE public."project_releases" FROM authenticated;
                  END IF;
                END $security$;
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "project_releases",
                schema: "public");
        }
    }
}
