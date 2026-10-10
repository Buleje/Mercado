"use client";

/**
 * LothMapaPlanPanel — el panel del PLANIFICADOR de extracción, flotando sobre
 * el mapa (a la derecha en la computadora, una hoja abajo en el celular): no
 * es un modal, el mapa sigue vivo detrás y el patio se arrastra ahí mismo.
 *
 * Orden por pregunta: los avisos arriba (la parcela lejos de los árboles,
 * OpenStreetMap sin respuesta, sin ríos), después los parámetros y «Proponer»,
 * el resultado en tarjetas y, al pie, de dónde salen los datos y «Actualizar
 * geografía». Escape lo cierra.
 */

import { useState } from "react";
import { CardTitle } from "@buleje/design-system";
import { Loader2, RefreshCw, TriangleAlert, Wand2, X } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { formatDateShort } from "@/lib/format";
import LothMapaPlanResultado from "./LothMapaPlanResultado";
import type { LothPlanificador, ParamsPlan } from "./hooks/use-loth-planificador";

interface Props {
  plan: LothPlanificador;
  onCerrar: () => void;
}

const CAMPO = "block text-xs font-semibold text-[var(--text-tertiary)]";
const INPUT =
  "mt-0.5 h-9 w-full rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-2 text-sm font-bold tabular-nums text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/30";
const SEG = "h-9 flex-1 rounded-lg px-2 text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40";
const BTN_ICONO =
  "inline-flex h-10 w-10 flex-none items-center justify-center rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40";

const CAMPOS: { clave: Exclude<keyof ParamsPlan, "soloEnPie">; rotulo: string; unidad: string; min: number; max: number; ayuda: string }[] = [
  { clave: "pendienteMax", rotulo: "Pendiente máx.", unidad: "%", min: 5, max: 100, ayuda: "Más empinado que esto, el tractor no arrastra." },
  { clave: "fajaRio", rotulo: "Faja de río", unidad: "m", min: 0, max: 500, ayuda: "A cada lado del río: ahí no va patio, campamento ni tala." },
  { clave: "fajaQuebrada", rotulo: "Faja de quebrada", unidad: "m", min: 0, max: 500, ayuda: "A cada lado de la quebrada. La ANA fija el ancho real." },
];

const fecha = (iso: string | null) => (iso ? formatDateShort(iso) : null);

