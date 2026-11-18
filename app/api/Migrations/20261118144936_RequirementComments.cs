using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SpecThread.Api.Migrations
{
    /// <inheritdoc />
    public partial class RequirementComments : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "requirement_comments",
                schema: "public",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "gen_random_uuid()"),
                    requirement_id = table.Column<Guid>(type: "uuid", nullable: false),
                    parent_id = table.Column<Guid>(type: "uuid", nullable: true),
                    author_id = table.Column<string>(type: "text", nullable: false),
                    body = table.Column<string>(type: "text", nullable: false),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()"),
                    edited_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    deleted_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    deleted_by = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_requirement_comments", x => x.id);
                    table.CheckConstraint("ck_requirement_comments_body", "char_length(body) <= 5000");
                    table.CheckConstraint("ck_requirement_comments_deleted", "(deleted_at IS NULL) = (deleted_by IS NULL) AND (deleted_at IS NULL OR body = '')");
                    table.CheckConstraint("ck_requirement_comments_parent", "parent_id IS NULL OR parent_id <> id");
                    table.ForeignKey(
                        name: "FK_requirement_comments_requirement_comments_parent_id",
                        column: x => x.parent_id,
                        principalSchema: "public",
                        principalTable: "requirement_comments",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_requirement_comments_requirements_requirement_id",
                        column: x => x.requirement_id,
                        principalSchema: "public",
                        principalTable: "requirements",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_requirement_comments_user_author_id",
                        column: x => x.author_id,
                        principalSchema: "public",
                        principalTable: "user",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_requirement_comments_user_deleted_by",
                        column: x => x.deleted_by,
                        principalSchema: "public",
                        principalTable: "user",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "requirement_comment_events",
                schema: "public",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "gen_random_uuid()"),
                    requirement_id = table.Column<Guid>(type: "uuid", nullable: false),
                    comment_id = table.Column<Guid>(type: "uuid", nullable: false),
                    action = table.Column<string>(type: "text", nullable: false),
                    actor = table.Column<string>(type: "text", nullable: false),
                    occurred_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_requirement_comment_events", x => x.id);
                    table.CheckConstraint("ck_requirement_comment_events_action", "action IN ('created', 'edited', 'deleted')");
                    table.ForeignKey(
                        name: "FK_requirement_comment_events_requirement_comments_comment_id",
                        column: x => x.comment_id,
                        principalSchema: "public",
                        principalTable: "requirement_comments",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_requirement_comment_events_requirements_requirement_id",
                        column: x => x.requirement_id,
                        principalSchema: "public",
                        principalTable: "requirements",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_requirement_comment_events_user_actor",
                        column: x => x.actor,
                        principalSchema: "public",
                        principalTable: "user",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_requirement_comment_events_actor",
                schema: "public",
                table: "requirement_comment_events",
                column: "actor");

            migrationBuilder.CreateIndex(
                name: "IX_requirement_comment_events_comment_id",
                schema: "public",
                table: "requirement_comment_events",
                column: "comment_id");

            migrationBuilder.CreateIndex(
                name: "IX_requirement_comment_events_requirement_id",
                schema: "public",
                table: "requirement_comment_events",
                column: "requirement_id");

            migrationBuilder.CreateIndex(
                name: "IX_requirement_comments_author_id",
                schema: "public",
                table: "requirement_comments",
                column: "author_id");

            migrationBuilder.CreateIndex(
                name: "IX_requirement_comments_deleted_by",
                schema: "public",
                table: "requirement_comments",
                column: "deleted_by");

            migrationBuilder.CreateIndex(
                name: "IX_requirement_comments_parent_id",
                schema: "public",
                table: "requirement_comments",
                column: "parent_id");

            migrationBuilder.CreateIndex(
                name: "IX_requirement_comments_requirement_id_created_at",
                schema: "public",
                table: "requirement_comments",
                columns: new[] { "requirement_id", "created_at" });

            migrationBuilder.Sql("""
                ALTER TABLE public."requirement_comments" ENABLE ROW LEVEL SECURITY;
                REVOKE ALL ON TABLE public."requirement_comments" FROM PUBLIC;
                DO $security$
                BEGIN
                  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
                    REVOKE ALL ON TABLE public."requirement_comments" FROM anon;
                  END IF;
                  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
                    REVOKE ALL ON TABLE public."requirement_comments" FROM authenticated;
                  END IF;
                END $security$;
                """);

            migrationBuilder.Sql("""
                ALTER TABLE public."requirement_comment_events" ENABLE ROW LEVEL SECURITY;
                REVOKE ALL ON TABLE public."requirement_comment_events" FROM PUBLIC;
                DO $security$
                BEGIN
                  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
                    REVOKE ALL ON TABLE public."requirement_comment_events" FROM anon;
                  END IF;
                  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
                    REVOKE ALL ON TABLE public."requirement_comment_events" FROM authenticated;
                  END IF;
                END $security$;
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "requirement_comment_events",
                schema: "public");

            migrationBuilder.DropTable(
                name: "requirement_comments",
                schema: "public");
        }
    }
}
