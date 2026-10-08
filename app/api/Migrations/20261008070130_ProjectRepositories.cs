using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SpecThread.Api.Migrations
{
    /// <inheritdoc />
    public partial class ProjectRepositories : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "project_repositories",
                schema: "public",
                columns: table => new
                {
                    project_id = table.Column<Guid>(type: "uuid", nullable: false),
                    installation_id = table.Column<long>(type: "bigint", nullable: false),
                    repository_id = table.Column<long>(type: "bigint", nullable: false),
                    owner = table.Column<string>(type: "text", nullable: false),
                    name = table.Column<string>(type: "text", nullable: false),
                    is_private = table.Column<bool>(type: "boolean", nullable: false),
                    connected_by = table.Column<string>(type: "text", nullable: false),
                    connected_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_project_repositories", x => x.project_id);
                    table.CheckConstraint("ck_project_repositories_ids", "installation_id > 0 AND repository_id > 0");
                    table.CheckConstraint("ck_project_repositories_name", "length(btrim(owner)) > 0 AND length(btrim(name)) > 0");
                    table.ForeignKey(
                        name: "FK_project_repositories_projects_project_id",
                        column: x => x.project_id,
                        principalSchema: "public",
                        principalTable: "projects",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_project_repositories_user_connected_by",
                        column: x => x.connected_by,
                        principalSchema: "public",
                        principalTable: "user",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_project_repositories_connected_by",
                schema: "public",
                table: "project_repositories",
                column: "connected_by");
            migrationBuilder.Sql("""
                ALTER TABLE public.project_repositories ENABLE ROW LEVEL SECURITY;
                REVOKE ALL ON TABLE public.project_repositories FROM PUBLIC;
                DO $security$
                BEGIN
                  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
                    REVOKE ALL ON TABLE public.project_repositories FROM anon;
                  END IF;
                  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
                    REVOKE ALL ON TABLE public.project_repositories FROM authenticated;
                  END IF;
                END $security$;
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "project_repositories",
                schema: "public");
        }
    }
}
