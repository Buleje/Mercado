"use client";

import dynamic from "next/dynamic";
import { Package, Briefcase, Users, PenTool, Truck, Home, Lock, TreePine, DollarSign, Scale, FileText } from "@buleje/design-system/icons";
import { useState, useRef, useEffect } from "react";

export const ContratosChart = dynamic(() => import("../ContratosChart"), {
  ssr: false,
  loading: () => <div className="h-64 animate-pulse bg-[var(--color-muted)] rounded-xl" />,
});

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  Package, Briefcase, Users, PenTool, Truck, Home, Lock, TreePine, DollarSign, Scale,
};

export function TemplateIcon({ icon, className }: { icon: string; className?: string }) {
  const Icon = ICON_MAP[icon] || FileText;
  return <Icon className={className} />;
}

// ── LegalTooltip Component ──────────────────────────────────────────────

export function LegalTooltip({ term, explanation, example }: { term: string; explanation: string; example: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <span ref={ref} className="relative inline-flex items-center">
      <button
        onClick={() => setOpen(!open)}
        className="ml-1 w-5 h-5 rounded-full bg-primary/10 dark:bg-[var(--data-success-500)]/12 text-[var(--data-success-700)] dark:text-[var(--data-success-500)] dark:text-[var(--data-success-500)] text-xs flex items-center justify-center hover:bg-primary/10 transition-colors"
        title="¿Qué significa esto?"
        aria-expanded={open}
        aria-haspopup="true"
      >?</button>
      {open && (
        <div className="absolute bottom-7 left-0 z-50 w-72 bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-xl p-3 text-xs shadow-[var(--shadow-lg)]">
          <p className="font-bold text-[var(--text-primary)] mb-1">{term}</p>
          <p className="text-[var(--text-secondary)] mb-2">{explanation}</p>
          <div className="bg-[var(--data-warning-50)] dark:bg-[var(--data-warning-500)]/20 rounded-lg p-2">
            <p className="text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)]"><strong>Ejemplo:</strong> {example}</p>
          </div>
        </div>
      )}
    </span>
  );
}

// ── Main Component ──────────────────────────────────────────────────────
