using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SpecThread.Api.Migrations
{
    /// <inheritdoc />
    public partial class InitialSchema : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.EnsureSchema(
                name: "public");

            migrationBuilder.CreateTable(
                name: "jwks",
                schema: "public",
                columns: table => new
                {
                    id = table.Column<string>(type: "text", nullable: false),
                    publicKey = table.Column<string>(type: "text", nullable: false),
                    privateKey = table.Column<string>(type: "text", nullable: false),
                    createdAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    expiresAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    alg = table.Column<string>(type: "text", nullable: true),
                    crv = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_jwks", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "user",
                schema: "public",
                columns: table => new
                {
                    id = table.Column<string>(type: "text", nullable: false),
                    name = table.Column<string>(type: "text", nullable: false),
                    email = table.Column<string>(type: "text", nullable: false),
                    emailVerified = table.Column<bool>(type: "boolean", nullable: false, defaultValue: false),
                    image = table.Column<string>(type: "text", nullable: true),
                    createdAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    updatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_user", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "verification",
                schema: "public",
                columns: table => new
                {
                    id = table.Column<string>(type: "text", nullable: false),
                    identifier = table.Column<string>(type: "text", nullable: false),
                    value = table.Column<string>(type: "text", nullable: false),
                    expiresAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    createdAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    updatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_verification", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "account",
                schema: "public",
                columns: table => new
                {
                    id = table.Column<string>(type: "text", nullable: false),
                    accountId = table.Column<string>(type: "text", nullable: false),
                    providerId = table.Column<string>(type: "text", nullable: false),
                    userId = table.Column<string>(type: "text", nullable: false),
                    accessToken = table.Column<string>(type: "text", nullable: true),
                    refreshToken = table.Column<string>(type: "text", nullable: true),
                    idToken = table.Column<string>(type: "text", nullable: true),
                    accessTokenExpiresAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    refreshTokenExpiresAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    scope = table.Column<string>(type: "text", nullable: true),
                    password = table.Column<string>(type: "text", nullable: true),
                    createdAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    updatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_account", x => x.id);
                    table.ForeignKey(
                        name: "FK_account_user_userId",
                        column: x => x.userId,
                        principalSchema: "public",
                        principalTable: "user",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "projects",
                schema: "public",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "gen_random_uuid()"),
                    name = table.Column<string>(type: "text", nullable: false),
                    owner_user_id = table.Column<string>(type: "text", nullable: false),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()"),
                    archived_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_projects", x => x.id);
                    table.CheckConstraint("ck_projects_name", "length(btrim(name)) > 0");
                    table.ForeignKey(
                        name: "FK_projects_user_owner_user_id",
                        column: x => x.owner_user_id,
                        principalSchema: "public",
                        principalTable: "user",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "session",
                schema: "public",
                columns: table => new
                {
                    id = table.Column<string>(type: "text", nullable: false),
                    userId = table.Column<string>(type: "text", nullable: false),
                    token = table.Column<string>(type: "text", nullable: false),
                    expiresAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    ipAddress = table.Column<string>(type: "text", nullable: true),
                    userAgent = table.Column<string>(type: "text", nullable: true),
                    createdAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    updatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_session", x => x.id);
                    table.ForeignKey(
                        name: "FK_session_user_userId",
                        column: x => x.userId,
                        principalSchema: "public",
                        principalTable: "user",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "project_members",
                schema: "public",
                columns: table => new
                {
                    project_id = table.Column<Guid>(type: "uuid", nullable: false),
                    user_id = table.Column<string>(type: "text", nullable: false),
                    joined_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_project_members", x => new { x.project_id, x.user_id });
                    table.ForeignKey(
                        name: "FK_project_members_projects_project_id",
                        column: x => x.project_id,
                        principalSchema: "public",
                        principalTable: "projects",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_project_members_user_user_id",
                        column: x => x.user_id,
                        principalSchema: "public",
                        principalTable: "user",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "requirements",
                schema: "public",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "gen_random_uuid()"),
                    project_id = table.Column<Guid>(type: "uuid", nullable: false),
                    title = table.Column<string>(type: "text", nullable: false),
                    description = table.Column<string>(type: "text", nullable: false),
                    created_by = table.Column<string>(type: "text", nullable: false),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()"),
                    updated_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()"),
                    archived_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    version = table.Column<int>(type: "integer", nullable: false, defaultValue: 1)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_requirements", x => x.id);
                    table.CheckConstraint("ck_requirements_title", "length(btrim(title)) > 0");
                    table.CheckConstraint("ck_requirements_version", "version > 0");
                    table.ForeignKey(
                        name: "FK_requirements_projects_project_id",
                        column: x => x.project_id,
                        principalSchema: "public",
                        principalTable: "projects",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_requirements_user_created_by",
                        column: x => x.created_by,
                        principalSchema: "public",
                        principalTable: "user",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "acceptance_criteria",
                schema: "public",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "gen_random_uuid()"),
                    requirement_id = table.Column<Guid>(type: "uuid", nullable: false),
                    text = table.Column<string>(type: "text", nullable: false),
                    position = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_acceptance_criteria", x => x.id);
                    table.CheckConstraint("ck_criteria_position", "position >= 0");
                    table.CheckConstraint("ck_criteria_text", "length(btrim(text)) > 0");
                    table.ForeignKey(
                        name: "FK_acceptance_criteria_requirements_requirement_id",
                        column: x => x.requirement_id,
                        principalSchema: "public",
                        principalTable: "requirements",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_acceptance_criteria_requirement_id_position",
                schema: "public",
                table: "acceptance_criteria",
                columns: new[] { "requirement_id", "position" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_account_providerId_accountId",
                schema: "public",
                table: "account",
                columns: new[] { "providerId", "accountId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_account_userId",
                schema: "public",
                table: "account",
                column: "userId");

            migrationBuilder.CreateIndex(
                name: "IX_project_members_user_id",
                schema: "public",
                table: "project_members",
                column: "user_id");

            migrationBuilder.CreateIndex(
                name: "IX_projects_owner_user_id",
                schema: "public",
                table: "projects",
                column: "owner_user_id");

            migrationBuilder.CreateIndex(
                name: "IX_requirements_created_by",
                schema: "public",
                table: "requirements",
                column: "created_by");

            migrationBuilder.CreateIndex(
                name: "IX_requirements_project_id",
                schema: "public",
                table: "requirements",
                column: "project_id");

            migrationBuilder.CreateIndex(
                name: "IX_session_token",
                schema: "public",
                table: "session",
                column: "token",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_session_userId",
                schema: "public",
                table: "session",
                column: "userId");

            migrationBuilder.CreateIndex(
                name: "IX_user_email",
                schema: "public",
                table: "user",
                column: "email",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_verification_identifier",
                schema: "public",
                table: "verification",
                column: "identifier");
            migrationBuilder.Sql("""
                ALTER TABLE public."user" ENABLE ROW LEVEL SECURITY;
                REVOKE ALL ON TABLE public."user" FROM PUBLIC;
                ALTER TABLE public."session" ENABLE ROW LEVEL SECURITY;
                REVOKE ALL ON TABLE public."session" FROM PUBLIC;
                ALTER TABLE public."account" ENABLE ROW LEVEL SECURITY;
                REVOKE ALL ON TABLE public."account" FROM PUBLIC;
                ALTER TABLE public."verification" ENABLE ROW LEVEL SECURITY;
                REVOKE ALL ON TABLE public."verification" FROM PUBLIC;
                ALTER TABLE public."jwks" ENABLE ROW LEVEL SECURITY;
                REVOKE ALL ON TABLE public."jwks" FROM PUBLIC;
                ALTER TABLE public."projects" ENABLE ROW LEVEL SECURITY;
                REVOKE ALL ON TABLE public."projects" FROM PUBLIC;
                ALTER TABLE public."project_members" ENABLE ROW LEVEL SECURITY;
                REVOKE ALL ON TABLE public."project_members" FROM PUBLIC;
                ALTER TABLE public."requirements" ENABLE ROW LEVEL SECURITY;
                REVOKE ALL ON TABLE public."requirements" FROM PUBLIC;
                ALTER TABLE public."acceptance_criteria" ENABLE ROW LEVEL SECURITY;
                REVOKE ALL ON TABLE public."acceptance_criteria" FROM PUBLIC;
                DO $security$
                BEGIN
                  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
                    REVOKE ALL ON TABLE public."user", public."session", public."account", public."verification", public."jwks", public."projects", public."project_members", public."requirements", public."acceptance_criteria" FROM anon;
                  END IF;
                  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
                    REVOKE ALL ON TABLE public."user", public."session", public."account", public."verification", public."jwks", public."projects", public."project_members", public."requirements", public."acceptance_criteria" FROM authenticated;
                  END IF;
                END $security$;
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "acceptance_criteria",
                schema: "public");

            migrationBuilder.DropTable(
                name: "account",
                schema: "public");

            migrationBuilder.DropTable(
                name: "jwks",
                schema: "public");

            migrationBuilder.DropTable(
                name: "project_members",
                schema: "public");

            migrationBuilder.DropTable(
                name: "session",
                schema: "public");

            migrationBuilder.DropTable(
                name: "verification",
                schema: "public");

            migrationBuilder.DropTable(
                name: "requirements",
                schema: "public");

            migrationBuilder.DropTable(
                name: "projects",
                schema: "public");

            migrationBuilder.DropTable(
                name: "user",
                schema: "public");
        }
    }
}
