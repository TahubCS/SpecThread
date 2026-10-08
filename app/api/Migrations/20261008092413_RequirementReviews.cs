using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SpecThread.Api.Migrations
{
    /// <inheritdoc />
    public partial class RequirementReviews : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "requirement_reviews",
                schema: "public",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "gen_random_uuid()"),
                    requirement_id = table.Column<Guid>(type: "uuid", nullable: false),
                    decision = table.Column<string>(type: "text", nullable: false),
                    note = table.Column<string>(type: "text", nullable: false, defaultValue: ""),
                    requirement_version = table.Column<int>(type: "integer", nullable: false),
                    evidence = table.Column<string>(type: "jsonb", nullable: false),
                    decided_by = table.Column<string>(type: "text", nullable: false),
                    decided_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_requirement_reviews", x => x.id);
                    table.CheckConstraint("ck_requirement_reviews_decision", "decision IN ('accepted', 'rejected', 'more_evidence')");
                    table.CheckConstraint("ck_requirement_reviews_evidence", "jsonb_typeof(evidence) = 'array'");
                    table.CheckConstraint("ck_requirement_reviews_note", "decision = 'accepted' OR length(btrim(note)) > 0");
                    table.CheckConstraint("ck_requirement_reviews_version", "requirement_version > 0");
                    table.ForeignKey(
                        name: "FK_requirement_reviews_requirements_requirement_id",
                        column: x => x.requirement_id,
                        principalSchema: "public",
                        principalTable: "requirements",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_requirement_reviews_user_decided_by",
                        column: x => x.decided_by,
                        principalSchema: "public",
                        principalTable: "user",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_requirement_reviews_decided_by",
                schema: "public",
                table: "requirement_reviews",
                column: "decided_by");

            migrationBuilder.CreateIndex(
                name: "IX_requirement_reviews_requirement_id_decided_at",
                schema: "public",
                table: "requirement_reviews",
                columns: new[] { "requirement_id", "decided_at" });
            migrationBuilder.Sql("""
                ALTER TABLE public.requirement_reviews ENABLE ROW LEVEL SECURITY;
                REVOKE ALL ON TABLE public.requirement_reviews FROM PUBLIC;
                DO $security$
                BEGIN
                  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
                    REVOKE ALL ON TABLE public.requirement_reviews FROM anon;
                  END IF;
                  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
                    REVOKE ALL ON TABLE public.requirement_reviews FROM authenticated;
                  END IF;
                END $security$;
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "requirement_reviews",
                schema: "public");
        }
    }
}
