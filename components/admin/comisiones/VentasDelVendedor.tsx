"use client";

/**
 * «¿De qué ventas sale esta comisión?»: las ventas de UN vendedor en el período
 * de la cifra que se ve, una por una (día, hora, productos, medio, total).
 *
 * Es lo nuevo de Comisiones frente a Turnos › Cajeros (que ya da el ranking,
 * ventas por hora y ticket promedio): ninguna otra pantalla lista las ventas
 * de una persona. Lee `/api/sales?cashierId=` (el mismo filtro de días de Lima
 * que usa el cálculo). Arriba van las cifras del cálculo, sin sumar nada acá:
 * lo vendido descuenta devoluciones y cada venta se ve tal como se cobró.
 */
import { useEffect, useState } from "react";
import { Receipt } from "@buleje/design-system/icons";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { etiquetaMedio } from "@/components/admin/pos/use-resumen-hoy";
import type { FilaComision, Rango } from "@/lib/comisiones/calcular";
import { limaDateKey } from "@/lib/utils";
import { ddmm, diaConNombre, fmt, horaLima } from "./formato";

/** Las más recientes; el total real sale de `X-Total-Count`. */
const TOPE = 100;

type Venta = { id: string; total: number; payment: string; createdAt: string; items?: { name: string; quantity: number }[] };
/** `de` = vendedor + período del pedido: al abrir a otro, lo del anterior no se pinta ni un cuadro. */
type Estado = { de: string } & ({ tipo: "cargando" } | { tipo: "error"; msg: string } | { tipo: "listo"; ventas: Venta[]; total: number });

function useVentasDelVendedor(cashierId: string | null, desde: string, hasta: string, intento: number): Estado {
  const de = `${cashierId}|${desde}|${hasta}`;
  const [estado, setEstado] = useState<Estado>({ de: "", tipo: "cargando" });
  useEffect(() => {
    if (!cashierId || !desde || !hasta) return;
    const ctl = new AbortController();
    setEstado({ de, tipo: "cargando" });
    const qs = new URLSearchParams({ cashierId, from: desde, to: hasta, limit: String(TOPE) });
    fetch(`/api/sales?${qs}`, { signal: ctl.signal })
      .then(async (r) => {
        if (!r.ok) throw new Error(`No se pudieron traer las ventas (error ${r.status}).`);
        const lista: unknown = await r.json();
        const ventas = Array.isArray(lista) ? (lista as Venta[]) : [];
        setEstado({ de, tipo: "listo", ventas, total: Number(r.headers.get("X-Total-Count")) || ventas.length });
      })
      .catch((err: unknown) => {
        if (ctl.signal.aborted) return;
        setEstado({ de, tipo: "error", msg: err instanceof Error ? err.message : "Sin conexión con el servidor." });
      });
    return () => ctl.abort();
  }, [cashierId, desde, hasta, de, intento]);
  return estado.de === de ? estado : { de, tipo: "cargando" };
}

/** «Inca Kola 1L ×2, Pan ×6 y 3 más». */
function productos(v: Venta): string {
  const items = v.items ?? [];
  const nombres = items.slice(0, 2).map((i) => `${i.name}${i.quantity > 1 ? ` ×${i.quantity}` : ""}`);
  return items.length > 2 ? `${nombres.join(", ")} y ${items.length - 2} más` : nombres.join(", ") || "Sin detalle";
}

export default function VentasDelVendedor({ fila, rango, onCerrar }: { fila: FilaComision | null; rango: Rango | null; onCerrar: () => void }) {
  const [intento, setIntento] = useState(0);
  const estado = useVentasDelVendedor(fila?.cashierId ?? null, rango?.desde ?? "", rango?.hasta ?? "", intento);

  return (
    <AdminModal
      open={fila != null}
      onClose={onCerrar}
      icon={Receipt}
      title={fila ? `Ventas de ${fila.cashierName}` : "Ventas"}
      description={rango ? `Del ${ddmm(rango.desde)} al ${ddmm(rango.hasta)}, tal como se cobraron` : undefined}
    >
      {/* AdminModal no pone gutter al cuerpo: va acá. */}
      <div className={MODAL_BODY}>
      {fila && (
        <p className="mb-3 flex flex-wrap gap-x-3 gap-y-1 text-sm text-[var(--text-secondary)]">
          <span>Vendido <strong className="tabular-nums text-[var(--text-primary)]">{fmt(fila.vendido)}</strong> (sin devoluciones)</span>
          <span>Regla <strong className="tabular-nums text-[var(--text-primary)]">{fila.tasa} %</strong></span>
          <span>Comisión <strong className="tabular-nums text-[var(--text-primary)]">{fmt(fila.comision)}</strong></span>
        </p>
      )}
      {estado.tipo === "cargando" ? (
        <div className="flex justify-center p-8" role="status" aria-label="Cargando las ventas">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      ) : estado.tipo === "error" ? (
        <div role="alert" className="flex flex-wrap items-center gap-2 rounded-xl bg-[var(--data-error-50)] px-4 py-3 text-sm text-[var(--data-error-ink)] dark:bg-[var(--data-error-500)]/15">
          {estado.msg}
          <button type="button" onClick={() => setIntento((n) => n + 1)} className="ml-auto min-h-12 px-2 font-bold underline">Reintentar</button>
        </div>
      ) : estado.ventas.length === 0 ? (
        <p className="py-6 text-center text-sm text-[var(--text-secondary)]">No tiene ventas en este período.</p>
      ) : (
        <>
          <ul className="divide-y divide-[var(--rule-soft)] rounded-xl border border-[var(--rule-base)]">
            {estado.ventas.map((v) => (
              <li key={v.id} className="flex items-start gap-3 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-[var(--text-primary)]">
                    {diaConNombre(limaDateKey(v.createdAt))} <span className="font-normal text-[var(--text-secondary)]">· {horaLima(v.createdAt)}</span>
                  </p>
                  <p className="truncate text-sm text-[var(--text-secondary)]">{productos(v)}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-bold tabular-nums text-[var(--text-primary)]">{fmt(v.total)}</p>
                  <p className="text-sm text-[var(--text-secondary)]">{etiquetaMedio(v.payment)}</p>
                </div>
              </li>
            ))}
          </ul>
          {estado.total > estado.ventas.length && (
            <p className="mt-2 text-sm text-[var(--text-secondary)]">Ves las {estado.ventas.length} más recientes de {estado.total}.</p>
          )}
        </>
      )}
      </div>
    </AdminModal>
  );
}
