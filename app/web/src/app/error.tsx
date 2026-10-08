"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { authClient } from "@/lib/auth-client";
import { isPublicPath } from "@/lib/app-navigation";

/**
 * Renders a page error alert. "Try again" fetches the page's data again. When the error came
 * from a session that has ended, for example a form submitted after signing out elsewhere,
 * the visitor is sent to sign in and returns to the same page afterwards.
 */
export default function ErrorPage({ retry }: { retry: () => void }) {
  const router = useRouter();
  useEffect(() => {
    const { pathname, search } = window.location;
    if (isPublicPath(pathname)) return;
    let active = true;
    authClient.getSession().then(result => {
      if (active && !result.error && !result.data?.session) {
        router.replace(`/login?next=${encodeURIComponent(`${pathname}${search}`)}`);
      }
    }).catch(() => { /* The session service is unreachable too; the error page already says so. */ });
    return () => { active = false; };
  }, [router]);

  return (
    <section className="scaffold-page" role="alert" aria-labelledby="error-title">
      <header className="scaffold-heading">
        <h1 id="error-title">Page unavailable</h1>
        <p>Something went wrong while opening this page.</p>
      </header>
      <div className="scaffold-navigation">
        <button className="button" onClick={() => retry()} type="button">Try again</button>
      </div>
    </section>
  );
}
