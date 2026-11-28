"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { GLOSSARY, GLOSSARY_ORDER, type GlossaryTerm } from "@/lib/glossary";

/**
 * A technical word shown in place with its plain-language explanation one click or key press
 * away (US-17). The word is a button, so it works with the keyboard and screen readers; the
 * explanation opens below it and closes with Escape, another click, or a click elsewhere.
 */
export function Term({ name, children }: { name: GlossaryTerm; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const wrapper = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent ? event.key === "Escape" : !wrapper.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);
  return (
    <span className="term" ref={wrapper}>
      <button type="button" className="term-button" aria-expanded={open} aria-controls={id}
        aria-label={`${typeof children === "string" ? children : GLOSSARY[name].term}: what does this mean?`}
        onClick={() => setOpen(current => !current)}>
        {children}
      </button>
      {open && <span id={id} role="note" className="term-explanation"><strong>{GLOSSARY[name].term}:</strong> {GLOSSARY[name].text}</span>}
    </span>
  );
}

/** Every term a reviewer meets on a requirement, explained in plain language, folded away until asked for (US-17). */
export function Glossary() {
  return (
    <details className="glossary">
      <summary>What do these words mean?</summary>
      <dl aria-label="Plain-language explanations">
        {GLOSSARY_ORDER.map(name => (
          <div key={name}>
            <dt>{GLOSSARY[name].term}</dt>
            <dd>{GLOSSARY[name].text}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}
