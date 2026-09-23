"use client";

/**
 * Lo que va debajo de los siete casilleros de la tira del registro
 * (`CtpSemanaDeRegistro`): el aviso de «ese día ya tiene…» y, con varios días
 * marcados, el resumen de todos juntos.
 */

import { AlertTriangle, BarChart3, CalendarDays, Layers, Lock } from "@buleje/design-system/icons";
import { fmtM3, fmtPt } from "@/lib/forestal/cubicacion-formato";
import { etiquetaCorta, etiquetaLarga } from "@/lib/forestal/semana-de-registro";
import type { JornadaDeProduccion } from "./hooks/use-jornadas-produccion";
import { cuantos, type NombreDeLaTira } from "./tira-de-dias-copy";
import type { CorteResumen } from "./ctp-resumen-jornadas-tablas";

const BOTON_RESUMEN =
  "inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-bold transition-colors";
const BOTON_RESUMEN_PRINCIPAL = `${BOTON_RESUMEN} border-[var(--accent)] bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]`;
const BOTON_RESUMEN_OTRO = `${BOTON_RESUMEN} border-[var(--rule-base)] text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--accent-ink)] dark:hover:text-[var(--accent)]`;

/** El día elegido YA tiene registros: el aviso que evita cargar la misma jornada dos veces. */
export function AvisoDiaConRegistro({
  valor,
  jornada,
  nombre,
  onVerResumen,
}: {
  valor: string;
  jornada: JornadaDeProduccion;
  nombre: NombreDeLaTira;
  /** Sólo en producción: el resumen lee corridas. */
  onVerResumen?: () => void;
}) {
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1.5 rounded-xl bg-[var(--data-warning-500)]/12 px-3 py-2 text-sm text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
      <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
      {/* `grow basis-[14rem]` y no `flex-1`: con base 0 el texto nunca pedía
          renglón propio y a 400 px quedaba en una columna de once líneas al
          lado del botón. Así, sin lugar, el botón baja. */}
      <span className="min-w-0 grow basis-[14rem]">
        El {etiquetaLarga(valor)} ya tiene{" "}
        <b className="tabular-nums">{cuantos(jornada.corridas, nombre)}</b> ({fmtM3(jornada.m3)} m³
        · {fmtPt(jornada.pt)} PT). {nombre.aviso}
      </span>
      {/* Ver QUÉ salió ese día es lo que resuelve la duda: si el resumen dice
          lo mismo que se está por cargar, es la misma jornada. */}
      {onVerResumen && (
        <button
          type="button"
          onClick={onVerResumen}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-current px-2.5 py-1 text-xs font-bold hover:bg-[var(--surface-raised)]"
        >
          <BarChart3 className="h-3.5 w-3.5" aria-hidden /> Ver qué salió ese día
        </button>
      )}
    </div>
  );
}

/** Varios días marcados: el resumen de todos juntos. */
export function DiasMarcados({
  marcados,
  onLimpiar,
  onResumen,
}: {
  marcados: readonly string[];
  onLimpiar: () => void;
  /** Abre el resumen de los días marcados con ese corte (el modal deja cambiarlo). */
  onResumen: (corte: CorteResumen) => void;
}) {
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1.5 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 py-2 text-sm">
      <span className="min-w-0 grow basis-[12rem] text-[var(--text-secondary)]">
        <b className="tabular-nums">{marcados.length}</b> día
        {marcados.length === 1 ? "" : "s"} marcado{marcados.length === 1 ? "" : "s"}
        {/* Se dicen cuáles: marcando en varias semanas, los de las otras no
            están a la vista y «3 días» no dice cuáles. */}
        <span className="ml-1 text-[var(--text-tertiary)]">
          ({[...marcados].sort().map(etiquetaCorta).join(" · ")})
        </span>
      </span>
      <button
        type="button"
        onClick={onLimpiar}
        className="shrink-0 rounded-lg px-2 py-1 text-xs font-bold text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
      >
        Limpiar
      </button>
      {/* Tres maneras de leer los mismos días (Brandon, 2026-09-23): todos
          juntos por especie, un renglón por día, o cada día abierto en una fila
          por especie y tipo. Van a la vista porque son EL uso de marcar días. */}
      <div role="group" aria-label="Resumen de los días marcados" className="flex flex-wrap items-center gap-1.5">
        <button type="button" onClick={() => onResumen("dia")} className={BOTON_RESUMEN_PRINCIPAL}>
          <CalendarDays className="h-3.5 w-3.5" aria-hidden /> Resumen por día
        </button>
        <button type="button" onClick={() => onResumen("diaEspecie")} className={BOTON_RESUMEN_OTRO}>
          <Layers className="h-3.5 w-3.5" aria-hidden /> Por día, especie y tipo
        </button>
        <button type="button" onClick={() => onResumen("especie")} className={BOTON_RESUMEN_OTRO}>
          <BarChart3 className="h-3.5 w-3.5" aria-hidden /> Por especie de {marcados.length === 1 ? "ese día" : "esos días"}
        </button>
      </div>
      {/* Marcar muchos días es el gesto de «quiero cerrar el mes»: ese camino
          ya existe entero (revisar pendientes, cerrar, bajar el paquete
          oficial) y estaba a cinco clics sin cartel. */}
      {marcados.length >= 5 && (
        <a
          href="/admin?tab=ctp-libro-operaciones&vista=cierre"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-[var(--rule-base)] px-2.5 py-1 text-xs font-bold text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--accent-ink)] dark:hover:text-[var(--accent)]"
        >
          <Lock className="h-3.5 w-3.5" aria-hidden /> ¿Cerrar el mes? Está en Cierre
        </a>
      )}
    </div>
  );
}
