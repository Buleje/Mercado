import "server-only";
import type { Metadata } from "next";
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
    <div className="max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-extrabold uppercase tracking-[var(--ls-wider)] text-[var(--accent)] mb-1">
            Buleje · Plataforma
          </p>
          <h1 className="text-2xl sm:text-3xl font-black tracking-[-0.02em] text-[var(--text-primary)] flex items-center gap-3 flex-wrap">
            Pagos Yape pendientes
            {initialCount > 0 && (
              <span
                className="inline-flex items-center justify-center min-w-[1.75rem] h-7 rounded-full bg-[var(--data-warning-500)] text-white text-xs font-extrabold px-2"
                aria-label={`${initialCount} pendientes`}
              >
                {initialCount}
              </span>
            )}
          </h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            Revisá las capturas, validá montos y operaciones detectadas por IA.
          </p>
        </div>
      </div>

      <PagosYapeClient initialCount={initialCount} />
    </div>
  );
}
