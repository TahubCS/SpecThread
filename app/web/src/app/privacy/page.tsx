import type { Metadata } from "next";
import { PolicyPage } from "@/components/policy-page";

export const metadata: Metadata = { title: "Privacy" };

/** Renders the public privacy page. The telemetry section reflects ADR-055. */
export default function PrivacyPage() {
  return (
    <PolicyPage title="Privacy" description="Privacy information for SpecThread users.">
      <section className="policy-section" aria-labelledby="privacy-telemetry">
        <h2 id="privacy-telemetry">Operational telemetry</h2>
        <p>
          To keep SpecThread working, the web app and API record technical information about each
          request: which page or API route was used, how long it took, whether it failed, and the
          database queries it ran, without the values in them. Each record includes your account ID,
          a random identifier rather than your name or email address, and for requests to the web
          app, your IP address. Passwords, tokens, email addresses, and what you type or upload are
          not recorded.
        </p>
        <p>
          This information is sent to Grafana Labs, which stores it for us for about 14 days and then
          deletes it. The SpecThread team uses it to find errors and slow pages, and to investigate
          misuse such as repeated failed sign-ins or automated scraping.
        </p>
      </section>
    </PolicyPage>
  );
}
