import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

type Target = { datasource?: { type?: string }; expr?: string; query?: string };
type Panel = { type: string; title: string; targets?: Target[] };

const dashboard = JSON.parse(readFileSync("observability/service-health.json", "utf8")) as {
  uid: string;
  panels: Panel[];
};
const observabilityDoc = readFileSync("docs/OBSERVABILITY.md", "utf8");
const queriesDoc = readFileSync("observability/queries.md", "utf8");
const targets = dashboard.panels.flatMap((panel) => (panel.targets ?? []).map((target) => ({ panel, target })));

test("every service-health query is limited to production, except uptime checks", () => {
  expect(dashboard.uid).toBe("specthread-service-health");
  expect(targets.length).toBeGreaterThan(20);
  for (const { panel, target } of targets) {
    if (target.datasource?.type === "tempo") {
      expect(target.query, panel.title).toContain('resource.deployment.environment.name = "production"');
    } else if (!target.expr?.includes("probe_success")) {
      // A metric whose selector lacks the filter mixes in load-test or preview data.
      for (const selector of target.expr?.match(/[a-z_]+\{[^}]*\}/g) ?? []) {
        expect(selector, panel.title).toContain('deployment_environment_name="production"');
      }
    }
  }
});

test("API request panels leave out health checks, and every uptime check they read is documented", () => {
  for (const { panel, target } of targets) {
    for (const selector of target.expr?.match(/http_server_request_duration_seconds_[a-z]+\{[^}]*\}/g) ?? []) {
      expect(selector, panel.title).toContain('http_route!~"/health.*"');
    }
    for (const [, job] of target.expr?.matchAll(/probe_success\{job="([^"]+)"\}/g) ?? []) {
      expect(observabilityDoc, `uptime check ${job}`).toContain(`\`${job}\``);
    }
  }
  for (const panel of dashboard.panels.filter((panel) => panel.type !== "row")) {
    expect(queriesDoc, `queries.md section for ${panel.title}`).toContain(`### ${panel.title}`);
  }
});
