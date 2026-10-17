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

/** Las primeras que se dibujan; el resto sale con «Ver más» (nada se pierde). */
const PRIMERAS = 20;

export function CajaAuditoria() {
  const [rastro, setRastro] = useState<EntradaRastro[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [visibles, setVisibles] = useState(PRIMERAS);
  const [abierta, setAbierta] = useState<string | null>(null);

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
      {/* Alcance a la vista (H11/M28): sin esto parecía la lista completa de la caja. */}
      <p className="border-b border-[var(--rule-soft)] px-5 py-2 text-sm text-[var(--text-secondary)]">
        Sólo lo que hizo una persona: aperturas, cierres, anotaciones a mano y correcciones. Ventas y adelantos: en Movimientos.
      </p>
      {rastro.length === 0 ? (
        !error && <p className="p-8 text-center text-sm text-[var(--text-secondary)]">Todavía nadie abrió, cerró ni anotó algo a mano en la caja.</p>
      ) : (
        <ul className="divide-y divide-[var(--rule-base)]">
          {rastro.slice(0, visibles).map((t) => {
            const esApertura = t.action === "Abrir";
            const esCierre = t.action === "Cerrar";
            return (
              <li key={t.id} className="flex items-center gap-3 px-5 py-2">
                <span
                  className={cn(
                    "mt-0.5 inline-flex h-7 shrink-0 items-center rounded-full px-2.5 text-sm font-semibold",
                    esApertura
                      ? "bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]"
                      : esCierre
                        ? "bg-[var(--data-warning-500)]/15 text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]"
                        : "bg-[var(--surface-sunken)] text-[var(--text-secondary)]",
                  )}
                >
                  {esApertura ? "Apertura" : esCierre ? "Cierre" : t.action === "Editar" ? "Corrección" : "Movimiento"}
                </span>
                {/* Una línea por registro: el detalle completo sale al tocar la fila. */}
                <button
                  type="button"
                  aria-expanded={abierta === t.id}
                  onClick={() => setAbierta(abierta === t.id ? null : t.id)}
                  title={t.detail}
                  className="min-w-0 flex-1 text-left"
                >
                  <span className={cn("block text-sm text-[var(--text-primary)]", abierta !== t.id && "truncate")}>{t.detail}</span>
                  {/* En el celular quién y cuándo van debajo: es lo que esta lista responde. */}
                  <span className="block truncate text-sm text-[var(--text-secondary)] sm:hidden">
                    <span className="font-semibold">{t.user}</span> · {formatDateTime(t.createdAt)}
                  </span>
                </button>
                <span className="shrink-0 text-sm text-[var(--text-secondary)] max-sm:hidden">
                  <span className="font-semibold">{t.user}</span> · {formatDateTime(t.createdAt)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {rastro.length > visibles && (
        <button
          type="button"
          onClick={() => setVisibles((v) => v + 40)}
          className="h-12 w-full border-t border-[var(--rule-base)] text-sm font-semibold text-[var(--accent-ink)] hover:bg-[var(--surface-sunken)]"
        >
          Ver más ({rastro.length - visibles})
        </button>
      )}
    </section>
  );
}
