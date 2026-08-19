"use client";

/**
 * MovementDetailModal — la ficha de un movimiento de stock, y cómo deshacerlo.
 *
 * El kardex mostraba cinco columnas y nada más: el motivo que alguien tipeó, la
 * referencia y quién lo hizo estaban en la base pero no había dónde leerlos
 * completos. Y si el ajuste estaba mal —«puse −50 y era −5»— la única salida
 * era registrar otro movimiento a mano y calcular la diferencia de memoria.
 *
 * Revertir genera el movimiento contrario, con su propio renglón en el kardex.
 * No borra nada: el error queda a la vista, que es lo que un libro de
 * inventario tiene que poder demostrar.
 */

import { useState } from "react";
import { AlertTriangle, Loader2, Undo2, X, type LucideIcon } from "@buleje/design-system/icons";
import { csrfHeaders } from "@/lib/csrf-client";
import { cn } from "@/lib/utils";

export type MovementDetail = {
  id: string;
  productId: number;
  productName: string;
  type: string;
  label: string;
  dir: "in" | "out" | "neutral";
  Icon: LucideIcon;
  quantity: number;
  previousStock: number;
  newStock: number;
  reference?: string;
  notes?: string;
  createdBy?: string;
  createdAt: string;
  unit?: string;
};

/**
 * Con qué movimiento se deshace cada uno.
 *
 * `InventoryMovementsDB.record` decide el signo por el tipo
 * (`["compra","devolucion","ajuste_positivo"]` suman, el resto resta), así que
 * alcanza con mandar el opuesto y el stock vuelve solo.
 */
const INVERSO: Record<string, string> = {
  compra: "ajuste_negativo",
  devolucion: "ajuste_negativo",
  ajuste_positivo: "ajuste_negativo",
  ajuste_negativo: "ajuste_positivo",
  merma: "ajuste_positivo",
  transferencia: "ajuste_positivo",
  devolucion_proveedor: "ajuste_positivo",
};

/**
 * Por qué un movimiento NO se puede revertir desde acá.
 *
 * Una venta movió stock Y plata: deshacerla por el kardex dejaría la caja
 * diciendo una cosa y el inventario otra. Ese camino es la devolución.
 */
function motivoNoReversible(m: MovementDetail): string | null {
  if (m.dir === "neutral") {
    return "Este movimiento no cambió el stock (es un ajuste de costo), así que no hay nada que devolver.";
  }
  if (m.type === "venta" || m.type === "venta_online") {
    return "Una venta se deshace con una devolución, que también corrige la caja. Desde acá sólo se movería el stock.";
  }
  if (!INVERSO[m.type]) {
    return "Este tipo de movimiento no tiene una reversión definida.";
  }
  return null;
}

function Dato({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-sm font-bold uppercase tracking-wider text-[var(--text-secondary)]">{label}</dt>
      <dd className="mt-0.5 break-words text-base text-[var(--text-primary)]">{children}</dd>
    </div>
  );
}

