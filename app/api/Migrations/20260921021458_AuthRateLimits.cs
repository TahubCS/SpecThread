using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SpecThread.Api.Migrations
{
    /// <inheritdoc />
    public partial class AuthRateLimits : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "rateLimit",
                schema: "public",
                columns: table => new
                {
                    id = table.Column<string>(type: "text", nullable: false),
                    key = table.Column<string>(type: "text", nullable: false),
                    count = table.Column<int>(type: "integer", nullable: false),
                    lastRequest = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_rateLimit", x => x.id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_rateLimit_key",
                schema: "public",
                table: "rateLimit",
                column: "key",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_rateLimit_lastRequest",
                schema: "public",
                table: "rateLimit",
                column: "lastRequest");
            migrationBuilder.Sql("""
                ALTER TABLE public."rateLimit" ENABLE ROW LEVEL SECURITY;
                REVOKE ALL ON TABLE public."rateLimit" FROM PUBLIC;
                DO $security$
                BEGIN
                  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
                    REVOKE ALL ON TABLE public."rateLimit" FROM anon;
                  END IF;
                  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
                    REVOKE ALL ON TABLE public."rateLimit" FROM authenticated;
                  END IF;
                END $security$;
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "rateLimit",
                schema: "public");
        }
    }
}
