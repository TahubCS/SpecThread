using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SpecThread.Api.Migrations
{
    /// <inheritdoc />
    public partial class RequirementMilestone : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "milestone",
                schema: "public",
                table: "requirements",
                type: "character varying(100)",
                maxLength: 100,
                nullable: true);

            migrationBuilder.AddCheckConstraint(
                name: "ck_requirements_milestone",
                schema: "public",
                table: "requirements",
                sql: "milestone IS NULL OR (btrim(milestone) = milestone AND length(milestone) BETWEEN 1 AND 100)");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "ck_requirements_milestone",
                schema: "public",
                table: "requirements");

            migrationBuilder.DropColumn(
                name: "milestone",
                schema: "public",
                table: "requirements");
        }
    }
}
