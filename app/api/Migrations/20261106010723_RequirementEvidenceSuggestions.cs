using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SpecThread.Api.Migrations
{
    /// <inheritdoc />
    public partial class RequirementEvidenceSuggestions : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "ck_requirement_evidence_events_action",
                schema: "public",
                table: "requirement_evidence_events");

            migrationBuilder.AddColumn<Guid>(
                name: "other_requirement_id",
                schema: "public",
                table: "requirement_evidence_events",
                type: "uuid",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "requirement_evidence_suggestions",
                schema: "public",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "gen_random_uuid()"),
                    requirement_id = table.Column<Guid>(type: "uuid", nullable: false),
                    repository_id = table.Column<long>(type: "bigint", nullable: false),
                    number = table.Column<int>(type: "integer", nullable: false),
                    title = table.Column<string>(type: "text", nullable: false),
                    state = table.Column<string>(type: "text", nullable: false),
                    author = table.Column<string>(type: "text", nullable: true),
                    url = table.Column<string>(type: "text", nullable: false),
                    reference = table.Column<string>(type: "text", nullable: false),
                    status = table.Column<string>(type: "text", nullable: false, defaultValue: "pending"),
                    found_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()"),
                    decided_by = table.Column<string>(type: "text", nullable: true),
                    decided_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_requirement_evidence_suggestions", x => x.id);
                    table.CheckConstraint("ck_requirement_evidence_suggestions_decision", "(status = 'pending') = (decided_by IS NULL) AND (decided_by IS NULL) = (decided_at IS NULL)");
                    table.CheckConstraint("ck_requirement_evidence_suggestions_number", "number > 0 AND repository_id > 0");
                    table.CheckConstraint("ck_requirement_evidence_suggestions_state", "state IN ('open', 'closed', 'merged')");
                    table.CheckConstraint("ck_requirement_evidence_suggestions_status", "status IN ('pending', 'confirmed', 'rejected')");
                    table.ForeignKey(
                        name: "FK_requirement_evidence_suggestions_requirements_requirement_id",
                        column: x => x.requirement_id,
                        principalSchema: "public",
                        principalTable: "requirements",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_requirement_evidence_suggestions_user_decided_by",
                        column: x => x.decided_by,
                        principalSchema: "public",
                        principalTable: "user",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_requirement_evidence_events_other_requirement_id",
                schema: "public",
                table: "requirement_evidence_events",
                column: "other_requirement_id");

            migrationBuilder.AddCheckConstraint(
                name: "ck_requirement_evidence_events_action",
                schema: "public",
                table: "requirement_evidence_events",
                sql: "action IN ('added', 'removed', 'confirmed', 'rejected', 'moved_in', 'moved_out')");

            migrationBuilder.AddCheckConstraint(
                name: "ck_requirement_evidence_events_move",
                schema: "public",
                table: "requirement_evidence_events",
                sql: "(action IN ('moved_in', 'moved_out')) = (other_requirement_id IS NOT NULL)");

            migrationBuilder.CreateIndex(
                name: "IX_requirement_evidence_suggestions_decided_by",
                schema: "public",
                table: "requirement_evidence_suggestions",
                column: "decided_by");

            migrationBuilder.CreateIndex(
                name: "IX_requirement_evidence_suggestions_requirement_id_repository_~",
                schema: "public",
                table: "requirement_evidence_suggestions",
                columns: new[] { "requirement_id", "repository_id", "number" },
                unique: true);

            migrationBuilder.AddForeignKey(
                name: "FK_requirement_evidence_events_requirements_other_requirement_~",
                schema: "public",
                table: "requirement_evidence_events",
                column: "other_requirement_id",
                principalSchema: "public",
                principalTable: "requirements",
                principalColumn: "id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.Sql("""
                ALTER TABLE public."requirement_evidence_suggestions" ENABLE ROW LEVEL SECURITY;
                REVOKE ALL ON TABLE public."requirement_evidence_suggestions" FROM PUBLIC;
                DO $security$
                BEGIN
                  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
                    REVOKE ALL ON TABLE public."requirement_evidence_suggestions" FROM anon;
                  END IF;
                  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
                    REVOKE ALL ON TABLE public."requirement_evidence_suggestions" FROM authenticated;
                  END IF;
                END $security$;
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_requirement_evidence_events_requirements_other_requirement_~",
                schema: "public",
                table: "requirement_evidence_events");

            migrationBuilder.DropTable(
                name: "requirement_evidence_suggestions",
                schema: "public");

            migrationBuilder.DropIndex(
                name: "IX_requirement_evidence_events_other_requirement_id",
                schema: "public",
                table: "requirement_evidence_events");

            migrationBuilder.DropCheckConstraint(
                name: "ck_requirement_evidence_events_action",
                schema: "public",
                table: "requirement_evidence_events");

            migrationBuilder.DropCheckConstraint(
                name: "ck_requirement_evidence_events_move",
                schema: "public",
                table: "requirement_evidence_events");

            migrationBuilder.DropColumn(
                name: "other_requirement_id",
                schema: "public",
                table: "requirement_evidence_events");

            migrationBuilder.Sql("""
                DELETE FROM public.requirement_evidence_events WHERE action = 'rejected';
                UPDATE public.requirement_evidence_events SET action = 'added' WHERE action IN ('confirmed', 'moved_in');
                UPDATE public.requirement_evidence_events SET action = 'removed' WHERE action = 'moved_out';
                """);

            migrationBuilder.AddCheckConstraint(
                name: "ck_requirement_evidence_events_action",
                schema: "public",
                table: "requirement_evidence_events",
                sql: "action IN ('added', 'removed')");
        }
    }
}
