"use client";

/**
 * RegistrarPagoModal — anotar el pago de un mes (ADR-524). Es un registro: no
 * mueve caja. El servidor no deja dos pagos del mismo mes (409
 * `periodo_ya_pagado`); repetir el mismo pago vuelve `duplicado` y no es error.
 * El comprobante, si viene, se sube después de anotar el pago.
 */
import { useId, useRef, useState } from "react";
import { Paperclip, Wallet } from "@buleje/design-system/icons";
import { toast } from "sonner";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { Field } from "@/components/admin/shared/Field";
import { ModalFooter } from "@/components/admin/shared/ModalFooter";
import { AREA_TEXTO, CAMPO_ALTO } from "@/components/admin/planificacion/piezas/clases";
import { button } from "@/components/ui-system/button-variants";
import { MEDIOS_PAGO_ALQUILER, type AlquilerDto, type MedioPagoAlquiler } from "@/lib/admin/fichas-tramites-alquileres";
import { hoyKey } from "../comun/fechas";
import { registrarPago } from "./alquileres-api";
import { MEDIO_UI, periodosDelContrato, textoPeriodo } from "./alquileres-ui";
import { colgarComprobante } from "./papeles-alquiler";

interface Props {
  a: AlquilerDto;
  periodo: string;
  onRegistrado: (a: AlquilerDto) => void;
  onCerrar: () => void;
}

export function RegistrarPagoModal({ a, periodo: inicial, onRegistrado, onCerrar }: Props) {
  const formId = useId();
  const hoy = hoyKey();
  const archivoRef = useRef<HTMLInputElement>(null);
  const [periodo, setPeriodo] = useState(inicial);
  const [montoTexto, setMontoTexto] = useState(String(a.rentaMensual));
  const [pagadoEl, setPagadoEl] = useState(hoy);
  const [medio, setMedio] = useState<MedioPagoAlquiler>("transferencia");
  const [operacion, setOperacion] = useState("");
  const [notas, setNotas] = useState("");
  const [archivo, setArchivo] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const pagados = new Set(a.pagos.map((p) => p.periodo));
  const periodos = periodosDelContrato(a, hoy.slice(0, 7));
  const yaPagado = pagados.has(periodo);
  const simbolo = a.moneda === "USD" ? "US$" : "S/";

  const guardar = async () => {
    if (yaPagado) return setError("Ese mes ya está pagado: elige otro o corrige el pago desde la grilla.");
    const monto = Number(montoTexto.trim().replace(",", "."));
    if (!Number.isFinite(monto) || monto <= 0) return setError("El monto tiene que ser mayor que cero.");
    if (!pagadoEl) return setError("Pon la fecha en que se pagó.");
    setGuardando(true);
    setError(null);
    const r = await registrarPago(a.id, {
      periodo,
      monto,
      pagadoEl,
      medio,
      numeroOperacion: operacion.trim() || null,
      notas: notas.trim() || null,
    });
    if (!r.ok) {
      setGuardando(false);
      return setError(r.error);
    }
    let alquiler = r.data.alquiler;
    if (r.data.duplicado) toast.info(`El pago de ${textoPeriodo(periodo)} ya estaba anotado igualito.`);
    else toast.success(`Pago de ${textoPeriodo(periodo)} anotado`);
    if (r.data.aviso) toast.warning(r.data.aviso);
    if (archivo && !r.data.pago.comprobanteDocumentId) {
      const c = await colgarComprobante(alquiler, r.data.pago.id, archivo);
      if (c.ok) alquiler = c.alquiler;
      else toast.error(c.error);
    }
    setGuardando(false);
    onRegistrado(alquiler);
    onCerrar();
  };

  return (
    <AdminModal
      open
      aboveModals
      onClose={onCerrar}
      title="Registrar pago"
      description={`${a.nombre} · registro, no mueve caja`}
      icon={Wallet}
      size="md"
      footer={
        <ModalFooter error={error ?? (yaPagado ? "Ese mes ya está pagado." : null)} atajo={!error && !yaPagado}>
          <button type="button" className={button({ variant: "secondary" })} onClick={onCerrar}>
            Cancelar
          </button>
          <button type="submit" form={formId} className={button({ variant: "primary" })} disabled={guardando || yaPagado}>
            {guardando ? "Guardando…" : "Registrar pago"}
          </button>
        </ModalFooter>
      }
    >
      <form
        id={formId}
        className={`${MODAL_BODY} space-y-4`}
        onSubmit={(e) => {
          e.preventDefault();
          void guardar();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            void guardar();
          }
        }}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Mes que se paga" required>
            <select className={CAMPO_ALTO} value={periodo} onChange={(e) => (setError(null), setPeriodo(e.target.value))}>
              {periodos.map((p) => (
                <option key={p} value={p} disabled={pagados.has(p) && p !== periodo}>
                  {textoPeriodo(p)}
                  {pagados.has(p) ? " (pagado)" : ""}
                </option>
              ))}
            </select>
          </Field>
          <Field label={`Monto (${simbolo})`} required hint="Viene la renta del contrato; cámbialo si pagó otro monto">
            <input type="text" className={CAMPO_ALTO} value={montoTexto} inputMode="decimal" onChange={(e) => setMontoTexto(e.target.value)} />
          </Field>
          <Field label="Se pagó el" required>
            <input type="date" className={CAMPO_ALTO} value={pagadoEl} onChange={(e) => setPagadoEl(e.target.value)} />
          </Field>
          <Field label="Cómo se pagó">
            <select className={CAMPO_ALTO} value={medio} onChange={(e) => setMedio(e.target.value as MedioPagoAlquiler)}>
              {MEDIOS_PAGO_ALQUILER.map((m) => (
                <option key={m} value={m}>
                  {MEDIO_UI[m]}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="N.º de operación" hint="El que sale en la constancia del banco o de Yape">
          <input type="text" className={CAMPO_ALTO} value={operacion} onChange={(e) => setOperacion(e.target.value)} />
        </Field>
        <Field label="Notas">
          <textarea className={AREA_TEXTO} value={notas} onChange={(e) => setNotas(e.target.value)} />
        </Field>
        <div className="flex flex-wrap items-center gap-3">
          <input ref={archivoRef} type="file" className="sr-only" tabIndex={-1} accept="image/*,application/pdf" onChange={(e) => setArchivo(e.target.files?.[0] ?? null)} />
          <button type="button" className={button({ variant: "secondary" })} onClick={() => archivoRef.current?.click()}>
            <Paperclip className="size-4" aria-hidden="true" />
            {archivo ? "Cambiar el comprobante" : "Adjuntar el comprobante"}
          </button>
          {archivo && <span className="min-w-0 truncate text-sm text-[var(--text-secondary)]">{archivo.name}</span>}
        </div>
      </form>
    </AdminModal>
  );
}
