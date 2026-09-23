"use client";

/**
 * La fila de arriba de la tira del registro (`CtpSemanaDeRegistro`): el título,
 * la semana con sus flechas, «Hoy» y el botón de plegar.
 *
 * Plegada (Brandon, 2026-09-23: «poder ocultar y mostrar la sección de día de
 * registro») la fila es TODA la tira: dice el día elegido y lo que ya tiene,
 * porque no se puede perder de vista a qué día va el registro.
 */

import {
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Loader2,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { fmtM3, fmtPiezas, fmtPt } from "@/lib/forestal/cubicacion-formato";
import {
  correrSemanas,
  esIsoValido,
  etiquetaLarga,
  tituloDeLaSemana,
} from "@/lib/forestal/semana-de-registro";
import type { JornadaDeProduccion } from "./hooks/use-jornadas-produccion";
import { cuantos, type NombreDeLaTira } from "./tira-de-dias-copy";

const BOTON_FLECHA =
  "grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-[var(--rule-base)] text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--accent-ink)] dark:hover:text-[var(--accent)]";
/* El «Ocultar» de «Cargar piezas» y del precio, con su palabra: un chevrón
   solo no se leía como «esconder la sección» (Brandon lo volvió a pedir el
   mismo día que ya existía). */
const BOTON_PLEGAR =
  "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-[var(--rule-base)] px-2.5 text-xs font-bold text-[var(--text-tertiary)] transition hover:border-[var(--accent)] hover:text-[var(--text-primary)]";

export default function CtpCabeceraDeLaTira({
  nombre,
  valor,
  jornadaElegida,
  base,
  cargando,
  error,
  elegidoFuera,
  plegada,
  setPlegada,
  idCuerpo,
  onSemana,
  onHoy,
  totalSemana = null,
}: {
  nombre: NombreDeLaTira;
  /** El día elegido. */
  valor: string;
  jornadaElegida: JornadaDeProduccion | undefined;
  /** Un día de la semana a la vista. */
  base: string;
  cargando: boolean;
  /** No se pudo leer lo ya producido: plegada no puede afirmar «sin nada». */
  error: string | null;
  /** El día elegido no está en la semana que se leyó: tampoco se sabe qué tiene. */
  elegidoFuera: boolean;
  plegada: boolean;
  setPlegada: (fn: (p: boolean) => boolean) => void;
  idCuerpo: string;
  onSemana: (iso: string) => void;
  onHoy: () => void;
  /** Lo de la semana a la vista, sumado de sus casilleros. `null` = cargando o falló. */
  totalSemana?: { corridas: number; pt: number; m3: number; piezas: number } | null;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <CalendarDays className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]" aria-hidden />
      <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--text-tertiary)]">
        {nombre.titulo}
      </span>
      {plegada && esIsoValido(valor) && (
        /* Plegada, la tira es UNA línea con el día elegido y lo que ya tiene:
             no se puede perder de vista a qué día va el registro. */
        /* A 400 px baja a su propio renglón y el botón queda arriba, a la
             derecha: si no, el botón caía a un tercer renglón (92 px). */
        <span className="min-w-0 text-sm max-sm:order-last max-sm:basis-full">
          <b className="inline-block text-[var(--text-primary)] first-letter:uppercase">
            {etiquetaLarga(valor)}
          </b>
          {/* «Sin nada» sólo cuando se SABE (revisión 23-09): con la lectura
              fallada, a medio cargar o mirando otra semana, decirlo sería
              afirmar un dato que la tira no tiene. */}
          {jornadaElegida ? (
            <span className="text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
              {" "}
              · ya tiene {cuantos(jornadaElegida.corridas, nombre)}
              {jornadaElegida.pt >= 1 ? ` (${fmtPt(jornadaElegida.pt)} PT)` : ""}
            </span>
          ) : error ? (
            <span className="text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
              {" "}
              · no se pudo leer lo ya producido ({error})
            </span>
          ) : cargando ? (
            <span className="text-[var(--text-tertiary)]"> · leyendo lo ya producido…</span>
          ) : elegidoFuera ? (
            <span className="text-[var(--text-tertiary)]">
              {" "}
              · de otra semana: muestra los días para ver lo que tiene
            </span>
          ) : (
            <span className="text-[var(--text-tertiary)]"> · {nombre.ninguno}</span>
          )}
        </span>
      )}
      {/* La semana, en la misma fila que su título: los siete casilleros de
          abajo suman esto. Sólo abierta — plegada la línea habla del día. */}
      {!plegada && totalSemana && (
        <span
          className="rounded-lg border border-[var(--rule-soft)] bg-[var(--surface-raised)] px-2 py-0.5 font-mono text-[length:var(--ts-2xs)] tabular-nums text-[var(--text-secondary)] max-sm:order-last max-sm:basis-full max-sm:text-center"
          title={`La semana: ${cuantos(totalSemana.corridas, nombre)}`}
        >
          {totalSemana.corridas === 0 ? (
            <span className="font-sans text-[var(--text-tertiary)]">Semana sin {nombre.varios}</span>
          ) : (
            <>
              <span className="font-sans font-bold uppercase tracking-wide text-[var(--text-tertiary)]">Semana</span>{" "}
              {/* Como el casillero: «0 PT» se lee «no hay nada», y una corrida
                  chica que redondea a cero sí es algo — ahí se cuentan corridas. */}
              <b className="text-[var(--data-success-700)] dark:text-[var(--data-success-500)]">
                {totalSemana.pt >= 1 ? `${fmtPt(totalSemana.pt)} PT` : cuantos(totalSemana.corridas, nombre)}
              </b>
              {" · "}
              {fmtM3(totalSemana.m3)} m³
              {totalSemana.piezas > 0 && <>{" · "}{fmtPiezas(totalSemana.piezas)} pza</>}
            </>
          )}
        </span>
      )}
      {cargando && (
        <Loader2
          className="h-3.5 w-3.5 animate-spin text-[var(--text-tertiary)]"
          aria-label="Leyendo lo ya producido"
        />
      )}
      <div className="ml-auto flex items-center gap-1.5">
        {!plegada && (
          <>
            <button
              type="button"
              onClick={() => onSemana(correrSemanas(base, -1))}
              aria-label="Semana anterior"
              className={BOTON_FLECHA}
            >
              <ChevronLeft className="h-4 w-4" aria-hidden />
            </button>
            <span className="min-w-[10.5rem] text-center text-xs font-semibold text-[var(--text-secondary)]">
              {tituloDeLaSemana(base)}
            </span>
            <button
              type="button"
              onClick={() => onSemana(correrSemanas(base, 1))}
              aria-label="Semana siguiente"
              className={BOTON_FLECHA}
            >
              <ChevronRight className="h-4 w-4" aria-hidden />
            </button>
            <button
              type="button"
              onClick={onHoy}
              className="h-8 rounded-lg border border-[var(--rule-base)] px-2.5 text-xs font-bold text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--accent-ink)] dark:hover:text-[var(--accent)]"
            >
              Hoy
            </button>
          </>
        )}
        <button
          type="button"
          onClick={() => {
            /* Al plegar mirando otra semana, la tira vuelve a la del día
               elegido: así la línea que queda puede decir lo que ese día tiene. */
            if (!plegada && elegidoFuera) onSemana(valor);
            setPlegada((p) => !p);
          }}
          aria-expanded={!plegada}
          aria-controls={plegada ? undefined : idCuerpo}
          aria-label={
            plegada ? `Mostrar los días (${nombre.titulo.toLowerCase()})` : "Ocultar los días"
          }
          title={
            plegada
              ? "Mostrar la semana para cambiar el día"
              : "Ocultar la semana: queda el día elegido en una línea"
          }
          className={cn(
            BOTON_PLEGAR,
            plegada && "text-[var(--accent-ink)] dark:text-[var(--accent)]",
          )}
        >
          {plegada ? (
            <ChevronDown className="h-3.5 w-3.5" aria-hidden />
          ) : (
            <ChevronUp className="h-3.5 w-3.5" aria-hidden />
          )}
          {plegada ? "Mostrar" : "Ocultar"}
        </button>
      </div>
    </div>
  );
}
