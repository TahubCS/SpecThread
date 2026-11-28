using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SpecThread.Api.Migrations
{
    /// <inheritdoc />
    public partial class RequirementEvents : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "requirement_events",
                schema: "public",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "gen_random_uuid()"),
                    requirement_id = table.Column<Guid>(type: "uuid", nullable: false),
                    action = table.Column<string>(type: "text", nullable: false),
                    version = table.Column<int>(type: "integer", nullable: true),
                    changes = table.Column<string[]>(type: "text[]", nullable: true),
                    milestone = table.Column<string>(type: "text", nullable: true),
                    actor = table.Column<string>(type: "text", nullable: false),
                    occurred_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_requirement_events", x => x.id);
                    table.CheckConstraint("ck_requirement_events_action", "action IN ('created', 'edited', 'archived', 'restored', 'milestone_set', 'milestone_cleared')");
                    table.CheckConstraint("ck_requirement_events_changes", "changes IS NULL OR (action = 'edited' AND changes <@ ARRAY['title', 'description', 'criteria', 'documents']::text[])");
                    table.CheckConstraint("ck_requirement_events_milestone", "(milestone IS NOT NULL) = (action = 'milestone_set')");
                    table.CheckConstraint("ck_requirement_events_version", "version IS NULL OR version > 0");
                    table.ForeignKey(
                        name: "FK_requirement_events_requirements_requirement_id",
                        column: x => x.requirement_id,
                        principalSchema: "public",
                        principalTable: "requirements",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_requirement_events_user_actor",
                        column: x => x.actor,
                        principalSchema: "public",
                        principalTable: "user",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_requirement_events_actor",
                schema: "public",
                table: "requirement_events",
                column: "actor");

            migrationBuilder.CreateIndex(
                name: "IX_requirement_events_requirement_id_occurred_at",
                schema: "public",
                table: "requirement_events",
                columns: new[] { "requirement_id", "occurred_at" });

            migrationBuilder.Sql("""
                ALTER TABLE public."requirement_events" ENABLE ROW LEVEL SECURITY;
                REVOKE ALL ON TABLE public."requirement_events" FROM PUBLIC;
                DO $security$
                BEGIN
                  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
                    REVOKE ALL ON TABLE public."requirement_events" FROM anon;
                  END IF;
                  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
                    REVOKE ALL ON TABLE public."requirement_events" FROM authenticated;
                  END IF;
                END $security$;
                """);

            migrationBuilder.Sql("""
                INSERT INTO public.requirement_events (requirement_id, action, version, actor, occurred_at)
                SELECT id, 'created', 1, created_by, created_at FROM public.requirements;
                INSERT INTO public.requirement_events (requirement_id, action, version, actor, occurred_at)
                SELECT id, 'edited', version, COALESCE(updated_by, created_by), updated_at FROM public.requirements WHERE version > 1;
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "requirement_events",
                schema: "public");
        }
    }
}