export default function MovementDetailModal({
  movimiento, onRevertido, onClose,
}: {
  movimiento: MovementDetail;
  onRevertido: () => void;
  onClose: () => void;
}) {
  const [revirtiendo, setRevirtiendo] = useState(false);
  const [confirma, setConfirma] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const m = movimiento;
  const bloqueo = motivoNoReversible(m);
  const fecha = new Date(m.createdAt);

  const revertir = async () => {
    setRevirtiendo(true);
    setError(null);
    try {
      const res = await fetch("/api/inventory-movements", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        credentials: "include",
        body: JSON.stringify({
          productId: m.productId,
          type: INVERSO[m.type],
          quantity: m.quantity,
          reference: m.id,
          notes: `Revierte el ${m.label.toLowerCase()} de ${m.quantity} del ${fecha.toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" })}${m.createdBy ? ` (lo había registrado ${m.createdBy})` : ""}`,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(typeof body?.error === "string" ? body.error : `No se pudo revertir (error ${res.status})`);
        return;
      }
      onRevertido();
      onClose();
    } catch (err) {
      console.warn("[MovementDetailModal] revertir falló", err);
      setError("Sin conexión con el servidor — no se revirtió nada.");
    } finally {
      setRevirtiendo(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-[2px] sm:items-center sm:p-4"
      onClick={(e) => e.target === e.currentTarget && !revirtiendo && onClose()}
    >
      <div className="max-h-[92dvh] w-full overflow-y-auto rounded-t-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] shadow-xl sm:max-w-lg sm:rounded-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-[var(--rule-soft)] bg-[var(--surface-raised)]/95 px-6 py-4 backdrop-blur">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-bold leading-tight text-[var(--text-primary)]">{m.productName}</h2>
            <p className="text-sm text-[var(--text-secondary)]">
              {fecha.toLocaleDateString("es-PE", { day: "2-digit", month: "long", year: "numeric" })}
              {" · "}
              {fecha.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" })}
            </p>
          </div>
          <button onClick={onClose} aria-label="Cerrar" className="h-9 w-9 shrink-0 rounded-full flex items-center justify-center text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 p-6">
          {/* Lo que pasó con el stock, en una línea que se lee sola. */}
          <div className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-sunken)] px-4 py-3.5">
            <div className="flex items-center gap-2">
              <m.Icon className="h-4 w-4 text-[var(--text-secondary)]" aria-hidden />
              <span className="text-sm font-bold uppercase tracking-wider text-[var(--text-secondary)]">{m.label}</span>
            </div>
            <p className="mt-1 font-mono text-3xl font-bold tabular-nums text-[var(--text-primary)]">
              {m.dir === "neutral" ? "sin cambio" : m.dir === "in" ? `+${m.quantity}` : `−${m.quantity}`}
            </p>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              Stock {m.previousStock} → <span className="font-bold text-[var(--text-primary)]">{m.newStock}</span>
              {m.unit ? ` ${m.unit}` : ""}
            </p>
          </div>

          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {m.createdBy && <Dato label="Lo registró">{m.createdBy}</Dato>}
            {m.reference && <Dato label="Referencia">{m.reference}</Dato>}
            {m.notes && (
              <div className="sm:col-span-2">
                <Dato label="Motivo">{m.notes}</Dato>
              </div>
            )}
          </dl>

          {bloqueo ? (
            <p className="flex items-start gap-2 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-sunken)] px-3 py-2.5 text-sm text-[var(--text-primary)]">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--text-secondary)]" aria-hidden />
              {bloqueo}
            </p>
          ) : confirma ? (
            <div className="rounded-xl border-2 border-[var(--data-warning-500)]/40 bg-[var(--data-warning-500)]/10 px-3 py-2.5">
              <p className="text-sm text-[var(--text-primary)]">
                Se va a registrar un movimiento contrario de{" "}
                <span className="font-bold">{m.quantity}</span>: el stock queda en{" "}
                <span className="font-bold tabular-nums">{m.previousStock}</span>. El movimiento original
                no se borra.
              </p>
              <div className="mt-2.5 flex items-center gap-2">
                <button
                  type="button"
                  onClick={revertir}
                  disabled={revirtiendo}
                  className="inline-flex h-11 items-center gap-1.5 rounded-xl bg-[var(--data-warning-500)] px-4 text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  {revirtiendo ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Undo2 className="h-4 w-4" aria-hidden />}
                  Sí, revertir
                </button>
                <button
                  type="button"
                  onClick={() => setConfirma(false)}
                  disabled={revirtiendo}
                  className="inline-flex h-11 items-center rounded-xl border-2 border-[var(--rule-base)] px-3 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--surface-raised)] disabled:opacity-50"
                >
                  No
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirma(true)}
              className={cn(
                "inline-flex h-11 items-center gap-1.5 rounded-xl border-2 border-[var(--rule-base)] px-4 text-sm font-bold text-[var(--text-primary)] transition-colors hover:border-[var(--data-warning-500)]/50 hover:text-[var(--data-warning-600)] dark:hover:text-[var(--data-warning-500)]",
              )}
            >
              <Undo2 className="h-4 w-4" aria-hidden />
              Revertir este movimiento
            </button>
          )}

          {error && (
            <p className="flex items-center gap-2 text-sm font-semibold text-[var(--data-error-500)]" role="alert">
              <AlertTriangle className="h-4 w-4" aria-hidden />{error}
            </p>
          )}

          <p className="text-sm text-[var(--text-tertiary)]">Id del movimiento: {m.id}</p>
        </div>
      </div>
    </div>
  );
}
