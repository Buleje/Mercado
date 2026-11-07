'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp } from "@buleje/design-system/icons";

// ── Accordion Section ──────────────────────────────────────────────────────

export default function Section({ title, defaultOpen, children }: { title: string; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen ?? false);
  return (
    <div className="border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 bg-[var(--surface-sunken)] text-sm font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)] hover:bg-[var(--rule-soft)] transition-colors"
      >
        {title}
        {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>
      {open && <div className="p-4 space-y-3">{children}</div>}
    </div>
  );
}
