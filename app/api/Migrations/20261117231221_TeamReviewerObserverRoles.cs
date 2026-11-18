using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SpecThread.Api.Migrations
{
    /// <inheritdoc />
    public partial class TeamReviewerObserverRoles : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "ck_team_members_role",
                schema: "public",
                table: "team_members");

            migrationBuilder.DropCheckConstraint(
                name: "ck_team_invitations_role",
                schema: "public",
                table: "team_invitations");

            migrationBuilder.AddCheckConstraint(
                name: "ck_team_members_role",
                schema: "public",
                table: "team_members",
                sql: "role IN ('admin', 'member', 'reviewer', 'observer')");

            migrationBuilder.AddCheckConstraint(
                name: "ck_team_invitations_role",
                schema: "public",
                table: "team_invitations",
                sql: "role IN ('admin', 'member', 'reviewer', 'observer')");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "ck_team_members_role",
                schema: "public",
                table: "team_members");

            migrationBuilder.DropCheckConstraint(
                name: "ck_team_invitations_role",
                schema: "public",
                table: "team_invitations");

            migrationBuilder.Sql("""
                UPDATE public.team_members m SET role = 'member' FROM public.teams t
                  WHERE m.team_id = t.id AND m.user_id = t.owner_user_id AND m.role IN ('reviewer', 'observer');
                DELETE FROM public.team_members WHERE role IN ('reviewer', 'observer');
                DELETE FROM public.team_invitations WHERE role IN ('reviewer', 'observer');
                """);

            migrationBuilder.AddCheckConstraint(
                name: "ck_team_members_role",
                schema: "public",
                table: "team_members",
                sql: "role IN ('admin', 'member')");

            migrationBuilder.AddCheckConstraint(
                name: "ck_team_invitations_role",
                schema: "public",
                table: "team_invitations",
                sql: "role IN ('admin', 'member')");
        }
    }
}
