"use client";

import { useCallback, useId, useRef, type Dispatch, type SetStateAction } from "react";
import { CardTitle } from "@buleje/design-system";
import { AlertTriangle, Loader2, Send, X } from "@buleje/design-system/icons";
import { Field } from "@/components/admin/shared/Field";
import { useModalAccesible } from "@/hooks/use-modal-accesible";
import { useVentanaDeModal } from "@/hooks/use-ventana-de-modal";
import { ControlesDeVentana, TiradorDeVentana } from "@/components/admin/shared/modal-controles-ventana";
import type { EmitForm } from "./tipos";

const ETIQUETA = "text-sm font-semibold text-[var(--text-secondary)] mb-1 block";
const CAMPO =
  "w-full text-sm border border-[var(--rule-base)] rounded-xl px-3 h-12 bg-[var(--surface-raised)] text-[var(--text-primary)]";

interface Props {
  form: EmitForm | null;
  setForm: Dispatch<SetStateAction<EmitForm | null>>;
  cargando: boolean;
  error: string | null;
  onEmitir: () => void;
}

/** «Emitir comprobante SUNAT»: mismo formulario y mismo endpoint de siempre; campos y botones de 48 px. */
export function ModalEmitirComprobante({ form, setForm, cargando, error, onEmitir }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const tituloId = useId();
  const cerrar = useCallback(() => { if (!cargando) setForm(null); }, [cargando, setForm]);
  useModalAccesible(ref, { onCerrar: cerrar, activo: form !== null });
  const ventana = useVentanaDeModal(form !== null, { ref, aplicarTranslate: true, claveMemoria: "efactura-emitir" });

  if (form === null) return null;
  const cambiar = (parcial: Partial<EmitForm>) => setForm(f => f && { ...f, ...parcial });

  return (
    <div className="modal-backdrop p-4" role="presentation" onClick={e => e.target === e.currentTarget && !cargando && !ventana.fijado && setForm(null)}>
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={tituloId} tabIndex={-1} className="relative bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-xl p-4 sm:p-6 w-full max-w-md space-y-4">
        <div {...ventana.asaProps} className="flex items-center justify-between">
          <CardTitle id={tituloId} className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2">
            <Send className="h-4 w-4 text-primary" /> Emitir comprobante SUNAT
          </CardTitle>
          <span className="ml-auto flex items-center gap-1">
            <ControlesDeVentana ventana={ventana} />
          </span>
          {!cargando && (
            <button aria-label="Cerrar" onClick={() => setForm(null)} className="flex h-12 w-12 items-center justify-center rounded-xl hover:bg-[var(--surface-sunken)]">
              <X className="h-4 w-4 text-[var(--text-tertiary)]" />
            </button>
          )}
        </div>

        <div className="space-y-3">
          <Field label="Tipo de comprobante" labelClassName={ETIQUETA}>
            <select value={form.tipoDoc} onChange={e => cambiar({ tipoDoc: e.target.value as "01" | "03" })} className={CAMPO}>
              <option value="03">Boleta (B001)</option>
              <option value="01">Factura (F001)</option>
            </select>
          </Field>
          <Field label="ID del pedido" labelClassName={ETIQUETA}>
            <input value={form.orderId} onChange={e => cambiar({ orderId: e.target.value })} placeholder="ej. cm3abc123..." className={CAMPO} />
          </Field>
          <Field label="Nombre del cliente" labelClassName={ETIQUETA}>
            <input value={form.clienteNombre} onChange={e => cambiar({ clienteNombre: e.target.value })} placeholder="Nombre o razón social" className={CAMPO} />
          </Field>
          {form.tipoDoc === "03" ? (
            <Field label={<>DNI <span className="font-normal">(opcional)</span></>} labelClassName={ETIQUETA}>
              <input value={form.clienteDni} onChange={e => cambiar({ clienteDni: e.target.value })} placeholder="12345678" maxLength={8} className={CAMPO} />
            </Field>
          ) : (
            <Field label="RUC" labelClassName={ETIQUETA}>
              <input value={form.clienteRuc} onChange={e => cambiar({ clienteRuc: e.target.value })} placeholder="20123456789" maxLength={11} className={CAMPO} />
            </Field>
          )}
          <Field label={<>Dirección <span className="font-normal">(opcional)</span></>} labelClassName={ETIQUETA}>
            <input value={form.clienteDireccion} onChange={e => cambiar({ clienteDireccion: e.target.value })} placeholder="Av. Centenario 123, Pucallpa" className={CAMPO} />
          </Field>
        </div>

        {error && (
          <div role="alert" className="bg-[var(--data-error-50)] dark:bg-red-950/20 border border-[var(--data-error-500)] dark:border-[var(--data-error-500)]/40 rounded-xl p-3 text-sm text-[var(--data-error-ink)] dark:text-[var(--data-error-500)] font-semibold flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" /> {error}
          </div>
        )}

        <div className="flex gap-2 pt-1">
          <button
            onClick={() => setForm(null)}
            disabled={cargando}
            className="flex-1 min-h-12 rounded-xl border border-[var(--rule-base)] text-sm font-semibold text-[var(--text-secondary)] hover:bg-[var(--surface-alt)] transition-colors disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={onEmitir}
            disabled={cargando || !form.orderId.trim() || !form.clienteNombre.trim()}
            className="flex-1 min-h-12 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {cargando ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Emitiendo...</>
            ) : (
              <><Send className="h-4 w-4" /> Emitir</>
            )}
          </button>
        </div>
        <TiradorDeVentana ventana={ventana} />
      </div>
    </div>
  );
}
