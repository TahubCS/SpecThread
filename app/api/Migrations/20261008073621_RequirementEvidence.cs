using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SpecThread.Api.Migrations
{
    /// <inheritdoc />
    public partial class RequirementEvidence : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "requirement_evidence",
                schema: "public",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "gen_random_uuid()"),
                    requirement_id = table.Column<Guid>(type: "uuid", nullable: false),
                    kind = table.Column<string>(type: "text", nullable: false),
                    repository_id = table.Column<long>(type: "bigint", nullable: false),
                    repository_owner = table.Column<string>(type: "text", nullable: false),
                    repository_name = table.Column<string>(type: "text", nullable: false),
                    number = table.Column<int>(type: "integer", nullable: false),
                    title = table.Column<string>(type: "text", nullable: false),
                    state = table.Column<string>(type: "text", nullable: false),
                    author = table.Column<string>(type: "text", nullable: true),
                    url = table.Column<string>(type: "text", nullable: false),
                    github_created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    github_updated_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    github_closed_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    linked_by = table.Column<string>(type: "text", nullable: false),
                    linked_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()"),
                    refreshed_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_requirement_evidence", x => x.id);
                    table.CheckConstraint("ck_requirement_evidence_kind", "kind IN ('issue', 'pull_request')");
                    table.CheckConstraint("ck_requirement_evidence_number", "number > 0 AND repository_id > 0");
                    table.CheckConstraint("ck_requirement_evidence_state", "state IN ('open', 'closed', 'merged')");
                    table.ForeignKey(
                        name: "FK_requirement_evidence_requirements_requirement_id",
                        column: x => x.requirement_id,
                        principalSchema: "public",
                        principalTable: "requirements",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_requirement_evidence_user_linked_by",
                        column: x => x.linked_by,
                        principalSchema: "public",
                        principalTable: "user",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_requirement_evidence_linked_by",
                schema: "public",
                table: "requirement_evidence",
                column: "linked_by");

            migrationBuilder.CreateIndex(
                name: "IX_requirement_evidence_requirement_id_repository_id_number",
                schema: "public",
                table: "requirement_evidence",
                columns: new[] { "requirement_id", "repository_id", "number" },
                unique: true);
            migrationBuilder.Sql("""
                ALTER TABLE public.requirement_evidence ENABLE ROW LEVEL SECURITY;
                REVOKE ALL ON TABLE public.requirement_evidence FROM PUBLIC;
                DO $security$
                BEGIN
                  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
                    REVOKE ALL ON TABLE public.requirement_evidence FROM anon;
                  END IF;
                  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
                    REVOKE ALL ON TABLE public.requirement_evidence FROM authenticated;
                  END IF;
                END $security$;
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "requirement_evidence",
                schema: "public");
        }
    }
}
