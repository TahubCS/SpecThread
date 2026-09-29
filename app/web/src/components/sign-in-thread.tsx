"use client";

import { useEffect, useState } from "react";
import { usePrefersReducedMotion } from "./landing-page";

type Phase = "scattered" | "gathered" | "accepted";

type Artifact = { kicker: string; title: string; meta: string; date: string; scattered: [number, number, number]; color?: string };

const ARTIFACTS: Artifact[] = [
  { kicker: "Requirement", title: "REQ-103", meta: "Lock accounts after five failed logins", date: "Sep 02", scattered: [180, 10, -6], color: "var(--accent)" },
  { kicker: "GitHub issue", title: "#224", meta: "Linked to REQ-103", date: "Sep 03", scattered: [340, 80, 5] },
  { kicker: "Pull request", title: "#56", meta: "Merged into main", date: "Sep 09", scattered: [10, 160, -3] },
  { kicker: "Commits", title: "4 commits", meta: "a3f9c12 · 7be01d4 …", date: "Sep 09", scattered: [310, 230, 7] },
  { kicker: "Checks", title: "9/9 passed", meta: "auth-e2e · unit", date: "Sep 10", scattered: [50, 330, 4], color: "var(--ok)" },
  { kicker: "Release", title: "v1.5.0-rc", meta: "Deployed to staging", date: "Sep 12", scattered: [330, 400, -6] },
];

/** Each phase and how long to wait before moving to it, looping forever. */
const SEQUENCE: [Phase, number][] = [["gathered", 700], ["accepted", 2600], ["scattered", 3400]];

/** Loops scattered → gathered → accepted; holds at accepted when the visitor prefers reduced motion. */
function usePhase() {
  const reduced = usePrefersReducedMotion();
  const [phase, setPhase] = useState<Phase>("scattered");
  useEffect(() => {
    if (reduced) return;
    let index = 0;
    let timer: number;
    const next = () => {
      const [target, delay] = SEQUENCE[index];
      timer = window.setTimeout(() => {
        setPhase(target);
        index = (index + 1) % SEQUENCE.length;
        next();
      }, delay);
    };
    next();
    return () => window.clearTimeout(timer);
  }, [reduced]);
  return reduced ? "accepted" : phase;
}

/** Decorative panel beside the sign-in form: scattered evidence gathers into one accepted thread. */
export function SignInThread() {
  const phase = usePhase();
  const gathered = phase !== "scattered";
  const status = phase === "accepted" ? "Accepted" : gathered ? "Evidence complete" : "Collecting evidence";
  const statusColor = phase === "accepted" ? "var(--ok)" : gathered ? "var(--accent)" : "var(--warn)";

  const cards = [
    ...ARTIFACTS.map((artifact, index) => {
      const [x, y, rotation] = gathered ? [28, index * 78, 0] : artifact.scattered;
      return {
        ...artifact, opacity: gathered ? 1 : 0.55,
        transform: `translate(${x}px,${y}px) rotate(${rotation}deg)`,
        delay: gathered ? index * 100 : (5 - index) * 40,
      };
    }),
    {
      kicker: "Board", title: "Moved to Done", meta: "Status only", date: "", color: "var(--muted)", opacity: gathered ? 0 : 0.55,
      transform: gathered ? "translate(190px,220px) rotate(-12deg) scale(.9)" : "translate(170px,260px) rotate(-4deg)", delay: 0,
    },
  ];

  return (
    <div className="signin-thread" aria-hidden="true" data-phase={phase}>
      <div className="signin-thread-head">
        <span className="signin-thread-label">REQ-103 · EVIDENCE THREAD</span>
        <span className="signin-thread-status" style={{ color: statusColor }}>
          <span className="landing-dot" style={{ background: statusColor }} />{status}
        </span>
      </div>
      <div className="signin-thread-stage">
        <div className="signin-thread-line" style={{ transform: gathered ? "scaleY(1)" : "scaleY(0)" }} />
        {cards.map(card => (
          <div key={card.kicker + card.title} className="signin-thread-card"
            style={{ transform: card.transform, opacity: card.opacity, transitionDelay: `${card.delay}ms` }}>
            {card.date && <span className="signin-thread-node" style={{ opacity: gathered ? 1 : 0 }} />}
            <div className="landing-thread-box">
              <div className="landing-thread-kicker">{card.kicker}</div>
              <div className="landing-thread-title" style={{ color: card.color ?? "var(--fg)" }}>{card.title}</div>
              <div className="landing-thread-meta">{card.meta}</div>
            </div>
            <div className="signin-thread-date" style={{ opacity: gathered ? 1 : 0 }}>{card.date}</div>
          </div>
        ))}
        <div className="signin-thread-record" style={{ height: phase === "accepted" ? 40 : 0 }}>
          <div><span className="landing-dot" style={{ background: "var(--ok)" }} />Accepted by Maya Ruiz</div>
        </div>
      </div>
      <div className="signin-thread-tagline">Every requirement, traced to the evidence behind it.</div>
    </div>
  );
}
