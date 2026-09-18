import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { expect, test } from "@playwright/test";

const run = promisify(execFile);
const args = [
  "ef", "dbcontext", "info", "--project", "app/api",
  "--configuration", "Release", "--no-build", "--json",
];

test("EF initializes PostgreSQL without opening a connection", async () => {
  const { stdout } = await run("dotnet", args, {
    env: {
      ...process.env,
      DOTNET_ENVIRONMENT: "Production",
      ConnectionStrings__Database:
        "Host=127.0.0.1;Port=1;Database=foundation_verification;Username=placeholder;Password=placeholder",
    },
  });
  const context = JSON.parse(stdout);
  expect(context.providerName).toBe("Npgsql.EntityFrameworkCore.PostgreSQL");
  expect(context.databaseName).toBe("foundation_verification");
});

test("EF rejects database use without configuration", async () => {
  await expect(run("dotnet", args, {
    env: {
      ...process.env,
      DOTNET_ENVIRONMENT: "Production",
      ConnectionStrings__Database: "",
    },
  })).rejects.toMatchObject({
    code: 1,
    stdout: expect.stringContaining("Configure ConnectionStrings:Database"),
  });
});
