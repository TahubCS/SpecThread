using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SpecThread.Api.Migrations
{
    /// <inheritdoc />
    public partial class EvidenceChecks : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "check_count",
                schema: "public",
                table: "requirement_evidence",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "checks",
                schema: "public",
                table: "requirement_evidence",
                type: "jsonb",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "checks_read_at",
                schema: "public",
                table: "requirement_evidence",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "source",
                schema: "public",
                table: "requirement_evidence",
                type: "text",
                nullable: false,
                defaultValue: "manual");

            migrationBuilder.AddCheckConstraint(
                name: "ck_requirement_evidence_checks",
                schema: "public",
                table: "requirement_evidence",
                sql: "COALESCE(check_count, 0) >= 0");

            migrationBuilder.AddCheckConstraint(
                name: "ck_requirement_evidence_source",
                schema: "public",
                table: "requirement_evidence",
                sql: "source IN ('manual', 'suggested')");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "ck_requirement_evidence_checks",
                schema: "public",
                table: "requirement_evidence");

            migrationBuilder.DropCheckConstraint(
                name: "ck_requirement_evidence_source",
                schema: "public",
                table: "requirement_evidence");

            migrationBuilder.DropColumn(
                name: "check_count",
                schema: "public",
                table: "requirement_evidence");

            migrationBuilder.DropColumn(
                name: "checks",
                schema: "public",
                table: "requirement_evidence");

            migrationBuilder.DropColumn(
                name: "checks_read_at",
                schema: "public",
                table: "requirement_evidence");

            migrationBuilder.DropColumn(
                name: "source",
                schema: "public",
                table: "requirement_evidence");
        }
    }
}
