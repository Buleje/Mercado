"use client";

/**
 * Asiento manual / de apertura. Cada fila es una cuenta con su Debe o su Haber;
 * abajo, el total que cuadra en vivo. No deja guardar si no cuadra (el servidor
 * valida igual). Solo se pueden elegir cuentas imputables del plan.
 */
import { useMemo } from "react";
import { Plus, Scale, X } from "@buleje/design-system/icons";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { ModalFooter } from "@/components/admin/shared/ModalFooter";
import { button } from "@/components/ui-system/button-variants";
import { useContabilidad } from "@/hooks/use-contabilidad-datos";
import { useAsientoManual } from "@/hooks/use-asiento-manual";
import type { Asiento, RespuestaPlan, TipoAsientoManual } from "@/lib/contabilidad/tipos";
import BuscadorDeCuenta from "./BuscadorDeCuenta";
import { Cuadra, soles } from "./compartido";
import { CAMPO, ETIQUETA } from "./campos";

interface Props {
  open: boolean;
  tipo: TipoAsientoManual;
  /** `YYYY-MM-DD` con que arranca el formulario (el último día del mes mirado si es pasado; si no, hoy). */
  fecha: string;
  onClose: () => void;
  onGuardado: (a: Asiento) => void;
}

export default function AsientoManualModal({ open, tipo, fecha: fechaInicial, onClose, onGuardado }: Props) {
  const plan = useContabilidad<RespuestaPlan>(open ? "plan" : null);
  const imputables = useMemo(() => (plan.datos?.cuentas ?? []).filter((c) => c.imputable && c.activa), [plan.datos]);
  const f = useAsientoManual(open, tipo, fechaInicial, onGuardado);
  const esApertura = tipo === "apertura";

  return (
    <AdminModal
      open={open}
      onClose={onClose}
      title={esApertura ? "Asiento de apertura" : "Asiento manual"}
      icon={Scale}
      variant="wide"
      claveVentana={`contabilidad-asiento-${tipo}`}
      footer={
        <ModalFooter error={f.error} nota={!f.error && !f.cuadra ? "El Debe y el Haber tienen que ser iguales para guardar." : undefined}>
          <button type="button" onClick={onClose} className={button({ variant: "secondary", className: "px-4" })}>Cancelar</button>
          <button type="button" onClick={f.guardar} disabled={!f.puedeGuardar} className={button({ variant: "accent", className: "px-5" })}>
            {f.enviando ? "Guardando…" : "Guardar asiento"}
          </button>
        </ModalFooter>
      }
    >
      <div className={`${MODAL_BODY} space-y-4`}>
        <p className="text-sm text-[var(--text-secondary)]">
          {esApertura
            ? "Aquí dices con qué plata y deudas empezó el negocio: lo que tienes va al Debe, lo que debes y tu capital van al Haber."
            : "Un asiento es un movimiento escrito en dos lados: lo que entra a una cuenta va al Debe, lo que sale va al Haber. Los dos lados tienen que sumar igual."}
        </p>
        {f.avisoSugerido && <p role="status" className="rounded-xl bg-[var(--surface-sunken)] px-3 py-2 text-sm text-[var(--text-primary)]">{f.avisoSugerido}</p>}
        {plan.error && <p role="alert" className="text-sm font-semibold text-[var(--data-error-ink)]">{plan.error}</p>}

        <div className="grid gap-3 sm:grid-cols-[11rem_minmax(0,1fr)]">
          <label>
            <span className={ETIQUETA}>Fecha</span>
            <input type="date" className={CAMPO} value={f.fecha} onChange={(e) => f.setFecha(e.target.value)} />
          </label>
          <label>
            <span className={ETIQUETA}>Glosa (qué es)</span>
            <input type="text" className={CAMPO} value={f.glosa} maxLength={160} placeholder="Ej.: Depreciación de la sierra, octubre" onChange={(e) => f.setGlosa(e.target.value)} />
          </label>
        </div>

        <div className="space-y-3">
          <div className="hidden gap-2 text-sm font-semibold text-[var(--text-secondary)] sm:grid sm:grid-cols-[minmax(0,1fr)_8rem_8rem_3rem]">
            <span>Cuenta</span><span className="text-right">Debe</span><span className="text-right">Haber</span><span />
          </div>
          {f.cargandoSugerido && <p className="text-sm text-[var(--text-secondary)]">Buscando la sugerencia…</p>}
          {f.filas.map((fila, i) => (
            <div key={fila.id} className="grid gap-2 border-b border-[var(--rule-soft)] pb-3 sm:grid-cols-[minmax(0,1fr)_8rem_8rem_3rem] sm:border-0 sm:pb-0">
              <BuscadorDeCuenta cuentas={imputables} valor={fila.cuenta} etiqueta={`Cuenta de la línea ${i + 1}`} onElegir={(c) => f.cambiar(fila.id, { cuenta: c })} />
              <input inputMode="decimal" aria-label={`Debe de la línea ${i + 1}`} placeholder="Debe" className={`${CAMPO} text-right tabular-nums`} value={fila.debe} onChange={(e) => f.cambiar(fila.id, { debe: e.target.value })} />
              <input inputMode="decimal" aria-label={`Haber de la línea ${i + 1}`} placeholder="Haber" className={`${CAMPO} text-right tabular-nums`} value={fila.haber} onChange={(e) => f.cambiar(fila.id, { haber: e.target.value })} />
              <button type="button" onClick={() => f.quitar(fila.id)} disabled={f.filas.length <= 2} aria-label={`Quitar la línea ${i + 1}`} className={button({ variant: "ghost", size: "icon", className: "h-12 w-12 rounded-xl" })}>
                <X className="h-4 w-4" aria-hidden />
              </button>
              {Math.abs(f.diferencia) >= 0.005 && (
                <button type="button" onClick={() => f.completar(fila.id)} className="justify-self-start text-left text-sm font-semibold text-[var(--accent-dark)] underline-offset-4 hover:underline sm:col-span-4">
                  Poner lo que falta para cuadrar en esta línea
                </button>
              )}
            </div>
          ))}
          <button type="button" onClick={f.agregar} className={button({ variant: "secondary", className: "gap-2 rounded-xl px-4" })}>
            <Plus className="h-4 w-4" aria-hidden />Agregar línea
          </button>
        </div>

        <div className="grid grid-cols-2 items-center gap-2 border-t border-[var(--rule-base)] pt-3 text-sm font-extrabold tabular-nums sm:grid-cols-[minmax(0,1fr)_8rem_8rem_3rem]">
          <span className="col-span-2 font-bold sm:col-span-1"><Cuadra ok={f.cuadra} diferencia={f.cuadra ? undefined : Math.abs(f.diferencia)} /></span>
          <span className="text-right text-[var(--text-primary)]"><span className="font-semibold sm:hidden">Debe </span>{soles(f.totales.debe)}</span>
          <span className="text-right text-[var(--text-primary)]"><span className="font-semibold sm:hidden">Haber </span>{soles(f.totales.haber)}</span>
          <span className="hidden sm:block" />
        </div>
      </div>
    </AdminModal>
  );
}
