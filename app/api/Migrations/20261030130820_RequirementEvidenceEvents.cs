using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SpecThread.Api.Migrations
{
    /// <inheritdoc />
    public partial class RequirementEvidenceEvents : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "requirement_evidence_events",
                schema: "public",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "gen_random_uuid()"),
                    requirement_id = table.Column<Guid>(type: "uuid", nullable: false),
                    evidence_id = table.Column<Guid>(type: "uuid", nullable: false),
                    action = table.Column<string>(type: "text", nullable: false),
                    kind = table.Column<string>(type: "text", nullable: false),
                    label = table.Column<string>(type: "text", nullable: false),
                    title = table.Column<string>(type: "text", nullable: false),
                    actor = table.Column<string>(type: "text", nullable: false),
                    occurred_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_requirement_evidence_events", x => x.id);
                    table.CheckConstraint("ck_requirement_evidence_events_action", "action IN ('added', 'removed')");
                    table.CheckConstraint("ck_requirement_evidence_events_kind", "kind IN ('issue', 'pull_request', 'commit', 'release')");
                    table.CheckConstraint("ck_requirement_evidence_events_label", "length(btrim(label)) > 0");
                    table.ForeignKey(
                        name: "FK_requirement_evidence_events_requirements_requirement_id",
                        column: x => x.requirement_id,
                        principalSchema: "public",
                        principalTable: "requirements",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_requirement_evidence_events_user_actor",
                        column: x => x.actor,
                        principalSchema: "public",
                        principalTable: "user",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_requirement_evidence_events_actor",
                schema: "public",
                table: "requirement_evidence_events",
                column: "actor");

            migrationBuilder.CreateIndex(
                name: "IX_requirement_evidence_events_requirement_id_occurred_at",
                schema: "public",
                table: "requirement_evidence_events",
                columns: new[] { "requirement_id", "occurred_at" });

            migrationBuilder.Sql("""
                ALTER TABLE public."requirement_evidence_events" ENABLE ROW LEVEL SECURITY;
                REVOKE ALL ON TABLE public."requirement_evidence_events" FROM PUBLIC;
                DO $security$
                BEGIN
                  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
                    REVOKE ALL ON TABLE public."requirement_evidence_events" FROM anon;
                  END IF;
                  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
                    REVOKE ALL ON TABLE public."requirement_evidence_events" FROM authenticated;
                  END IF;
                END $security$;
                INSERT INTO public.requirement_evidence_events (requirement_id, evidence_id, action, kind, label, title, actor, occurred_at)
                SELECT e.requirement_id, e.id, 'added', e.kind,
                  CASE WHEN e.number IS NOT NULL THEN '#' || e.number WHEN e.tag IS NOT NULL THEN e.tag ELSE left(e.sha, 7) END,
                  e.title, e.linked_by, e.linked_at
                FROM public.requirement_evidence e;
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "requirement_evidence_events",
                schema: "public");
        }
    }
}
