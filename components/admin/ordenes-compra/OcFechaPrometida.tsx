"use client";

import { useState } from "react";
import { CalendarClock, Loader2 } from "@buleje/design-system/icons";
import { claveDeDia, diaCorto, diasEntre } from "@/lib/compras/ciclo-oc";
import { button } from "@/components/ui-system/button-variants";
import { cn } from "@/lib/utils";
import type { OrdenOC } from "@/components/admin/ordenes-compra/oc-compartido";

/** «hace 3 días» / «hoy» / «en 2 días»: cuánto falta o cuánto se pasó la fecha prometida. */
function cuandoLlega(prometida: string, hoy: string): { texto: string; tono: string } {
  const d = diasEntre(hoy, prometida);
  if (d < 0) return { texto: `atrasada ${-d} día${d === -1 ? "" : "s"}`, tono: "text-[var(--data-error-ink)]" };
  if (d === 0) return { texto: "llega hoy", tono: "text-[var(--data-warning-ink)]" };
  return { texto: `en ${d} día${d === 1 ? "" : "s"}`, tono: "text-[var(--text-secondary)]" };
}

/**
 * C14 · La fecha que prometió el proveedor, con su atraso, y el lápiz para
 * reprogramarla. Cambiarla no recibe nada: sólo mueve la orden de grupo.
 */
export default function OcFechaPrometida({
  o, hoy, guardando, onCambiar,
}: { o: OrdenOC; hoy: string; guardando: boolean; onCambiar: (fecha: string) => Promise<boolean> }) {
  const prometida = claveDeDia(o.deliveryDate);
  const [editando, setEditando] = useState(false);
  const [fecha, setFecha] = useState(prometida ?? hoy);
  const guardar = async () => {
    if (await onCambiar(fecha)) setEditando(false);
  };

  if (editando) {
    return (
      <div className="flex flex-wrap items-center gap-1" data-qa="editar-fecha-entrega">
        <input
          type="date"
          value={fecha}
          onChange={(e) => setFecha(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") void guardar(); if (e.key === "Escape") setEditando(false); }}
          aria-label={`Nueva fecha de entrega de ${o.supplierName}`}
          className="h-12 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-2 text-sm text-[var(--text-primary)]"
          autoFocus
        />
        <button type="button" onClick={() => void guardar()} disabled={guardando || !fecha} className={button({ variant: "primary", className: "rounded-xl" })}>
          {guardando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null} Guardar
        </button>
        <button type="button" onClick={() => setEditando(false)} className={button({ variant: "ghost", className: "rounded-xl" })}>Cancelar</button>
      </div>
    );
  }

  const cuando = prometida ? cuandoLlega(prometida, hoy) : null;
  return (
    <div className="flex items-center gap-1">
      <div className="min-w-0">
        <p className="whitespace-nowrap font-semibold text-[var(--text-primary)]">{prometida ? diaCorto(prometida) : "Sin fecha"}</p>
        {cuando && <p className={cn("whitespace-nowrap text-sm font-semibold", cuando.tono)}>{cuando.texto}</p>}
      </div>
      <button
        type="button"
        onClick={() => { setFecha(prometida ?? hoy); setEditando(true); }}
        aria-label={prometida ? `Cambiar la fecha de entrega de ${o.supplierName}` : `Poner fecha de entrega a ${o.supplierName}`}
        title={prometida ? "Cambiar la fecha (no recibe nada)" : "Poner la fecha que prometió el proveedor"}
        className={button({ variant: "ghost", className: "w-12 shrink-0 rounded-xl px-0" })}
        data-qa="cambiar-fecha-entrega"
      >
        <CalendarClock className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
}
