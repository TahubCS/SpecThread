import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: { default: "SpecThread", template: "%s | SpecThread" },
  description: "Trace requirements to implementation evidence and human review.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <a className="skip-link" href="#main-content">Skip to content</a>
        <header className="site-header">
          <div className="header-inner">
            <Link className="brand" href="/">SpecThread</Link>
            <nav aria-label="Main navigation">
              <Link href="/dashboard">Dashboard preview (:</Link>
              <Link href="/teams">Teams</Link>
              <Link href="/projects">Projects</Link>
              <Link href="/reviews">Reviews</Link>
              <Link href="/login">Log in</Link>
              <Link href="/signup">Sign up</Link>
            </nav>
          </div>
        </header>
        <main id="main-content" tabIndex={-1}>{children}</main>
        <footer>
          SpecThread · Requirements, evidence, and human review. <Link href="/about">About</Link>
        </footer>
      </body>
    </html>
  );
}
