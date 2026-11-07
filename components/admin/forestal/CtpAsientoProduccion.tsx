"use client";

/**
 * Los datos del ASIENTO al declarar una producción sin lote (ADR-429): fecha,
 * línea, permiso con su simulación, observaciones y el cotejo con el SNIFFS.
 *
 * Mudados desde el paso «declarar» que vivía dentro de «Producir sin lote».
 * Son los mismos para todas las corridas que salen de esta declaración (una
 * por especie): el LO-CTP los pide por asiento y acá se escriben una vez.
 *
 * El SNIFFS va plegado y sólo se MONTA abierto: su lector escucha Ctrl+V en
 * todo el documento, y montado a escondidas se quedaba con un pegado que el
 * operador no veía adónde había ido.
 */
import { useState } from "react";
import { ChevronDown } from "@buleje/design-system/icons";
import type { CorridaDeEspecie, PaqueteDeclarable } from "@/lib/forestal/declarar-produccion";
import type { PiezaCubicada } from "@/lib/forestal/cubicacion";
import type { TrozaParaCodigo } from "@/lib/forestal/codigo-de-troza";
import { esIsoValido } from "@/lib/forestal/semana-de-registro";
import { LINEAS_PRODUCCION } from "@/lib/forestal/loctp-catalogos";
import { Field, I } from "./ctp-shared";
import CtpPermisoDelAsiento from "./CtpPermisoDelAsiento";
import CtpSniffsSinLote from "./CtpSniffsSinLote";

export default function CtpAsientoProduccion({
  fecha,
  onFecha,
  linea,
  onLinea,
  permiso,
  onPermiso,
  observaciones,
  onObservaciones,
  corridas,
  paquetes,
  piezas,
  trozas,
  especiesConocidas,
  onUsarEspecie,
}: {
  fecha: string;
  onFecha: (iso: string) => void;
  linea: string;
  onLinea: (v: string) => void;
  permiso: string;
  onPermiso: (v: string) => void;
  observaciones: string;
  onObservaciones: (v: string) => void;
  /** Las que tienen especie: las que se van a declarar. */
  corridas: readonly CorridaDeEspecie[];
  paquetes: readonly PaqueteDeclarable[];
  piezas: readonly PiezaCubicada[];
  trozas: readonly TrozaParaCodigo[];
  especiesConocidas: readonly string[];
  /** El SNIFFS trae la especie y lo cubicado no: se la pone a lo que no tiene. */
  onUsarEspecie: (nombre: string) => void;
}) {
  const [masAbierto, setMasAbierto] = useState(observaciones.trim() !== "");
  /* El cotejo del SNIFFS compara contra UNA especie; con varias, si la leída no
     es ninguna de ellas, se dice que difiere en vez de pedir «ponle especie». */
  const especieUnica = corridas.length > 0 ? corridas.map((c) => c.especie).join(" / ") : null;

  return (
    <>
      <div className="sm:col-span-3">
        <Field label="Fecha de la producción" required>
          <input
            type="date"
            value={fecha}
            onChange={(e) => onFecha(e.target.value)}
            aria-invalid={!esIsoValido(fecha) || undefined}
            className={I}
          />
        </Field>
      </div>
      <div className="sm:col-span-3">
        <Field label="Línea de producción">
          <select value={linea} onChange={(e) => onLinea(e.target.value)} className={I}>
            {LINEAS_PRODUCCION.map((l) => (
              <option key={l.valor} value={l.valor}>
                {l.label}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <p className="self-end pb-1 text-xs leading-snug text-[var(--text-tertiary)] sm:col-span-6">
        {corridas.length > 1
          ? `Se registran ${corridas.length} corridas —una por especie, como pide el Libro— con esta misma fecha, línea y permiso.`
          : "La corrida nace sin consumos y sin lote: vincularle su materia prima es el paso siguiente."}
      </p>

      <CtpPermisoDelAsiento
        permiso={permiso}
        onPermiso={onPermiso}
        corridas={corridas}
        fecha={fecha}
        piezas={piezas}
        trozas={trozas}
      />

      <div className="rounded-xl border border-[var(--rule-base)] sm:col-span-12">
        <button
          type="button"
          aria-expanded={masAbierto}
          onClick={() => setMasAbierto((v) => !v)}
          className="flex min-h-11 w-full items-center gap-2 px-3 text-left text-sm font-semibold text-[var(--text-primary)] hover:bg-[var(--surface-sunken)]"
        >
          <ChevronDown
            className={`h-4 w-4 shrink-0 text-[var(--text-tertiary)] transition-transform ${masAbierto ? "" : "-rotate-90"}`}
            aria-hidden
          />
          Observaciones y cotejo con el SNIFFS
          <span className="ml-auto truncate text-xs font-normal text-[var(--text-tertiary)]">
            {observaciones.trim() ? observaciones.trim().split("\n")[0] : "opcional"}
          </span>
        </button>
        {masAbierto && (
          <div className="space-y-3 border-t border-[var(--rule-base)] p-3">
            <Field label="Observaciones">
              <textarea
                value={observaciones}
                onChange={(e) => onObservaciones(e.target.value)}
                rows={2}
                placeholder="Turno, sierra, quién cortó… lo que haga falta para reconocer esta jornada"
                className={`${I} h-auto py-2`}
              />
            </Field>
            {/* Lo declarado al SNIFFS, para cotejarlo con lo cubicado (ADR-397).
                No arma paquetes: los m³ del Libro salen del pie tablar. */}
            <CtpSniffsSinLote
              paquetes={paquetes}
              especie={especieUnica}
              corridas={corridas}
              especiesConocidas={especiesConocidas}
              fecha={fecha}
              onUsarFecha={onFecha}
              onUsarEspecie={onUsarEspecie}
              onAnotar={(nota) =>
                onObservaciones(observaciones.trim() ? `${observaciones.trim()}\n${nota}` : nota)
              }
            />
          </div>
        )}
      </div>
    </>
  );
}
