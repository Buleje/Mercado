import "server-only";
import type { Metadata } from "next";
import { Smartphone } from "@buleje/design-system/icons";
import { requirePlatformPage } from "@/lib/superadmin-auth";
import { PaymentApprovalDb } from "@/lib/db/payment-approval.db";
import PagosYapeClient from "./PagosYapeClient";
import {
  SUPERADMIN_PAGE,
  SUPERADMIN_HERO,
  SUPERADMIN_HERO_INNER,
  SUPERADMIN_CONTENT,
} from "@/lib/superadmin-layout";

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
    initialCount = 0;
  }

  return (
    <div className={SUPERADMIN_PAGE}>
      <header className={SUPERADMIN_HERO}>
        <div className={SUPERADMIN_HERO_INNER}>
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex items-start gap-3 min-w-0 flex-1">
              <span className="inline-flex h-11 w-11 sm:h-12 sm:w-12 items-center justify-center rounded-2xl bg-[var(--accent-600,var(--accent))] text-white shrink-0">
                <Smartphone
                  className="h-5 w-5 sm:h-6 sm:w-6"
                  strokeWidth={1.75}
                  aria-hidden
                />
              </span>
              <div className="min-w-0">
                <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-[var(--ls-wider)] text-[var(--accent)] mb-1">
                  Plataforma · Yape
                </p>
                <h1 className="font-display text-xl sm:text-2xl lg:text-3xl font-extrabold tracking-tight text-[var(--text-primary)]">
                  Pagos Yape pendientes
                </h1>
                <p className="text-sm text-[var(--text-secondary)] mt-1 max-w-2xl">
                  Capturas extraídas por IA. Compará monto/operación detectados
                  vs. esperados y aprobá o rechazá. Atajos:{" "}
                  <kbd className="px-1.5 py-0.5 rounded bg-[var(--surface-sunken)] text-xs font-mono border border-[var(--rule-soft)]">
                    /
                  </kbd>{" "}
                  buscar ·{" "}
                  <kbd className="px-1.5 py-0.5 rounded bg-[var(--surface-sunken)] text-xs font-mono border border-[var(--rule-soft)]">
                    J/K
                  </kbd>{" "}
                  navegar ·{" "}
                  <kbd className="px-1.5 py-0.5 rounded bg-[var(--surface-sunken)] text-xs font-mono border border-[var(--rule-soft)]">
                    A
                  </kbd>{" "}
                  aprobar
                </p>
              </div>
            </div>
            {initialCount > 0 && (
              <div className="rounded-xl border-2 border-teal-300/60 bg-teal-50/80 px-3.5 py-2 min-w-[100px] dark:border-teal-700/40 dark:bg-teal-950/30">
                <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-teal-700 dark:text-teal-300 leading-none">
                  Pendientes
                </p>
                <p className="font-display text-xl font-extrabold tabular-nums tracking-tight mt-1 leading-none text-teal-700 dark:text-teal-300">
                  {initialCount}
                </p>
              </div>
            )}
          </div>
        </div>
      </header>

      <div className={SUPERADMIN_CONTENT}>
        <PagosYapeClient initialCount={initialCount} />
      </div>
    </div>
  );
}
