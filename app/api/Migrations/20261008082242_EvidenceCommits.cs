using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SpecThread.Api.Migrations
{
    /// <inheritdoc />
    public partial class EvidenceCommits : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "ck_requirement_evidence_kind",
                schema: "public",
                table: "requirement_evidence");

            migrationBuilder.DropCheckConstraint(
                name: "ck_requirement_evidence_number",
                schema: "public",
                table: "requirement_evidence");

            migrationBuilder.DropCheckConstraint(
                name: "ck_requirement_evidence_state",
                schema: "public",
                table: "requirement_evidence");

            migrationBuilder.AlterColumn<string>(
                name: "state",
                schema: "public",
                table: "requirement_evidence",
                type: "text",
                nullable: true,
                oldClrType: typeof(string),
                oldType: "text");

            migrationBuilder.AlterColumn<int>(
                name: "number",
                schema: "public",
                table: "requirement_evidence",
                type: "integer",
                nullable: true,
                oldClrType: typeof(int),
                oldType: "integer");

            migrationBuilder.AddColumn<int>(
                name: "additions",
                schema: "public",
                table: "requirement_evidence",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "changed_files",
                schema: "public",
                table: "requirement_evidence",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "commit_count",
                schema: "public",
                table: "requirement_evidence",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "commits",
                schema: "public",
                table: "requirement_evidence",
                type: "jsonb",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "deletions",
                schema: "public",
                table: "requirement_evidence",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "sha",
                schema: "public",
                table: "requirement_evidence",
                type: "text",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_requirement_evidence_requirement_id_repository_id_sha",
                schema: "public",
                table: "requirement_evidence",
                columns: new[] { "requirement_id", "repository_id", "sha" },
                unique: true,
                filter: "kind = 'commit'");

            migrationBuilder.AddCheckConstraint(
                name: "ck_requirement_evidence_changes",
                schema: "public",
                table: "requirement_evidence",
                sql: "COALESCE(additions, 0) >= 0 AND COALESCE(deletions, 0) >= 0 AND COALESCE(changed_files, 0) >= 0 AND COALESCE(commit_count, 0) >= 0");

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

            migrationBuilder.AddCheckConstraint(
                name: "ck_requirement_evidence_repository",
                schema: "public",
                table: "requirement_evidence",
                sql: "repository_id > 0");

            migrationBuilder.AddCheckConstraint(
                name: "ck_requirement_evidence_state",
                schema: "public",
                table: "requirement_evidence",
                sql: "state IS NULL OR state IN ('open', 'closed', 'merged')");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("DELETE FROM public.requirement_evidence WHERE kind = 'commit';");

            migrationBuilder.DropIndex(
                name: "IX_requirement_evidence_requirement_id_repository_id_sha",
                schema: "public",
                table: "requirement_evidence");

            migrationBuilder.DropCheckConstraint(
                name: "ck_requirement_evidence_changes",
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

            migrationBuilder.DropCheckConstraint(
                name: "ck_requirement_evidence_repository",
                schema: "public",
                table: "requirement_evidence");

            migrationBuilder.DropCheckConstraint(
                name: "ck_requirement_evidence_state",
                schema: "public",
                table: "requirement_evidence");

            migrationBuilder.DropColumn(
                name: "additions",
                schema: "public",
                table: "requirement_evidence");

            migrationBuilder.DropColumn(
                name: "changed_files",
                schema: "public",
                table: "requirement_evidence");

            migrationBuilder.DropColumn(
                name: "commit_count",
                schema: "public",
                table: "requirement_evidence");

            migrationBuilder.DropColumn(
                name: "commits",
                schema: "public",
                table: "requirement_evidence");

            migrationBuilder.DropColumn(
                name: "deletions",
                schema: "public",
                table: "requirement_evidence");

            migrationBuilder.DropColumn(
                name: "sha",
                schema: "public",
                table: "requirement_evidence");

            migrationBuilder.AlterColumn<string>(
                name: "state",
                schema: "public",
                table: "requirement_evidence",
                type: "text",
                nullable: false,
                defaultValue: "",
                oldClrType: typeof(string),
                oldType: "text",
                oldNullable: true);

            migrationBuilder.AlterColumn<int>(
                name: "number",
                schema: "public",
                table: "requirement_evidence",
                type: "integer",
                nullable: false,
                defaultValue: 0,
                oldClrType: typeof(int),
                oldType: "integer",
                oldNullable: true);

            migrationBuilder.AddCheckConstraint(
                name: "ck_requirement_evidence_kind",
                schema: "public",
                table: "requirement_evidence",
                sql: "kind IN ('issue', 'pull_request')");

            migrationBuilder.AddCheckConstraint(
                name: "ck_requirement_evidence_number",
                schema: "public",
                table: "requirement_evidence",
                sql: "number > 0 AND repository_id > 0");

            migrationBuilder.AddCheckConstraint(
                name: "ck_requirement_evidence_state",
                schema: "public",
                table: "requirement_evidence",
                sql: "state IN ('open', 'closed', 'merged')");
        }
    }
}
