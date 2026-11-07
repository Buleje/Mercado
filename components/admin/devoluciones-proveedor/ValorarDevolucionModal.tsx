"use client";

import { useState } from "react";
import { Coins } from "@buleje/design-system/icons";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { ModalFooter } from "@/components/admin/shared/ModalFooter";
import { button } from "@/components/ui-system/button-variants";
import { diaYFecha } from "@/lib/compras/devoluciones-proveedor";
import { cn } from "@/lib/utils";
import { soles, type Devolucion } from "./tipos";
import type { ResultadoAccion } from "./use-devoluciones";
import { useOrigenesDevolucion } from "./use-origenes-devolucion";

const CAMPO = "h-12 w-32 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-right text-sm tabular-nums text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-primary/40";

/**
 * C51 (17-10): una devolución sin costo no vale «S/ 0», vale «pendiente de
 * valoración». Acá se le pone: propone el de la última compra a ese proveedor
 * (con su fecha y orden) y sólo toca los ítems que no tenían costo.
 */
export function ValorarDevolucionModal({ dev, ocupada, onValorar, onCerrar }: {
  dev: Devolucion;
  ocupada: boolean;
  onValorar: (valores: Array<{ itemId: number; precioUnitario: number }>) => Promise<ResultadoAccion>;
  onCerrar: () => void;
}) {
  const { porProducto, cargando } = useOrigenesDevolucion(dev.proveedorId);
  const sinCosto = dev.items.filter((i) => i.precioUnitario == null && i.id != null);
  const [valores, setValores] = useState<Record<number, string>>({});
  const [error, setError] = useState<string | null>(null);

  const sugerido = (productId?: number) => (productId != null ? porProducto[String(productId)]?.ultimoCosto ?? null : null);
  /** Lo escrito gana; si no se escribió nada, la propuesta de la última compra. */
  const valorDe = (itemId: number, productId?: number) => valores[itemId] ?? (sugerido(productId) ? String(sugerido(productId)!.costo) : "");
  const listos = sinCosto.flatMap((i) => {
    const texto = valorDe(i.id!, i.productId).trim().replace(",", ".");
    const n = Number(texto);
    return texto !== "" && Number.isFinite(n) && n >= 0 ? [{ itemId: i.id!, precioUnitario: n }] : [];
  });

  const guardar = async () => {
    if (listos.length === 0) return;
    setError(null);
    const r = await onValorar(listos);
    if (r.ok) onCerrar();
    else setError(r.error);
  };

  return (
    <AdminModal
      open
      onClose={onCerrar}
      title="Poner costo a la devolución"
      icon={Coins}
      size="md"
      claveVentana="devoluciones-proveedor-valorar"
      footer={
        <ModalFooter>
          <button type="button" onClick={onCerrar} className={button({ variant: "secondary" })}>Cancelar</button>
          <button type="button" onClick={() => void guardar()} disabled={listos.length === 0 || ocupada} className={button({ variant: "primary" })}>
            {ocupada ? "Guardando…" : `Guardar ${listos.length === 1 ? "1 costo" : `${listos.length} costos`}`}
          </button>
        </ModalFooter>
      }
    >
      <div className={`space-y-4 ${MODAL_BODY}`}>
        <p className="text-sm text-[var(--text-secondary)]">
          <strong className="text-[var(--text-primary)]">{dev.proveedorNombre}</strong> · costo por unidad de lo que le devuelves. Lo ya valorado no cambia.
        </p>
        {sinCosto.length === 0 ? (
          <p className="text-sm text-[var(--text-secondary)]">Todos los ítems ya tienen costo.</p>
        ) : (
          <ul className="space-y-3">
            {sinCosto.map((i) => {
              const s = sugerido(i.productId);
              const texto = valorDe(i.id!, i.productId);
              const n = Number(texto.replace(",", "."));
              return (
                <li key={i.id} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <div className="min-w-0 flex-1 basis-48">
                    <p className="text-sm font-semibold text-[var(--text-primary)]">{i.cantidad} {i.unidad} · {i.nombre}</p>
                    <p className="text-sm text-[var(--text-secondary)]">
                      {cargando ? "Buscando su última compra…"
                        : s ? `Última compra a este proveedor: ${soles(s.costo)} c/u, orden ${s.codigo} del ${diaYFecha(s.fecha)}.`
                        : i.productId == null ? "Escrito a mano: no hay compra de la que sacar el costo."
                        : "No hay compra de este producto a este proveedor en el sistema."}
                    </p>
                  </div>
                  <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                    S/
                    <input
                      inputMode="decimal"
                      aria-label={`Costo por unidad de ${i.nombre}`}
                      value={texto}
                      onChange={(e) => setValores((v) => ({ ...v, [i.id!]: e.target.value }))}
                      placeholder="0.00"
                      className={CAMPO}
                    />
                  </label>
                  <span className={cn("w-24 text-right text-sm tabular-nums", Number.isFinite(n) && texto.trim() ? "font-semibold text-[var(--text-primary)]" : "text-[var(--text-tertiary)]")}>
                    {Number.isFinite(n) && texto.trim() ? soles(n * i.cantidad) : "—"}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        {error && <p role="alert" className="rounded-xl border border-[var(--data-error-500)]/40 bg-[var(--data-error-500)]/10 px-4 py-3 text-sm font-semibold text-[var(--data-error-ink)]">{error}</p>}
      </div>
    </AdminModal>
  );
}
