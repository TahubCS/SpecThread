using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SpecThread.Api.Migrations
{
    /// <inheritdoc />
    public partial class TeamInvitations : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "team_invitations",
                schema: "public",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "gen_random_uuid()"),
                    team_id = table.Column<Guid>(type: "uuid", nullable: false),
                    email = table.Column<string>(type: "character varying(254)", maxLength: 254, nullable: false),
                    role = table.Column<string>(type: "text", nullable: false),
                    invited_by = table.Column<string>(type: "text", nullable: false),
                    token_hash = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    issued_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    expires_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    accepted_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    accepted_by = table.Column<string>(type: "text", nullable: true),
                    revoked_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_team_invitations", x => x.id);
                    table.CheckConstraint("ck_team_invitations_expiry", "expires_at > issued_at");
                    table.CheckConstraint("ck_team_invitations_resolution", "accepted_at IS NULL OR revoked_at IS NULL");
                    table.CheckConstraint("ck_team_invitations_role", "role IN ('admin', 'member')");
                    table.ForeignKey(
                        name: "FK_team_invitations_teams_team_id",
                        column: x => x.team_id,
                        principalSchema: "public",
                        principalTable: "teams",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_team_invitations_user_accepted_by",
                        column: x => x.accepted_by,
                        principalSchema: "public",
                        principalTable: "user",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_team_invitations_user_invited_by",
                        column: x => x.invited_by,
                        principalSchema: "public",
                        principalTable: "user",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_team_invitations_accepted_by",
                schema: "public",
                table: "team_invitations",
                column: "accepted_by");

            migrationBuilder.CreateIndex(
                name: "IX_team_invitations_invited_by",
                schema: "public",
                table: "team_invitations",
                column: "invited_by");

            migrationBuilder.CreateIndex(
                name: "IX_team_invitations_team_id_email",
                schema: "public",
                table: "team_invitations",
                columns: new[] { "team_id", "email" },
                unique: true,
                filter: "accepted_at IS NULL AND revoked_at IS NULL");

            migrationBuilder.CreateIndex(
                name: "IX_team_invitations_token_hash",
                schema: "public",
                table: "team_invitations",
                column: "token_hash",
                unique: true);
            migrationBuilder.Sql("""
                ALTER TABLE public.team_invitations ENABLE ROW LEVEL SECURITY;
                REVOKE ALL ON TABLE public.team_invitations FROM PUBLIC;
                DO $security$
                BEGIN
                  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
                    REVOKE ALL ON TABLE public.team_invitations FROM anon;
                  END IF;
                  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
                    REVOKE ALL ON TABLE public.team_invitations FROM authenticated;
                  END IF;
                END $security$;
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "team_invitations",
                schema: "public");
        }
    }
}
