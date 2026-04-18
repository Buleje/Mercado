"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { CorazonLatiendo } from "@/components/ui-system/illustrations";

export default function CuponesEmpty() {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-canvas)] px-6 py-16 text-center">
      {/* Ilustración custom — corazón latiendo (anticipación) */}
      <div className="text-[var(--text-secondary)]" aria-hidden="true">
        <CorazonLatiendo size={180} />
      </div>

      <h3 className="mt-4 text-lg font-extrabold tracking-tight text-[var(--text-primary)] max-w-sm">
        Aún no tenés cupones
      </h3>
      <p className="mt-2 max-w-sm text-sm text-[var(--text-tertiary)] leading-relaxed">
        Aplicá un código que te hayan compartido o explorá el marketplace —
        encontrás cupones en la sección de cada tienda.
      </p>
      <Link
        href="/marketplace"
        className="mt-6 inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-[var(--text-primary)] px-5 py-2.5 text-sm font-semibold text-[var(--surface-canvas)] transition-opacity hover:opacity-90"
      >
        Ir al marketplace
        <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
      </Link>
    </div>
  );
}
