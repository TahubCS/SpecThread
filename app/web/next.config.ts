import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * Baseline protections for every response: no framing by other sites, no MIME sniffing, and
   * only the origin in cross-site referrers. Pages may still set a stricter referrer policy.
   */
  async headers() {
    return [{
      source: "/:path*",
      headers: [
        { key: "X-Frame-Options", value: "DENY" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      ],
    }];
  },
  /** The About pages became landing sections and public policy pages (ADR-022). */
  async redirects() {
    return [
      { source: "/about", destination: "/#about", permanent: false },
      { source: "/about/how-it-works", destination: "/#how", permanent: false },
      { source: "/about/privacy", destination: "/privacy", permanent: false },
      { source: "/about/terms", destination: "/terms", permanent: false },
    ];
  },
};

export default nextConfig;
