import { spawn } from "node:child_process";

// Starts the Release API build on a dedicated port with the given environment.
// Build it first (Playwright globalSetup runs scripts/build-api.mjs).
export async function startApi(port: number, env: Record<string, string>) {
  const baseURL = `http://127.0.0.1:${port}`;
  const child = spawn("dotnet", [
    "app/api/bin/Release/net10.0/SpecThread.Api.dll", "--urls", baseURL, "--environment", "Development",
  ], { env: { ...process.env, ConnectionStrings__Database: "", Auth__Issuer: "", ...env }, stdio: "ignore" });
  const stop = () => { child.kill(); };
  try {
    for (let attempt = 0; ; attempt++) {
      if (child.exitCode !== null) throw new Error(`API exited with code ${child.exitCode}`);
      try {
        if ((await fetch(`${baseURL}/health`)).ok) break;
      } catch (error) {
        if (attempt === 119) throw error;
      }
      await new Promise(resolve => setTimeout(resolve, 250));
    }
  } catch (error) {
    stop();
    throw error;
  }
  return { baseURL, stop };
}
