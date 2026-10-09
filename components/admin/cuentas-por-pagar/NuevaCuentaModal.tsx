"use client";

import { useId, useRef, useState, type FormEvent } from "react";
import { CardTitle } from "@buleje/design-system";
import { CreditCard, X } from "@buleje/design-system/icons";
import { Field } from "@/components/admin/shared/Field";
import { ControlesDeVentana, TiradorDeVentana } from "@/components/admin/shared/modal-controles-ventana";
import { useModalAccesible } from "@/hooks/use-modal-accesible";
import { useScrollLock } from "@/hooks/use-scroll-lock";
import { useVentanaDeModal } from "@/hooks/use-ventana-de-modal";
import type { NuevaCuenta, ProveedorBasico } from "./use-cuentas-por-pagar";

const ROTULO = "mb-1 block text-xs font-semibold text-[var(--text-secondary)]";
const CAMPO = "h-10 w-full rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]";
const VACIA: NuevaCuenta = { supplierId: "", description: "", amount: "", dueDate: "" };

/** Alta a mano de una cuenta por pagar (las de una OC a crédito nacen solas). */
export default function NuevaCuentaModal({ proveedores, saving, onCrear, onCerrar }: {
  proveedores: ProveedorBasico[];
  saving: boolean;
  onCrear: (f: NuevaCuenta) => Promise<boolean>;
  onCerrar: () => void;
}) {
  const [f, setF] = useState<NuevaCuenta>(VACIA);
  const tituloId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  useScrollLock(true);
  useModalAccesible(panelRef, { onCerrar, activo: true });
  const ventana = useVentanaDeModal(true, { ref: panelRef, aplicarTranslate: true, claveMemoria: "cuentas-por-pagar-nueva" });

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    if (!f.supplierId || !f.amount) return;
    if (await onCrear(f)) onCerrar();
  };

  return (
    <div className="fixed inset-0 z-modal flex items-end justify-center bg-black/50 sm:items-center" onClick={(e) => e.target === e.currentTarget && !ventana.fijado && onCerrar()}>
      <div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby={tituloId} tabIndex={-1} className="relative max-h-[90dvh] w-full overflow-y-auto rounded-t-2xl bg-[var(--surface-raised)] sm:max-w-[36rem] sm:rounded-xl">
        <div {...ventana.asaProps} className="sticky top-0 z-10 flex items-center justify-between border-b border-[var(--rule-base)] bg-[var(--surface-raised)] px-5 py-4">
          <CardTitle id={tituloId} className="flex flex-wrap items-center gap-2 text-[var(--text-primary)]">
            <CreditCard className="h-5 w-5 text-primary" aria-hidden /> Nueva cuenta por pagar
          </CardTitle>
          <span className="ml-auto flex items-center gap-1">
            <ControlesDeVentana ventana={ventana} />
            <button type="button" aria-label="Cerrar" onClick={onCerrar} className="rounded-xl p-1.5 transition-colors hover:bg-[var(--rule-soft)]">
              <X className="h-5 w-5 text-[var(--text-secondary)]" aria-hidden />
            </button>
          </span>
        </div>
        <form onSubmit={enviar} className="space-y-4 p-5">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Proveedor *" labelClassName={ROTULO}>
              <select required value={f.supplierId} onChange={(e) => setF((x) => ({ ...x, supplierId: e.target.value }))} className={CAMPO}>
                <option value="">Elige el proveedor</option>
                {proveedores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </Field>
            <Field label="Monto (S/) *" labelClassName={ROTULO}>
              <input required type="number" step="0.01" min="0.01" inputMode="decimal" value={f.amount} onChange={(e) => setF((x) => ({ ...x, amount: e.target.value }))} placeholder="0.00" className={CAMPO} />
            </Field>
            <Field label="Qué es" labelClassName={ROTULO}>
              <input value={f.description} onChange={(e) => setF((x) => ({ ...x, description: e.target.value }))} placeholder="Factura F001-123…" className={CAMPO} />
            </Field>
            <Field label="Vence el" labelClassName={ROTULO}>
              <input type="date" value={f.dueDate} onChange={(e) => setF((x) => ({ ...x, dueDate: e.target.value }))} className={CAMPO} />
            </Field>
          </div>
          <div className="flex flex-wrap gap-3">
            <button type="button" onClick={onCerrar} className="min-h-11 flex-1 rounded-xl border border-[var(--rule-base)] text-sm font-semibold text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-sunken)]">Cancelar</button>
            <button type="submit" disabled={saving} className="min-h-11 flex-1 rounded-xl bg-primary text-sm font-semibold text-white transition-colors hover:bg-primary-dark disabled:opacity-60">
              {saving ? "Guardando…" : "Crear cuenta"}
            </button>
          </div>
        </form>
        <TiradorDeVentana ventana={ventana} />
      </div>
    </div>
  );
}
