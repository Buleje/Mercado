"use client";

import { useState } from "react";
import { Ban } from "@buleje/design-system/icons";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { Field } from "@/components/admin/shared/Field";
import { ModalFooter } from "@/components/admin/shared/ModalFooter";
import { button } from "@/components/ui-system/button-variants";
import { cn } from "@/lib/utils";
import { ESTADO_LABEL, type Devolucion } from "./tipos";
import type { ResultadoAccion } from "./use-devoluciones";

const CAJA = "flex min-h-12 cursor-pointer items-start gap-3 rounded-xl border px-3 py-2.5 text-sm";
const AVISO_ERROR = "rounded-xl border border-[var(--data-error-500)]/40 bg-[var(--data-error-500)]/10 px-4 py-3 text-sm font-semibold text-[var(--data-error-ink)]";

/**
 * C55 (17-10): anular reemplaza al borrado. Antes de confirmar dice qué pasa con
 * el inventario: si la mercadería no salió, nada; si salió, la persona elige si
 * volvió al almacén (regresa al inventario) o sigue en el proveedor (no cambia).
 */
export function AnularDevolucionModal({ dev, ocupada, onAnular, onCerrar }: {
  dev: Devolucion;
  ocupada: boolean;
  onAnular: (motivo: string, volvioAlAlmacen: boolean) => Promise<ResultadoAccion>;
  onCerrar: () => void;
}) {
  const [motivo, setMotivo] = useState("");
  const [volvio, setVolvio] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const salio = !!dev.stockAplicadoAt;
  const conProducto = dev.items.filter((i) => i.productId != null);
  const listo = motivo.trim().length >= 3 && (!salio || volvio !== null);

  const anular = async () => {
    if (!listo) return;
    setError(null);
    const r = await onAnular(motivo.trim(), salio && volvio === true);
    if (r.ok) onCerrar();
    else setError(r.error);
  };

  return (
    <AdminModal
      open
      onClose={onCerrar}
      title="Anular devolución"
      icon={Ban}
      size="md"
      claveVentana="devoluciones-proveedor-anular"
      footer={
        <ModalFooter>
          <button type="button" onClick={onCerrar} className={button({ variant: "secondary" })}>Cancelar</button>
          <button type="button" onClick={() => void anular()} disabled={!listo || ocupada} className={button({ variant: "danger" })}>
            {ocupada ? "Anulando…" : "Anular"}
          </button>
        </ModalFooter>
      }
    >
      <div className={`space-y-4 ${MODAL_BODY}`}>
        <p className="text-sm text-[var(--text-secondary)]">
          <strong className="text-[var(--text-primary)]">{dev.proveedorNombre}</strong> · {ESTADO_LABEL[dev.estado]} · {dev.items.map((i) => `${i.cantidad} ${i.unidad} ${i.nombre}`).join(", ")}
        </p>
        <p className="text-sm text-[var(--text-primary)]">No se borra: queda en la lista como «Anulada», con tu motivo, tu nombre y la fecha.</p>

        {salio ? (
          <fieldset className="space-y-2">
            <legend className="mb-1 text-sm font-semibold text-[var(--text-primary)]">La mercadería ya salió del inventario. ¿Dónde está ahora?</legend>
            <label className={cn(CAJA, volvio === false ? "border-[var(--accent)] bg-[var(--accent)]/8" : "border-[var(--rule-base)]")}>
              <input type="radio" name="donde" checked={volvio === false} onChange={() => setVolvio(false)} className="mt-0.5 h-4 w-4 accent-[var(--accent)]" />
              <span><strong className="text-[var(--text-primary)]">Sigue en el proveedor.</strong> <span className="text-[var(--text-secondary)]">El inventario no cambia; queda marcada «fuera del almacén» hasta que vuelva.</span></span>
            </label>
            <label className={cn(CAJA, volvio === true ? "border-[var(--accent)] bg-[var(--accent)]/8" : "border-[var(--rule-base)]")}>
              <input type="radio" name="donde" checked={volvio === true} onChange={() => setVolvio(true)} className="mt-0.5 h-4 w-4 accent-[var(--accent)]" />
              <span>
                <strong className="text-[var(--text-primary)]">Ya volvió al almacén.</strong>{" "}
                <span className="text-[var(--text-secondary)]">
                  {conProducto.length > 0
                    ? `Regresa al inventario: ${conProducto.map((i) => `+${Math.round(i.cantidad)} ${i.nombre}`).join(", ")}.`
                    : "Ningún ítem es del inventario: no se mueve stock."}
                </span>
              </span>
            </label>
          </fieldset>
        ) : (
          <p className="rounded-xl bg-[var(--surface-sunken)] px-3 py-2.5 text-sm text-[var(--text-secondary)]">
            La mercadería no salió del inventario (no se marcó enviada): anular no mueve stock.
          </p>
        )}

        <Field label="¿Por qué la anulas? *" hint="Mínimo 3 letras. Queda escrito en la devolución.">
          {(id) => (
            <textarea
              id={id}
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              rows={2}
              maxLength={300}
              placeholder="Ej.: el proveedor no aceptó el cambio y nos quedamos la mercadería"
              className="w-full resize-none rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          )}
        </Field>
        {error && <p role="alert" className={AVISO_ERROR}>{error}</p>}
      </div>
    </AdminModal>
  );
}
