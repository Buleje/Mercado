"use client";

/** «Quién tocó la caja»: aperturas, cierres y movimientos a mano con su usuario (registro de auditoría). */
import { useEffect, useState } from "react";
import { LoadingState } from "@buleje/design-system";
import { formatDateTime } from "@/lib/format";
import { logger } from "@/lib/logger";
import { cn } from "@/lib/utils";

interface EntradaRastro {
  id: string;
  action: string;
  entity: string;
  detail: string;
  user: string;
  createdAt: string;
}

export function CajaAuditoria() {
  const [rastro, setRastro] = useState<EntradaRastro[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    fetch("/api/cash-registers/historial?limit=100", { credentials: "include" })
      .then(async (r) => {
        if (!r.ok) throw new Error(`error ${r.status}`);
        return r.json();
      })
      .then((j) => vivo && setRastro(j.entries ?? []))
      .catch((err) => {
        logger.warn("[caja] rastro de auditoría falló", { error: String(err) });
        if (vivo) {
          setError("No pudimos leer quién tocó la caja.");
          setRastro([]);
        }
      });
    return () => {
      vivo = false;
    };
  }, []);

  if (rastro === null) return <LoadingState message="Cargando el historial…" size="sm" />;

  return (
    <section className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-2xl overflow-hidden">
      {error && (
        <p role="alert" className="px-5 py-3 text-sm font-semibold text-[var(--data-error-500)]">
          {error}
        </p>
      )}
      {rastro.length === 0 ? (
        !error && <p className="p-8 text-center text-sm text-[var(--text-secondary)]">Todavía no hay movimientos registrados.</p>
      ) : (
        <ul className="divide-y divide-[var(--rule-base)]">
          {rastro.map((t) => {
            const esApertura = t.action === "Abrir";
            const esCierre = t.action === "Cerrar";
            return (
              <li key={t.id} className="flex flex-wrap items-start gap-3 px-5 py-3">
                <span
                  className={cn(
                    "mt-0.5 inline-flex h-7 shrink-0 items-center rounded-full px-2.5 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide",
                    esApertura
                      ? "bg-primary/10 text-primary"
                      : esCierre
                        ? "bg-[var(--data-warning-500)]/15 text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]"
                        : "bg-[var(--surface-sunken)] text-[var(--text-secondary)]",
                  )}
                >
                  {esApertura ? "Apertura" : esCierre ? "Cierre" : t.action === "Editar" ? "Corrección" : "Movimiento"}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-[var(--text-primary)]">{t.detail}</p>
                  <p className="text-xs text-[var(--text-secondary)]">
                    <span className="font-semibold">{t.user}</span> · {formatDateTime(t.createdAt)}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
