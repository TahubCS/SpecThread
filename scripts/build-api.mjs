import { execFileSync } from "node:child_process";

export default function buildApi() {
  execFileSync("dotnet", ["build", "app/api", "--configuration", "Release"], { stdio: "inherit" });
}

