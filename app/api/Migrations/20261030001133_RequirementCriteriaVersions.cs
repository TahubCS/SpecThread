using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SpecThread.Api.Migrations
{
    /// <inheritdoc />
    public partial class RequirementCriteriaVersions : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "criteria_version",
                schema: "public",
                table: "requirement_reviews",
                type: "integer",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "requirement_criteria_versions",
                schema: "public",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "gen_random_uuid()"),
                    requirement_id = table.Column<Guid>(type: "uuid", nullable: false),
                    number = table.Column<int>(type: "integer", nullable: false),
                    criteria = table.Column<string>(type: "jsonb", nullable: false),
                    created_by = table.Column<string>(type: "text", nullable: false),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_requirement_criteria_versions", x => x.id);
                    table.CheckConstraint("ck_requirement_criteria_versions_criteria", "jsonb_typeof(criteria) = 'array'");
                    table.CheckConstraint("ck_requirement_criteria_versions_number", "number > 0");
                    table.ForeignKey(
                        name: "FK_requirement_criteria_versions_requirements_requirement_id",
                        column: x => x.requirement_id,
                        principalSchema: "public",
                        principalTable: "requirements",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_requirement_criteria_versions_user_created_by",
                        column: x => x.created_by,
                        principalSchema: "public",
                        principalTable: "user",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.AddCheckConstraint(
                name: "ck_requirement_reviews_criteria_version",
                schema: "public",
                table: "requirement_reviews",
                sql: "criteria_version IS NULL OR criteria_version > 0");

            migrationBuilder.CreateIndex(
                name: "IX_requirement_criteria_versions_created_by",
                schema: "public",
                table: "requirement_criteria_versions",
                column: "created_by");

            migrationBuilder.CreateIndex(
                name: "IX_requirement_criteria_versions_requirement_id_number",
                schema: "public",
                table: "requirement_criteria_versions",
                columns: new[] { "requirement_id", "number" },
                unique: true);

            migrationBuilder.Sql("""
                ALTER TABLE public."requirement_criteria_versions" ENABLE ROW LEVEL SECURITY;
                REVOKE ALL ON TABLE public."requirement_criteria_versions" FROM PUBLIC;
                DO $security$
                BEGIN
                  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
                    REVOKE ALL ON TABLE public."requirement_criteria_versions" FROM anon;
                  END IF;
                  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
                    REVOKE ALL ON TABLE public."requirement_criteria_versions" FROM authenticated;
                  END IF;
                END $security$;
                INSERT INTO public.requirement_criteria_versions (requirement_id, number, criteria, created_by, created_at)
                SELECT r.id, 1,
                  COALESCE((SELECT jsonb_agg(c.text ORDER BY c.position) FROM public.acceptance_criteria c WHERE c.requirement_id = r.id), '[]'::jsonb),
                  COALESCE(r.updated_by, r.created_by), r.updated_at
                FROM public.requirements r;
                UPDATE public.requirement_reviews v SET criteria_version = 1
                FROM public.requirements r
                WHERE r.id = v.requirement_id AND v.requirement_version = r.version AND v.criteria_version IS NULL;
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "requirement_criteria_versions",
                schema: "public");

            migrationBuilder.DropCheckConstraint(
                name: "ck_requirement_reviews_criteria_version",
                schema: "public",
                table: "requirement_reviews");

            migrationBuilder.DropColumn(
                name: "criteria_version",
                schema: "public",
                table: "requirement_reviews");
        }
    }
}
