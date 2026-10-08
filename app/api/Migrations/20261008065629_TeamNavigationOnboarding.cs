using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SpecThread.Api.Migrations
{
    /// <inheritdoc />
    public partial class TeamNavigationOnboarding : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "is_expanded",
                schema: "public",
                table: "team_members",
                type: "boolean",
                nullable: false,
                defaultValue: true);

            migrationBuilder.AddColumn<bool>(
                name: "is_favorite",
                schema: "public",
                table: "team_members",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.CreateTable(
                name: "user_onboarding",
                schema: "public",
                columns: table => new
                {
                    user_id = table.Column<string>(type: "text", nullable: false),
                    completed_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_user_onboarding", x => x.user_id);
                    table.ForeignKey(
                        name: "FK_user_onboarding_user_user_id",
                        column: x => x.user_id,
                        principalSchema: "public",
                        principalTable: "user",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });
            migrationBuilder.Sql("""
                INSERT INTO public.user_onboarding (user_id, completed_at)
                SELECT user_id, min(joined_at) FROM public.team_members GROUP BY user_id;
                ALTER TABLE public.user_onboarding ENABLE ROW LEVEL SECURITY;
                REVOKE ALL ON TABLE public.user_onboarding FROM PUBLIC;
                DO $security$
                BEGIN
                  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
                    REVOKE ALL ON TABLE public.user_onboarding FROM anon;
                  END IF;
                  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
                    REVOKE ALL ON TABLE public.user_onboarding FROM authenticated;
                  END IF;
                END $security$;
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "user_onboarding",
                schema: "public");

            migrationBuilder.DropColumn(
                name: "is_expanded",
                schema: "public",
                table: "team_members");

            migrationBuilder.DropColumn(
                name: "is_favorite",
                schema: "public",
                table: "team_members");
        }
    }
}