export default function LothMapaPlanPanel({ plan, onCerrar }: Props) {
  const { params, setParams, respuesta, cargando, error, geo, geoCargando, geoError } = plan;
  /** Los avisos, una línea cada uno; tocarlos los despliega enteros. */
  const [avisosAbiertos, setAvisosAbiertos] = useState(false);
  const fuentes = geo?.fuentes ?? respuesta?.geografia?.fuentes ?? null;
  // Avisos: los de la geografía (llegan también dentro de la propuesta) sin repetir.
  const avisos = [...new Set([...(respuesta?.propuesta.avisos ?? geo?.avisos ?? []), ...(geoError ? [`No se pudo leer la geografía: ${geoError}`] : [])])];
  const cambiar = (clave: Exclude<keyof ParamsPlan, "soloEnPie">, v: string, min: number, max: number) => {
    const n = Number(v);
    if (!Number.isFinite(n)) return;
    setParams((p) => ({ ...p, [clave]: Math.min(max, Math.max(min, n)) }));
  };

  return (
    <section
      aria-labelledby="loth-plan-titulo"
      data-tapa-mapa
      data-panel-planificador
      onKeyDown={(e) => {
        if (e.key !== "Escape") return;
        e.preventDefault();
        onCerrar();
      }}
      className="absolute right-3 top-3 z-[29] flex max-h-[calc(100%-1.5rem)] w-[23rem] flex-col overflow-hidden rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] shadow-[var(--shadow-lg)] max-sm:inset-x-2 max-sm:bottom-2 max-sm:top-auto max-sm:max-h-[62%] max-sm:w-auto"
    >
      <header className="flex items-center gap-1.5 border-b border-[var(--rule-soft)] px-3 py-2">
        <Wand2 className="h-4 w-4 flex-none text-[var(--accent)]" aria-hidden="true" />
        <CardTitle id="loth-plan-titulo" className="text-sm font-bold min-w-0 flex-1 truncate">
          Planificar la extracción
        </CardTitle>
        <InfoTip
          title="Planificar la extracción"
          what="Propone el patio de acopio, el campamento, las trochas de arrastre y el camino de salida según el relieve, los ríos y los caminos de la zona."
          affects="Nada se guarda hasta «Agregar al plano»; después lo ves en «Referencias, vías y acceso» y se imprime en el plano."
          example="Arrastra el patio en el mapa: las trochas, el campamento y el camino se recalculan solos."
          side="left"
        />
        <button type="button" onClick={onCerrar} aria-label="Cerrar el planificador" title="Cerrar (Escape)" className={BTN_ICONO}>
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </header>

      <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto px-3 py-2.5">
        {avisos.length > 0 && (
          <button
            type="button"
            onClick={() => setAvisosAbiertos((v) => !v)}
            aria-expanded={avisosAbiertos}
            aria-label={avisosAbiertos ? "Plegar los avisos" : `Ver ${avisos.length === 1 ? "el aviso" : `los ${avisos.length} avisos`} enteros`}
            className="block w-full space-y-1 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40"
          >
            {avisos.map((a) => (
              <span key={a} className="flex items-start gap-1.5 text-xs font-semibold text-[var(--data-warning-ink)]" title={a}>
                <TriangleAlert className="mt-px h-3.5 w-3.5 flex-none" aria-hidden="true" />
                <span className={avisosAbiertos ? "" : "line-clamp-1"}>{a}</span>
              </span>
            ))}
          </button>
        )}

        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            plan.proponer();
          }}
        >
          <div className="grid grid-cols-3 gap-1.5">
            {CAMPOS.map((c) => (
              <label key={c.clave} className={CAMPO} title={c.ayuda}>
                <span className="truncate">
                  {c.rotulo} <span className="font-normal">({c.unidad})</span>
                </span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={c.min}
                  max={c.max}
                  value={params[c.clave]}
                  onChange={(e) => cambiar(c.clave, e.target.value, c.min, c.max)}
                  className={INPUT}
                />
              </label>
            ))}
          </div>
          <div role="group" aria-label="Qué árboles" className="flex gap-1 rounded-xl bg-[var(--surface-sunken)] p-1">
            {[
              { valor: true, texto: "Sólo en pie" },
              { valor: false, texto: "+ trozas en el monte" },
            ].map((o) => (
              <button
                key={o.texto}
                type="button"
                aria-pressed={params.soloEnPie === o.valor}
                onClick={() => setParams((p) => ({ ...p, soloEnPie: o.valor }))}
                className={`${SEG} ${params.soloEnPie === o.valor ? "bg-[var(--surface-raised)] text-[var(--text-primary)] shadow-[var(--shadow-sm)]" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"}`}
              >
                {o.texto}
              </button>
            ))}
          </div>
          <button
            type="submit"
            disabled={cargando}
            className="inline-flex h-11 w-full items-center justify-center gap-1.5 rounded-xl bg-[var(--accent)] px-4 text-sm font-semibold text-white transition hover:brightness-95 disabled:opacity-60"
          >
            {cargando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Wand2 className="h-4 w-4" aria-hidden="true" />}
            {cargando ? (geoCargando ? "Buscando ríos y caminos…" : "Calculando…") : respuesta ? "Volver a proponer" : "Proponer"}
          </button>
        </form>

        {error && (
          <p role="alert" className="text-xs font-semibold text-[var(--data-error-ink)]">
            No se pudo proponer: {error}
          </p>
        )}

        {respuesta ? (
          respuesta.propuesta.vacia ? (
            <p className="text-sm font-semibold text-[var(--text-secondary)]">{respuesta.propuesta.motivo}</p>
          ) : (
            <LothMapaPlanResultado
              respuesta={respuesta}
              agregado={plan.agregado}
              guardando={plan.guardando}
              cargando={cargando}
              patioMovido={plan.patioFijo !== null}
              onAgregar={() => void plan.agregarAlPlano()}
              onDeshacer={() => void plan.deshacer()}
              onDescartar={plan.descartar}
              onSoltarPatio={plan.soltarPatio}
            />
          )
        ) : (
          !cargando && <p className="text-sm text-[var(--text-secondary)]">Ajusta los parámetros y toca «Proponer».</p>
        )}
      </div>

      <footer className="flex items-center gap-2 border-t border-[var(--rule-soft)] px-3 py-1.5 text-xs text-[var(--text-tertiary)]">
        <p className="min-w-0 flex-1" title="Ríos y caminos de OpenStreetMap · altitud de Open-Meteo (modelo de terreno de 90 m)">
          {geoCargando && !fuentes ? (
            "Buscando ríos y caminos (hasta 1 min la primera vez)…"
          ) : (
            <>
              Ríos y caminos: OpenStreetMap{fecha(fuentes?.osm ?? null) ? `, ${fecha(fuentes?.osm ?? null)}` : " · sin respuesta"} · Altura: Open-Meteo
              {fecha(fuentes?.elevacion ?? null) ? `, ${fecha(fuentes?.elevacion ?? null)}` : " · sin respuesta"}
            </>
          )}
        </p>
        <button
          type="button"
          onClick={plan.actualizarGeografia}
          disabled={geoCargando}
          aria-label="Actualizar geografía"
          title="Volver a pedir los ríos, caminos y la altitud a internet"
          className="inline-flex h-9 flex-none items-center gap-1 rounded-lg px-2 font-semibold text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)] disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${geoCargando ? "animate-spin" : ""}`} aria-hidden="true" />
          <span className="max-sm:hidden">Actualizar</span>
        </button>
      </footer>
    </section>
  );
}
