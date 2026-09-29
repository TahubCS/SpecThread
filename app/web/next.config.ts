import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
