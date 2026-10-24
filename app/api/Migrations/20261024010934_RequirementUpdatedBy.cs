using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SpecThread.Api.Migrations
{
    /// <inheritdoc />
    public partial class RequirementUpdatedBy : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "updated_by",
                schema: "public",
                table: "requirements",
                type: "text",
                nullable: true);

            migrationBuilder.Sql("""
                UPDATE public.requirements SET updated_by = created_by WHERE updated_by IS NULL;
                """);

            migrationBuilder.CreateIndex(
                name: "IX_requirements_updated_by",
                schema: "public",
                table: "requirements",
                column: "updated_by");

            migrationBuilder.AddForeignKey(
                name: "FK_requirements_user_updated_by",
                schema: "public",
                table: "requirements",
                column: "updated_by",
                principalSchema: "public",
                principalTable: "user",
                principalColumn: "id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_requirements_user_updated_by",
                schema: "public",
                table: "requirements");

            migrationBuilder.DropIndex(
                name: "IX_requirements_updated_by",
                schema: "public",
                table: "requirements");

            migrationBuilder.DropColumn(
                name: "updated_by",
                schema: "public",
                table: "requirements");
        }
    }
}
