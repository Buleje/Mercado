"use client";

/** Mejora 5: los movimientos de hoy en línea de tiempo, con el efectivo actual al final. */
import { useState } from "react";
import { activateProps } from "@/components/admin/shared/a11y";
import { medioDeMovimiento } from "@/lib/caja/saldo-esperado";
import { formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ItemLineaDeTiempo } from "./use-caja-registradora";
import { COLOR_SIGNO, fmt, signoDe } from "./tipos";

const BADGE_COLOR: Record<string, string> = {
  apertura: "bg-[var(--surface-sunken)] text-[var(--text-primary)]",
  venta: "bg-[var(--data-success-500)]/12 text-[var(--data-success-700)] dark:text-[var(--data-success-500)]",
  egreso: "bg-[var(--data-error-100)] text-[var(--data-error-500)]",
  ingreso: "bg-[var(--data-success-500)]/12 text-[var(--data-success-700)] dark:text-[var(--data-success-500)]",
};

const hora = (iso: string, segundos = false) => {
  try {
    return formatTime(iso, segundos ? { segundos: true } : undefined);
  } catch {
    return "";
  }
};

export function CajaLineaDeTiempo({ items, efectivoActual }: { items: ItemLineaDeTiempo[]; efectivoActual: number }) {
  const [abierto, setAbierto] = useState<number | null>(null);
  return (
    <div className="max-h-96 overflow-y-auto px-4 py-3">
      {items.map((item, idx) => {
        const ultimo = idx === items.length - 1;
        const signo = signoDe(item.type);
        const expandido = abierto === idx;
        return (
          <div key={item.movementId ?? `${item.time}-${idx}`} className="flex gap-3">
            <div className="flex flex-col items-center">
              <div className={cn("w-2.5 h-2.5 rounded-full shrink-0 mt-1 bg-primary", ultimo && "animate-pulse")} />
              {!ultimo && <div className="w-0.5 flex-1 bg-primary/20 min-h-6" />}
            </div>
            <div className="pb-3 flex-1 min-w-0 cursor-pointer hover:bg-[var(--surface-alt)] rounded-lg px-1.5 -mx-1.5 transition-colors" {...activateProps(() => setAbierto(expandido ? null : idx))}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-[var(--text-tertiary)] font-mono">{hora(item.time)}</span>
                <span className={cn("text-xs font-bold px-1.5 py-0.5 rounded-full", BADGE_COLOR[item.type] ?? BADGE_COLOR.apertura)}>{item.badge}</span>
                {/* El medio de una venta, y el de un ingreso/retiro que NO fue en efectivo (no mueve el cajón). */}
                {item.method && (item.type === "venta" || ((item.type === "ingreso" || item.type === "egreso") && medioDeMovimiento(item.method) !== "efectivo")) && (
                  <span className="text-xs font-medium text-[var(--text-tertiary)] capitalize">{item.method}</span>
                )}
              </div>
              <p className="text-xs text-[var(--text-primary)] truncate">{item.description}</p>
              <p className={cn("text-xs font-bold", COLOR_SIGNO[signo])}>
                {signo === 1 ? "+" : signo === -1 ? "−" : ""}
                {fmt(item.amount)}
              </p>
              {expandido && (
                <dl className="mt-2 space-y-1 text-xs text-[var(--text-tertiary)] bg-[var(--surface-sunken)]/50 rounded-lg p-3 border border-[var(--rule-soft)]">
                  <div><dt className="inline font-bold text-[var(--text-secondary)]">Hora exacta:</dt> <dd className="inline">{hora(item.time, true)}</dd></div>
                  <div><dt className="inline font-bold text-[var(--text-secondary)]">Tipo:</dt> <dd className="inline capitalize">{item.badge}</dd></div>
                  <div><dt className="inline font-bold text-[var(--text-secondary)]">Monto:</dt> <dd className="inline">{fmt(item.amount)}</dd></div>
                  {item.method && <div><dt className="inline font-bold text-[var(--text-secondary)]">Medio:</dt> <dd className="inline capitalize">{item.method}</dd></div>}
                  {item.description && item.description !== item.type && <div><dt className="inline font-bold text-[var(--text-secondary)]">Descripción:</dt> <dd className="inline">{item.description}</dd></div>}
                  {item.type === "egreso" && <div><dt className="inline font-bold text-[var(--text-secondary)]">Motivo:</dt> <dd className="inline">{item.description || "Sin especificar"}</dd></div>}
                  {item.saleId && <div><dt className="inline font-bold text-[var(--text-secondary)]">ID venta:</dt> <dd className="inline font-mono">{item.saleId.slice(0, 8)}…</dd></div>}
                </dl>
              )}
            </div>
          </div>
        );
      })}
      <div className="flex gap-3">
        <div className="w-2.5 h-2.5 rounded-full bg-[var(--data-warning-500)] animate-pulse shrink-0 mt-1" />
        <div className="pb-1">
          <span className="text-xs text-[var(--text-tertiary)] font-mono">ahora</span>
          <p className="text-xs font-bold text-[var(--text-primary)]">Efectivo actual: {fmt(efectivoActual)}</p>
        </div>
      </div>
    </div>
  );
}
