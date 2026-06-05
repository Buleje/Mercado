"use client";

/**
 * TiendaSemanaWidget — votación "Tienda de la semana" en la zona del saludo del
 * marketplace. Participación activa del cliente: vota por su tienda favorita y
 * ve resultados en vivo (barras %). Backend: /api/marketplace/tienda-semana
 * (tabla MarketplaceWeeklyVote). Dedupe de voto por semana via localStorage.
 */
import { useEffect, useState } from "react";
import Image from "next/image";
import { Trophy, Check } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { csrfHeaders } from "@/lib/csrf-client";
import { celebrate } from "@/lib/celebrate";

interface StoreLike {
  slug: string;
  name: string;
  logo?: string | null;
}

interface VoteRow {
  storeSlug: string;
  count: number;
}

export default function TiendaSemanaWidget({
  initialStores,
  className,
}: {
  initialStores?: readonly StoreLike[];
  className?: string;
}) {
  const stores = (initialStores ?? []).filter((s) => s?.slug && s?.name).slice(0, 4);
  const [votes, setVotes] = useState<Record<string, number>>({});
  const [week, setWeek] = useState<string>("");
  const [voted, setVoted] = useState<string | null>(null);
  const [voting, setVoting] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/marketplace/tienda-semana")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { week?: string; votes?: VoteRow[] } | null) => {
        if (cancelled || !d) return;
        setWeek(d.week ?? "");
        const map: Record<string, number> = {};
        (d.votes ?? []).forEach((v) => (map[v.storeSlug] = v.count));
        setVotes(map);
        try {
          const prev = d.week ? localStorage.getItem(`ts-vote-${d.week}`) : null;
          if (prev) setVoted(prev);
        } catch {}
      })
      .catch(() => {/* fetch no crítico: la sección se oculta o usa fallback */});
    return () => {
      cancelled = true;
    };
  }, []);

  if (stores.length < 2) return null;

  const total = stores.reduce((s, st) => s + (votes[st.slug] ?? 0), 0);
  const hasVoted = voted !== null;

  async function vote(slug: string) {
    if (hasVoted || voting) return;
    setVoting(slug);
    try {
      const res = await fetch("/api/marketplace/tienda-semana", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ storeSlug: slug }),
      });
      if (res.ok) {
        const json = (await res.json()) as { week?: string; votes?: VoteRow[] };
        const map: Record<string, number> = {};
        (json.votes ?? []).forEach((v) => (map[v.storeSlug] = v.count));
        setVotes(map);
        setVoted(slug);
        celebrate({ intensity: "md" }); // 🎉 voto registrado
        try {
          if (json.week) localStorage.setItem(`ts-vote-${json.week}`, slug);
        } catch {}
      }
    } finally {
      setVoting(null);
    }
  }

  return (
    <section
      aria-label="Tienda de la semana"
      className={cn(
        "@container rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-3.5",
        className,
      )}
    >
      <div className="mb-2.5 flex items-center gap-2">
        <span
          aria-hidden
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--accent-soft)] text-[var(--accent)]"
        >
          <Trophy className="h-[18px] w-[18px]" strokeWidth={2} />
        </span>
        <div className="min-w-0">
          <h2 className="text-sm font-extrabold leading-tight text-[var(--text-primary)]">
            Tienda de la semana
          </h2>
          <p className="text-xs font-medium leading-tight text-[var(--text-secondary)]">
            {hasVoted ? "¡Gracias por votar!" : "Vota por tu favorita"}
          </p>
        </div>
      </div>

      <ul className="grid grid-cols-1 gap-1.5 @[440px]:grid-cols-2">
        {stores.map((store) => {
          const count = votes[store.slug] ?? 0;
          const pct = total > 0 ? Math.round((count / total) * 100) : 0;
          const isVotedStore = voted === store.slug;
          const showResults = hasVoted;

          return (
            <li key={store.slug}>
              <button
                type="button"
                disabled={hasVoted || voting !== null}
                onClick={() => vote(store.slug)}
                aria-label={hasVoted ? `${store.name}: ${pct}%` : `Votar por ${store.name}`}
                className={cn(
                  "group relative flex w-full items-center gap-2.5 overflow-hidden rounded-lg border px-2.5 py-1.5 text-left transition-colors",
                  isVotedStore
                    ? "border-[var(--accent)] bg-[var(--accent-soft)]"
                    : hasVoted
                      ? "border-[var(--rule-soft)] bg-[var(--surface-sunken)]"
                      : "border-[var(--rule-base)] bg-[var(--surface-raised)] hover:border-[var(--accent)] hover:bg-[var(--accent-soft)]",
                )}
              >
                {/* Barra de progreso de fondo (solo tras votar) */}
                {showResults && (
                  <span
                    aria-hidden
                    className="absolute inset-y-0 left-0 bg-[var(--accent)]/12 transition-[width] duration-500"
                    style={{ width: `${pct}%` }}
                  />
                )}

                {/* Logo */}
                <span className="relative z-10 inline-flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--surface-sunken)] text-xs font-extrabold text-[var(--text-tertiary)] ring-1 ring-[var(--rule-base)]">
                  {store.logo ? (
                    <Image src={store.logo} alt="" fill sizes="28px" className="object-cover" />
                  ) : (
                    store.name.charAt(0).toUpperCase()
                  )}
                </span>

                {/* Nombre */}
                <span className="relative z-10 min-w-0 flex-1 truncate text-sm font-bold text-[var(--text-primary)]">
                  {store.name}
                </span>

                {/* Estado: % (votado) o CTA Votar */}
                {showResults ? (
                  <span className="relative z-10 flex shrink-0 items-center gap-1.5">
                    {isVotedStore && (
                      <Check className="h-4 w-4 text-[var(--accent)]" strokeWidth={3} aria-hidden />
                    )}
                    <span className="text-sm font-extrabold tabular-nums text-[var(--text-primary)]">
                      {pct}%
                    </span>
                  </span>
                ) : (
                  <span className="relative z-10 shrink-0 rounded-full bg-[var(--accent-soft)] px-3 py-1 text-xs font-extrabold text-[var(--accent)] transition-colors group-hover:bg-[var(--accent)] group-hover:text-white">
                    {voting === store.slug ? "…" : "Votar"}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>

      {total > 0 && (
        <p className="mt-3 text-center text-xs font-medium text-[var(--text-tertiary)]">
          {total} {total === 1 ? "voto" : "votos"} esta semana
        </p>
      )}
    </section>
  );
}
