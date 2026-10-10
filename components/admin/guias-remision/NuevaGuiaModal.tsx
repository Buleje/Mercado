"use client";

/**
 * «Nueva guía de remisión»: una ventana (se mueve, se achica y se fija, ADR-420)
 * con el formulario en bloques —traslado, destinatario, ruta, transporte, carga
 * e ítems—. Lo que se manda al backend no cambió.
 */
import { useId, useRef, type ReactNode } from "react";
import { BlockTitle, CardTitle } from "@buleje/design-system";
import { Calendar, Loader2, MapPin, Plus, X } from "@buleje/design-system/icons";
import { m, AnimatePresence } from "@/components/admin/providers";
import { Field } from "@/components/admin/shared/Field";
import { ControlesDeVentana, TiradorDeVentana } from "@/components/admin/shared/modal-controles-ventana";
import { button } from "@/components/ui-system/button-variants";
import { useModalAccesible } from "@/hooks/use-modal-accesible";
import { useVentanaDeModal } from "@/hooks/use-ventana-de-modal";
import { BOTON_ICONO, CAMPO, CAMPO_ICONO, ETIQUETA } from "./estilos";
import { GuiaItemsEditor } from "./GuiaItemsEditor";
import { MOTIVOS } from "./tipos";
import type { useNuevaGuia } from "./use-nueva-guia";

interface Props {
  abierto: boolean;
  onCerrar: () => void;
  nueva: ReturnType<typeof useNuevaGuia>;
}

function Bloque({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <BlockTitle>{titulo}</BlockTitle>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{children}</div>
    </section>
  );
}

export function NuevaGuiaModal({ abierto, onCerrar, nueva }: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const { form, campo, creating, error } = nueva;
  useModalAccesible(panelRef, { onCerrar, activo: abierto });
  const ventana = useVentanaDeModal(abierto, { ref: panelRef, aplicarTranslate: true, claveMemoria: "guias-remision-nueva" });

  const texto = (k: keyof typeof form, etiqueta: string, placeholder: string, extra?: { className?: string; maxLength?: number; tipo?: string; filtro?: (v: string) => string }) => (
    <Field label={etiqueta} labelClassName={ETIQUETA} className={extra?.className}>
      <input
        type={extra?.tipo ?? "text"}
        value={form[k]}
        maxLength={extra?.maxLength}
        placeholder={placeholder}
        onChange={(e) => campo(k, extra?.filtro ? extra.filtro(e.target.value) : e.target.value)}
        className={CAMPO}
      />
    </Field>
  );

  const conIcono = (k: "puntoPartida" | "puntoLlegada" | "fechaTraslado", etiqueta: string, placeholder: string, Icono: typeof MapPin, tipo = "text") => (
    <Field label={etiqueta} labelClassName={ETIQUETA}>
      {(id) => (
        <div className="relative">
          <Icono className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-tertiary)]" aria-hidden />
          <input id={id} type={tipo} value={form[k]} placeholder={placeholder} onChange={(e) => campo(k, e.target.value)} className={CAMPO_ICONO} />
        </div>
      )}
    </Field>
  );

  return (
    <AnimatePresence>
      {abierto && (
        <>
          <m.div key="ng-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="modal-backdrop" onClick={onCerrar} />
          <m.div
            key="ng-modal"
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="fixed inset-0 z-modal flex items-start justify-center overflow-y-auto p-4"
            onClick={(e) => e.target === e.currentTarget && !ventana.fijado && onCerrar()}
          >
            <div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}
              className="relative my-8 flex max-h-[90vh] w-full max-w-3xl flex-col rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)]">
              <div {...ventana.asaProps} className="sticky top-0 z-10 flex items-center justify-between rounded-t-xl border-b border-[var(--rule-base)] bg-[var(--surface-raised)] px-6 py-3">
                <CardTitle id={titleId} className="font-display text-base font-semibold tracking-tight text-[var(--text-primary)] sm:text-lg">Nueva guía de remisión</CardTitle>
                <span className="ml-auto flex items-center gap-1"><ControlesDeVentana ventana={ventana} /></span>
                <button type="button" aria-label="Cerrar" onClick={onCerrar} className={BOTON_ICONO}><X className="h-5 w-5" aria-hidden /></button>
              </div>

              <div className="flex-1 space-y-6 overflow-y-auto px-6 py-4">
                <Bloque titulo="Traslado">
                  {texto("orderIds", "Vincular pedido (opcional)", "N° de orden")}
                  <Field label="Motivo de traslado" labelClassName={ETIQUETA}>
                    <select value={form.motivoTraslado} onChange={(e) => campo("motivoTraslado", e.target.value)} className={CAMPO}>
                      {MOTIVOS.map((mo) => <option key={mo} value={mo}>{mo}</option>)}
                    </select>
                  </Field>
                  {conIcono("fechaTraslado", "Fecha y hora de traslado", "", Calendar, "datetime-local")}
                  {texto("documentoRef", "Doc. de referencia", "Factura, boleta u orden")}
                </Bloque>

                <Bloque titulo="Destinatario">
                  {texto("destinatarioNombre", "Destinatario", "Nombre")}
                  {texto("destinatarioRuc", "RUC del destinatario", "20XXXXXXXXX")}
                  {texto("destinatarioDireccion", "Dirección del destinatario", "Dirección", { className: "sm:col-span-2" })}
                </Bloque>

                <Bloque titulo="Ruta">
                  {conIcono("puntoPartida", "Punto de partida", "Dirección origen", MapPin)}
                  {conIcono("puntoLlegada", "Punto de llegada", "Dirección destino", MapPin)}
                </Bloque>

                <Bloque titulo="Transporte">
                  {texto("transportistaNombre", "Transportista", "Nombre")}
                  {texto("transportistaRuc", "RUC del transportista", "RUC")}
                  {texto("vehiculoPlaca", "Placa", "ABC-123")}
                  {texto("conductorNombre", "Conductor", "Nombre del conductor")}
                  {texto("conductorDni", "DNI del conductor", "12345678", { maxLength: 8, filtro: (v) => v.replace(/\D/g, "").slice(0, 8) })}
                </Bloque>

                <Bloque titulo="Carga">
                  {texto("bultos", "N° de bultos", "0", { tipo: "number" })}
                  {texto("pesoBruto", "Peso bruto (kg)", "0.000", { tipo: "number" })}
                </Bloque>

                <GuiaItemsEditor items={nueva.items} onCambio={nueva.updateItem} onQuitar={nueva.removeItem} onAgregar={nueva.addItem} />

                {error ? <p role="alert" className="text-sm font-semibold text-[var(--data-error-ink)]">{error}</p> : null}
              </div>

              <div className="sticky bottom-0 flex justify-end gap-3 rounded-b-xl border-t border-[var(--rule-base)] bg-[var(--surface-raised)] px-6 py-3">
                <button type="button" onClick={onCerrar} className={button({ variant: "ghost", className: "rounded-xl" })}>Cancelar</button>
                <button type="button" onClick={nueva.crear} disabled={creating} className={button({ variant: "primary", className: "rounded-xl" })}>
                  {creating ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Plus className="h-4 w-4" aria-hidden />}
                  Crear guía
                </button>
              </div>
              <TiradorDeVentana ventana={ventana} />
            </div>
          </m.div>
        </>
      )}
    </AnimatePresence>
  );
}
