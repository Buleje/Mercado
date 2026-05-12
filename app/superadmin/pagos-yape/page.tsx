import "server-only";
import type { Metadata } from "next";
import { Smartphone } from "lucide-react";
import { requirePlatformPage } from "@/lib/superadmin-auth";
import { PaymentApprovalDb } from "@/lib/db/payment-approval.db";
import PagosYapeClient from "./PagosYapeClient";

export const metadata: Metadata = {
  title: "Pagos Yape — Buleje Platform",
  robots: "noindex, nofollow",
};

export default async function PagosYapePage() {
  await requirePlatformPage();

  // Carga inicial SSR — el client hace polling cada 30s a partir de esto
  let initialCount = 0;
  try {
    const pending = await PaymentApprovalDb.listPending({ limit: 500 });
    initialCount = pending.length;
  } catch {
    // Non-fatal: la tabla puede no existir todavía (bootstrap lazy)
    initialCount = 0;
  }

  return (
    <div className="min-h-screen bg-[var(--surface-canvas)]">
      <header className="border-b border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <div className="max-w-[1400px] mx-auto">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex items-start gap-3.5">
              <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--accent-600,var(--accent))] text-white shrink-0">
                <Smartphone className="h-6 w-6" strokeWidth={1.75} aria-hidden />
              </span>
              <div>
                <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-[var(--ls-wider)] text-[var(--accent)] mb-1">
                  Plataforma · Yape
                </p>
                <h1 className="font-display text-2xl sm:text-3xl font-extrabold tracking-tight text-[var(--text-primary)]">
                  Pagos Yape pendientes
                </h1>
                <p className="text-sm text-[var(--text-secondary)] mt-1 max-w-2xl">
                  Revisá las capturas, validá montos y operaciones detectadas por IA.
                </p>
              </div>
            </div>
            {initialCount > 0 && (
              <div className="rounded-xl border border-[var(--data-warning-500)]/30 bg-[var(--data-warning-500)]/5 px-3.5 py-2 min-w-[88px]">
                <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--text-tertiary)] leading-none">
                  Pendientes
                </p>
                <p className="font-display text-xl font-extrabold tabular-nums tracking-tight mt-1 leading-none text-[var(--data-warning-500)]">
                  {initialCount}
                </p>
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <PagosYapeClient initialCount={initialCount} />
      </div>
    </div>
  );
}
