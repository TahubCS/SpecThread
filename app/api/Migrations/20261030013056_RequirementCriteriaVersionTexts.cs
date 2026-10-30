using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SpecThread.Api.Migrations
{
    /// <inheritdoc />
    public partial class RequirementCriteriaVersionTexts : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "ck_requirement_criteria_versions_criteria",
                schema: "public",
                table: "requirement_criteria_versions");

            migrationBuilder.AddCheckConstraint(
                name: "ck_requirement_criteria_versions_criteria",
                schema: "public",
                table: "requirement_criteria_versions",
                sql: "jsonb_typeof(criteria) = 'array' AND NOT jsonb_path_exists(criteria, 'strict $[*] ? (@.type() != \"string\")')");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "ck_requirement_criteria_versions_criteria",
                schema: "public",
                table: "requirement_criteria_versions");

            migrationBuilder.AddCheckConstraint(
                name: "ck_requirement_criteria_versions_criteria",
                schema: "public",
                table: "requirement_criteria_versions",
                sql: "jsonb_typeof(criteria) = 'array'");
        }
    }
}
