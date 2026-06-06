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
  // Máx 3 candidatas en el formato compacto — con 4 avatares + % el título
  // quedaba truncado ("Tiend…") en la mini-card del strip.
  const stores = (initialStores ?? []).filter((s) => s?.slug && s?.name).slice(0, 3);
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

  // Brandon 2026-06-06 (rediseño compacto): mini-card h-16 — el voto es un
  // TAP directo sobre el avatar de la tienda (tooltip con el nombre). Tras
  // votar, cada avatar muestra su % debajo y el elegido lleva ring + check.
  return (
    <section
      aria-label="Tienda de la semana"
      className={cn(
        "flex h-16 items-center gap-2.5 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3",
        className,
      )}
    >
      {/* Sin icono-caja: los avatares ya comunican — el espacio se lo lleva
          el título (antes quedaba "TI…" truncado con 4 tiendas + %). */}
      <div className="min-w-0 flex-1">
        <h2 className="flex items-center gap-1.5 text-sm font-extrabold leading-tight text-[var(--text-primary)]">
          <Trophy className="h-4 w-4 shrink-0 text-[var(--accent)]" strokeWidth={2.25} aria-hidden />
          <span className="truncate">Tienda de la semana</span>
        </h2>
        <p className="truncate text-xs font-medium leading-tight text-[var(--text-secondary)]">
          {hasVoted
            ? `${total} ${total === 1 ? "voto" : "votos"} esta semana`
            : "Tocá tu favorita para votar"}
        </p>
      </div>

      {/* Avatares votables — un tap = un voto */}
      <ul className="flex shrink-0 items-center gap-1.5" role="list">
        {stores.map((store) => {
          const count = votes[store.slug] ?? 0;
          const pct = total > 0 ? Math.round((count / total) * 100) : 0;
          const isVotedStore = voted === store.slug;

          return (
            <li key={store.slug} className="flex flex-col items-center gap-0.5">
              <button
                type="button"
                disabled={hasVoted || voting !== null}
                onClick={() => vote(store.slug)}
                title={store.name}
                aria-label={hasVoted ? `${store.name}: ${pct}%` : `Votar por ${store.name}`}
                className={cn(
                  "relative inline-flex h-8 w-8 items-center justify-center overflow-hidden rounded-full bg-[var(--surface-sunken)] text-xs font-extrabold text-[var(--text-tertiary)] transition-all",
                  isVotedStore
                    ? "ring-2 ring-[var(--accent)] ring-offset-1 ring-offset-[var(--surface-raised)]"
                    : hasVoted
                      ? "opacity-55 ring-1 ring-[var(--rule-base)]"
                      : "ring-1 ring-[var(--rule-base)] hover:scale-110 hover:ring-2 hover:ring-[var(--accent)] active:scale-95",
                  voting === store.slug && "animate-pulse",
                )}
              >
                {store.logo ? (
                  <Image src={store.logo} alt="" fill sizes="36px" className="object-cover" />
                ) : (
                  store.name.charAt(0).toUpperCase()
                )}
                {isVotedStore && (
                  <span className="absolute inset-0 flex items-center justify-center bg-[var(--accent)]/55">
                    <Check className="h-4 w-4 text-white" strokeWidth={3.5} aria-hidden />
                  </span>
                )}
              </button>
              {hasVoted && (
                <span
                  className={cn(
                    "text-[length:var(--ts-2xs)] font-black tabular-nums leading-none",
                    isVotedStore ? "text-[var(--accent)]" : "text-[var(--text-tertiary)]",
                  )}
                >
                  {pct}%
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
