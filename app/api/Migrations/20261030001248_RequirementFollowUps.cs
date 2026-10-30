using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SpecThread.Api.Migrations
{
    /// <inheritdoc />
    public partial class RequirementFollowUps : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "requirement_follow_up_events",
                schema: "public",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "gen_random_uuid()"),
                    requirement_id = table.Column<Guid>(type: "uuid", nullable: false),
                    original_requirement_id = table.Column<Guid>(type: "uuid", nullable: false),
                    action = table.Column<string>(type: "text", nullable: false),
                    actor = table.Column<string>(type: "text", nullable: false),
                    occurred_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_requirement_follow_up_events", x => x.id);
                    table.CheckConstraint("ck_requirement_follow_up_events_action", "action IN ('added', 'removed')");
                    table.CheckConstraint("ck_requirement_follow_up_events_distinct", "requirement_id <> original_requirement_id");
                    table.ForeignKey(
                        name: "FK_requirement_follow_up_events_requirements_original_requirem~",
                        column: x => x.original_requirement_id,
                        principalSchema: "public",
                        principalTable: "requirements",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_requirement_follow_up_events_requirements_requirement_id",
                        column: x => x.requirement_id,
                        principalSchema: "public",
                        principalTable: "requirements",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_requirement_follow_up_events_user_actor",
                        column: x => x.actor,
                        principalSchema: "public",
                        principalTable: "user",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "requirement_follow_ups",
                schema: "public",
                columns: table => new
                {
                    requirement_id = table.Column<Guid>(type: "uuid", nullable: false),
                    original_requirement_id = table.Column<Guid>(type: "uuid", nullable: false),
                    linked_by = table.Column<string>(type: "text", nullable: false),
                    linked_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_requirement_follow_ups", x => new { x.requirement_id, x.original_requirement_id });
                    table.CheckConstraint("ck_requirement_follow_ups_distinct", "requirement_id <> original_requirement_id");
                    table.ForeignKey(
                        name: "FK_requirement_follow_ups_requirements_original_requirement_id",
                        column: x => x.original_requirement_id,
                        principalSchema: "public",
                        principalTable: "requirements",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_requirement_follow_ups_requirements_requirement_id",
                        column: x => x.requirement_id,
                        principalSchema: "public",
                        principalTable: "requirements",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_requirement_follow_ups_user_linked_by",
                        column: x => x.linked_by,
                        principalSchema: "public",
                        principalTable: "user",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_requirement_follow_up_events_actor",
                schema: "public",
                table: "requirement_follow_up_events",
                column: "actor");

            migrationBuilder.CreateIndex(
                name: "IX_requirement_follow_up_events_original_requirement_id",
                schema: "public",
                table: "requirement_follow_up_events",
                column: "original_requirement_id");

            migrationBuilder.CreateIndex(
                name: "IX_requirement_follow_up_events_requirement_id",
                schema: "public",
                table: "requirement_follow_up_events",
                column: "requirement_id");

            migrationBuilder.CreateIndex(
                name: "IX_requirement_follow_ups_linked_by",
                schema: "public",
                table: "requirement_follow_ups",
                column: "linked_by");

            migrationBuilder.CreateIndex(
                name: "IX_requirement_follow_ups_original_requirement_id",
                schema: "public",
                table: "requirement_follow_ups",
                column: "original_requirement_id");

            migrationBuilder.Sql("""
                ALTER TABLE public."requirement_follow_ups" ENABLE ROW LEVEL SECURITY;
                REVOKE ALL ON TABLE public."requirement_follow_ups" FROM PUBLIC;
                DO $security$
                BEGIN
                  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
                    REVOKE ALL ON TABLE public."requirement_follow_ups" FROM anon;
                  END IF;
                  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
                    REVOKE ALL ON TABLE public."requirement_follow_ups" FROM authenticated;
                  END IF;
                END $security$;
                """);

            migrationBuilder.Sql("""
                ALTER TABLE public."requirement_follow_up_events" ENABLE ROW LEVEL SECURITY;
                REVOKE ALL ON TABLE public."requirement_follow_up_events" FROM PUBLIC;
                DO $security$
                BEGIN
                  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
                    REVOKE ALL ON TABLE public."requirement_follow_up_events" FROM anon;
                  END IF;
                  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
                    REVOKE ALL ON TABLE public."requirement_follow_up_events" FROM authenticated;
                  END IF;
                END $security$;
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "requirement_follow_up_events",
                schema: "public");

            migrationBuilder.DropTable(
                name: "requirement_follow_ups",
                schema: "public");
        }
    }
}
