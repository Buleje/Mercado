"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Users, ArrowRight } from "@buleje/design-system/icons";
import HomeSeccionTitulo from "@/components/marketplace/home/HomeSeccionTitulo";

type Junta = {
  code: string;
  zoneLabel: string;
  productLabel?: string;
  memberCount: number;
  targetMembers: number;
};

/**
 * JuntaBarrioStrip — rail del home con las juntas abiertas del barrio.
 * Self-fetch + se auto-oculta si no hay juntas (mismo patrón que QuickReorder/
 * TopToday). Cada tarjeta lleva a /junta/[code] para sumarse. Home «Dosel»
 * (2026-10-10): título único de la home y tarjeta con tinte teal.
 */
export default function JuntaBarrioStrip() {
  const [juntas, setJuntas] = useState<Junta[] | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/juntas")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (alive && Array.isArray(d?.juntas)) setJuntas(d.juntas);
      })
      .catch((err) => console.warn("[junta-strip] fetch falló", err));
    return () => {
      alive = false;
    };
  }, []);

  if (!juntas || juntas.length === 0) return null;

  return (
    <section
      aria-labelledby="juntas-titulo"
      className="mx-auto w-full max-w-[1760px] px-4 sm:px-6 lg:px-8"
    >
      <HomeSeccionTitulo
        id="juntas-titulo"
        titulo="Juntas abiertas en tu barrio"
        bajada="Compra en grupo con tus vecinos."
        accion={{ label: "Ver juntas", href: "/juntas" }}
      />
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {juntas.map((j) => {
          const remaining = Math.max(0, j.targetMembers - j.memberCount);
          const progress = Math.min(
            100,
            Math.round((j.memberCount / Math.max(1, j.targetMembers)) * 100),
          );
          return (
            <li key={j.code}>
              <Link
                href={`/junta/${j.code}`}
                data-familia="frescos"
                className="group relative isolate flex h-full flex-col rounded-[var(--radius-xl)] bg-[var(--tinte-bg)] p-4 outline-none transition-[transform,box-shadow] duration-[var(--dur-fast)] hover:-translate-y-0.5 hover:shadow-[var(--shadow-md)] focus-visible:ring-2 focus-visible:ring-[var(--accent)] motion-reduce:hover:translate-y-0"
              >
                <span className="patron-familia rounded-[inherit]" aria-hidden />
                <span className="relative flex items-center gap-3">
                  <span
                    aria-hidden
                    className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[var(--tinte-blob)] text-[var(--tinte-ink)]"
                  >
                    <Users className="h-5 w-5" strokeWidth={1.75} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-base font-bold text-[var(--text-primary)]">
                      {j.zoneLabel}
                    </span>
                    {j.productLabel && (
                      <span className="block truncate text-xs text-[var(--text-secondary)]">
                        {j.productLabel}
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 text-base font-extrabold tabular-nums text-[var(--tinte-ink)]">
                    {j.memberCount}/{j.targetMembers}
                  </span>
                </span>
                <span
                  aria-hidden
                  className="relative mt-3 block h-1.5 w-full overflow-clip rounded-full bg-[var(--surface-raised)]"
                >
                  <span
                    className="block h-full rounded-full bg-[var(--accent)] transition-[width] duration-[var(--dur-slow)]"
                    style={{ width: `${progress}%` }}
                  />
                </span>
                <span className="relative mt-2 inline-flex items-center gap-1 text-sm font-bold text-[var(--accent-ink)]">
                  {remaining > 0 ? `Faltan ${remaining} · únete` : "¡Completa!"}
                  <ArrowRight
                    className="h-4 w-4 transition-transform duration-[var(--dur-fast)] group-hover:translate-x-0.5 motion-reduce:group-hover:translate-x-0"
                    strokeWidth={2}
                    aria-hidden
                  />
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
