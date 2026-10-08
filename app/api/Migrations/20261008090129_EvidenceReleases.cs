using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SpecThread.Api.Migrations
{
    /// <inheritdoc />
    public partial class EvidenceReleases : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "ck_requirement_evidence_identity",
                schema: "public",
                table: "requirement_evidence");

            migrationBuilder.DropCheckConstraint(
                name: "ck_requirement_evidence_kind",
                schema: "public",
                table: "requirement_evidence");

            migrationBuilder.AddColumn<string>(
                name: "contains",
                schema: "public",
                table: "requirement_evidence",
                type: "jsonb",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "merge_sha",
                schema: "public",
                table: "requirement_evidence",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "prerelease",
                schema: "public",
                table: "requirement_evidence",
                type: "boolean",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "tag",
                schema: "public",
                table: "requirement_evidence",
                type: "text",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_requirement_evidence_requirement_id_repository_id_tag",
                schema: "public",
                table: "requirement_evidence",
                columns: new[] { "requirement_id", "repository_id", "tag" },
                unique: true,
                filter: "kind = 'release'");

            migrationBuilder.AddCheckConstraint(
                name: "ck_requirement_evidence_identity",
                schema: "public",
                table: "requirement_evidence",
                sql: "(kind = 'commit' AND sha IS NOT NULL AND sha ~ '^[0-9a-f]{40}$' AND number IS NULL AND state IS NULL AND tag IS NULL) OR (kind IN ('issue', 'pull_request') AND number IS NOT NULL AND number > 0 AND state IS NOT NULL AND tag IS NULL) OR (kind = 'release' AND tag IS NOT NULL AND length(btrim(tag)) > 0 AND number IS NULL AND state IS NULL)");

            migrationBuilder.AddCheckConstraint(
                name: "ck_requirement_evidence_kind",
                schema: "public",
                table: "requirement_evidence",
                sql: "kind IN ('issue', 'pull_request', 'commit', 'release')");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("DELETE FROM public.requirement_evidence WHERE kind = 'release';");

            migrationBuilder.DropIndex(
                name: "IX_requirement_evidence_requirement_id_repository_id_tag",
                schema: "public",
                table: "requirement_evidence");

            migrationBuilder.DropCheckConstraint(
                name: "ck_requirement_evidence_identity",
                schema: "public",
                table: "requirement_evidence");

            migrationBuilder.DropCheckConstraint(
                name: "ck_requirement_evidence_kind",
                schema: "public",
                table: "requirement_evidence");

            migrationBuilder.DropColumn(
                name: "contains",
                schema: "public",
                table: "requirement_evidence");

            migrationBuilder.DropColumn(
                name: "merge_sha",
                schema: "public",
                table: "requirement_evidence");

            migrationBuilder.DropColumn(
                name: "prerelease",
                schema: "public",
                table: "requirement_evidence");

            migrationBuilder.DropColumn(
                name: "tag",
                schema: "public",
                table: "requirement_evidence");

            migrationBuilder.AddCheckConstraint(
                name: "ck_requirement_evidence_identity",
                schema: "public",
                table: "requirement_evidence",
                sql: "(kind = 'commit' AND sha IS NOT NULL AND sha ~ '^[0-9a-f]{40}$' AND number IS NULL AND state IS NULL) OR (kind <> 'commit' AND number IS NOT NULL AND number > 0 AND state IS NOT NULL)");

            migrationBuilder.AddCheckConstraint(
                name: "ck_requirement_evidence_kind",
                schema: "public",
                table: "requirement_evidence",
                sql: "kind IN ('issue', 'pull_request', 'commit')");
        }
    }
}
