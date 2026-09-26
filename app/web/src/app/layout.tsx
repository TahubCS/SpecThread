import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AppFrame } from "@/components/app-frame";
import "./globals.css";
import "./app-shell.css";
import "./landing.css";

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

/** Wraps pages in the shared app frame with global fonts and a skip-to-content link. */
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <a className="skip-link" href="#main-content">Skip to content</a>
        <AppFrame>{children}</AppFrame>
      </body>
    </html>
  );
}
