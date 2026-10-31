"use client";

/**
 * «Pago y entrega» del modal «Guardar cubicación» (Brandon 28-10): cómo se
 * paga (contado, crédito, con adelanto u otra), cuánto se adelantó y hasta
 * cuándo se paga y se entrega. SÓLO se anota: sale en la hoja CUB y en
 * Guardadas, no crea cobros, adelantos ni movimientos de caja.
 */
import { useState } from "react";
import { CardTitle } from "@buleje/design-system";
import { AlertTriangle } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { button } from "@/components/ui-system/button-variants";
import { CONDICIONES_PAGO, FICHA_MAX, type FichaCubicacion } from "@/lib/forestal/cubicacion-registro";
import { fmtSoles } from "@/lib/forestal/cubicacion-formato";
import { limpiarSoles, porCobrar, solesConDosDecimales } from "@/lib/forestal/cubicacion-pago";
import { CAMPO_CUENTA as CAMPO, ETIQUETA_CUENTA as ETIQUETA } from "./cubicacion-cuenta-persona";
import type { DatosDeLaCubicacion } from "./cubicador-guardar-tipos";

type Actualizar = (fn: (d: DatosDeLaCubicacion) => DatosDeLaCubicacion) => void;

const OTRA = "Otra";
const OPCIONES = [...CONDICIONES_PAGO, OTRA] as const;
const esConocida = (v: string | undefined) => (CONDICIONES_PAGO as readonly string[]).includes(v?.trim() ?? "");

/* La marcada es la tarjeta en relieve sobre la pista hundida (como `CampoSentidoCuenta`). */
const MARCADA = "rounded-xl px-2 font-bold shadow-[var(--shadow-sm)]";
const SUELTA = "rounded-xl px-2 font-bold";

export default function PagoDeGuardar({ datos, actualizar, importe }: {
  datos: DatosDeLaCubicacion;
  actualizar: Actualizar;
  /** El importe del lote con los precios de ahora (`null` sin precio): para «Por cobrar». */
  importe?: number | null;
}) {
  const { ficha } = datos;
  const condicion = ficha.condicionPago ?? "";
  /* «Otra» se marca al tocarla aunque todavía no se haya escrito nada. */
  const [otra, setOtra] = useState(() => condicion.trim() !== "" && !esConocida(condicion));
  const elegida = otra ? OTRA : esConocida(condicion) ? condicion.trim() : "";
  const ponerFicha = (patch: Partial<FichaCubicacion>) => actualizar((d) => ({ ...d, ficha: { ...d.ficha, ...patch } }));

  const elegir = (op: (typeof OPCIONES)[number]) => {
    if (op === elegida) {
      /* Tocar la marcada la desmarca: la condición es opcional. */
      setOtra(false);
      ponerFicha({ condicionPago: "" });
      return;
    }
    setOtra(op === OTRA);
    ponerFicha({ condicionPago: op === OTRA ? "" : op });
  };

  const falta = porCobrar(importe, ficha.adelanto);

  return (
    <section aria-labelledby="cubg-pago" className="min-w-0 space-y-3" data-bloque="pago-y-entrega">
      <div className="flex items-center gap-1.5">
        <CardTitle as="h3" id="cubg-pago">Pago y entrega</CardTitle>
        <InfoTip
          what="Cómo y hasta cuándo te pagan, cuánto adelantaron y cuándo se entrega la madera. Sale en la hoja CUB y en Guardadas."
          affects="Sólo se anota: no registra el cobro, no crea un adelanto ni mueve la caja. Lo que de verdad te pagan se registra donde siempre."
          example="Importe S/ 5,000.00 y adelanto S/ 1,500.00 → por cobrar S/ 3,500.00."
        />
      </div>
      <div role="radiogroup" aria-label="Condición de pago">
        <span className={ETIQUETA}>Condición de pago</span>
        <div className="grid grid-cols-2 gap-1 rounded-2xl bg-[var(--surface-sunken)] p-1 sm:grid-cols-4">
          {OPCIONES.map((op) => (
            <button key={op} type="button" role="radio" aria-checked={elegida === op} data-condicion={op}
              onClick={() => elegir(op)}
              className={button({ variant: elegida === op ? "secondary" : "ghost", className: elegida === op ? MARCADA : SUELTA })}>
              {op}
            </button>
          ))}
        </div>
      </div>
      {otra && (
        <div>
          <label htmlFor="cubg-condicion-otra" className={ETIQUETA}>¿Cómo se paga?</label>
          <input id="cubg-condicion-otra" className={CAMPO} value={condicion} maxLength={FICHA_MAX}
            placeholder="Ej.: mitad al cargar, mitad en Lima" onChange={(e) => ponerFicha({ condicionPago: e.target.value })} />
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label htmlFor="cubg-adelanto" className={ETIQUETA}>Adelanto (S/)</label>
          <input id="cubg-adelanto" inputMode="decimal" className={`${CAMPO} text-right tabular-nums`} value={ficha.adelanto ?? ""}
            maxLength={14} placeholder="0.00" autoComplete="off"
            onChange={(e) => ponerFicha({ adelanto: limpiarSoles(e.target.value) })}
            onBlur={(e) => ponerFicha({ adelanto: solesConDosDecimales(e.target.value) })} />
        </div>
        <div>
          <label htmlFor="cubg-fecha-pago" className={ETIQUETA}>Paga hasta</label>
          <input id="cubg-fecha-pago" type="date" className={CAMPO} value={ficha.fechaPago ?? ""}
            onChange={(e) => ponerFicha({ fechaPago: e.target.value })} />
        </div>
        <div>
          <label htmlFor="cubg-fecha-entrega" className={ETIQUETA}>Se entrega</label>
          <input id="cubg-fecha-entrega" type="date" className={CAMPO} value={ficha.fechaEntrega ?? ""}
            onChange={(e) => ponerFicha({ fechaEntrega: e.target.value })} />
        </div>
      </div>
      {falta !== null && (
        falta >= 0 ? (
          <p role="status" data-por-cobrar={falta.toFixed(2)} className="text-base font-bold tabular-nums text-[var(--text-primary)]">
            Por cobrar: S/ {fmtSoles(falta)}
            <span className="ml-1.5 text-sm font-normal text-[var(--text-tertiary)]">(importe − adelanto, sólo anotado)</span>
          </p>
        ) : (
          <p role="alert" data-por-cobrar={falta.toFixed(2)} className="flex items-start gap-1.5 text-sm font-semibold text-[var(--data-warning-ink)]">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            El adelanto pasa el importe por S/ {fmtSoles(-falta)}. Revisa el adelanto o los precios.
          </p>
        )
      )}
    </section>
  );
}
