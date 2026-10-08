using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SpecThread.Api.Migrations
{
    /// <inheritdoc />
    public partial class TeamProjects : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "team_id",
                schema: "public",
                table: "projects",
                type: "uuid",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"));

            migrationBuilder.Sql("""
                UPDATE public.projects SET team_id = gen_random_uuid();
                INSERT INTO public.teams (id, name, description, owner_user_id, created_at)
                SELECT team_id, left(btrim(name), 200), '', owner_user_id, created_at FROM public.projects;
                INSERT INTO public.team_members (team_id, user_id, role, joined_at)
                SELECT p.team_id, m.user_id, 'member', m.joined_at
                FROM public.projects p JOIN public.project_members m ON m.project_id = p.id;
                INSERT INTO public.team_members (team_id, user_id, role, joined_at)
                SELECT team_id, owner_user_id, 'member', created_at FROM public.projects
                ON CONFLICT (team_id, user_id) DO NOTHING;
                INSERT INTO public.user_onboarding (user_id, completed_at)
                SELECT m.user_id, min(m.joined_at) FROM public.team_members m
                JOIN public.projects p ON p.team_id = m.team_id GROUP BY m.user_id
                ON CONFLICT (user_id) DO NOTHING;
                ALTER TABLE public.projects ALTER COLUMN team_id DROP DEFAULT;
                """);

            migrationBuilder.CreateIndex(
                name: "IX_projects_team_id",
                schema: "public",
                table: "projects",
                column: "team_id");

            migrationBuilder.AddForeignKey(
                name: "FK_projects_teams_team_id",
                schema: "public",
                table: "projects",
                column: "team_id",
                principalSchema: "public",
                principalTable: "teams",
                principalColumn: "id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_projects_teams_team_id",
                schema: "public",
                table: "projects");

            migrationBuilder.DropIndex(
                name: "IX_projects_team_id",
                schema: "public",
                table: "projects");

            migrationBuilder.DropColumn(
                name: "team_id",
                schema: "public",
                table: "projects");
        }
    }
}
