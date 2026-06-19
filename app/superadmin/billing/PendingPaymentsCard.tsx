"use client";

/**
 * PendingPaymentsCard — pagos manuales de plan (Yape/transferencia) que subieron
 * las tiendas y esperan tu aprobación (Brandon 2026-06-19). Es revenue real
 * esperando confirmarse: al aprobar el comprobante, la tienda queda activa en su
 * plan. Datos de /api/superadmin/payment-proofs?status=pending. Cohesiona con el
 * billing (MRR/Stripe) mostrando también el cobro manual peruano.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Wallet, ArrowRight, CheckCircle2, RefreshCw } from "@buleje/design-system/icons";

type Proof = {
  id: string; storeName: string; ownerName: string; planTier: string;
  billingCycle: string; amountPEN: number; method: string; createdAt: string;
};

const soles = (n: number) => `S/ ${Number(n || 0).toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const dayAgo = (iso: string) => {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  return d <= 0 ? "hoy" : d === 1 ? "ayer" : `hace ${d}d`;
};

export function PendingPaymentsCard() {
  const [proofs, setProofs] = useState<Proof[] | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/superadmin/payment-proofs?status=pending", { credentials: "include", cache: "no-store" });
      if (res.ok) setProofs(((await res.json()).proofs ?? []) as Proof[]);
      else setProofs([]);
    } catch { setProofs([]); } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  if (loading && !proofs) return <div className="h-28 animate-pulse rounded-2xl bg-[var(--surface-sunken)] border border-[var(--rule-base)] mb-5" />;
  if (!proofs) return null;

  const total = proofs.reduce((s, p) => s + Number(p.amountPEN || 0), 0);
  const oldest = proofs.length ? Math.max(...proofs.map((p) => Math.floor((Date.now() - new Date(p.createdAt).getTime()) / 86_400_000))) : 0;

  return (
    <section className="mb-5 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3 mb-3">
        <h3 className="inline-flex items-center gap-2 text-base font-extrabold text-[var(--text-primary)]">
          <Wallet className="h-4 w-4 text-[var(--accent)]" /> Pagos manuales pendientes
        </h3>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => void load()} disabled={loading} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--rule-base)] px-2.5 text-xs font-bold text-[var(--text-secondary)] hover:border-[var(--accent)]/40 disabled:opacity-50">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>
          <Link href="/superadmin/pagos-pendientes" className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3 text-xs font-bold text-white hover:brightness-110">
            Revisar y aprobar <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>

      {proofs.length === 0 ? (
        <div className="flex items-center gap-2.5 rounded-xl border border-[var(--data-success-500)]/30 bg-[var(--data-success-500)]/5 px-3.5 py-3">
          <CheckCircle2 className="h-5 w-5 text-[var(--data-success-600,#059669)] shrink-0" />
          <p className="text-sm font-bold text-[var(--text-primary)]">Sin pagos manuales pendientes — todo al día.</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3 mb-3">
            <div className="border border-[var(--rule-soft)] bg-[var(--surface-raised)] p-3">
              <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--text-tertiary)]">Pendientes</p>
              <p className="font-display text-2xl font-extrabold tabular-nums text-[#0d9488]">{proofs.length}</p>
            </div>
            <div className="border border-[var(--rule-soft)] bg-[var(--surface-raised)] p-3">
              <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--text-tertiary)]">Esperando confirmar</p>
              <p className="font-display text-2xl font-extrabold tabular-nums text-[var(--text-primary)]">{soles(total)}</p>
            </div>
            <div className="border border-[var(--rule-soft)] bg-[var(--surface-raised)] p-3">
              <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--text-tertiary)]">El más viejo</p>
              <p className={`font-display text-2xl font-extrabold tabular-nums ${oldest >= 2 ? "text-[var(--data-error-600,#dc2626)]" : "text-[var(--text-primary)]"}`}>{oldest <= 0 ? "hoy" : `${oldest}d`}</p>
            </div>
          </div>
          <ul className="border border-[var(--rule-soft)] divide-y divide-[var(--rule-soft)]">
            {proofs.slice(0, 6).map((p) => (
              <li key={p.id} className="flex items-center gap-3 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-[var(--text-primary)] truncate">{p.storeName}</p>
                  <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] truncate">{p.planTier} · {p.billingCycle} · {p.method} · {dayAgo(p.createdAt)}</p>
                </div>
                <span className="text-sm font-extrabold tabular-nums text-[var(--text-primary)] shrink-0">{soles(p.amountPEN)}</span>
              </li>
            ))}
          </ul>
          {proofs.length > 6 && <p className="mt-2 text-xs text-[var(--text-tertiary)]">+{proofs.length - 6} más en la bandeja.</p>}
        </>
      )}
    </section>
  );
}
