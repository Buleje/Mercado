"use client";

/**
 * Lo que va debajo de los siete casilleros de la tira del registro
 * (`CtpSemanaDeRegistro`): el aviso de «ese día ya tiene…» y, con varios días
 * marcados, el resumen de todos juntos.
 */

import { AlertTriangle, BarChart3, CalendarDays, Check, FileText, Layers, Loader2, Lock } from "@buleje/design-system/icons";
import { nombreCortoDeDueno } from "@/lib/forestal/dueno-de-la-madera";
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
  duenosDe = {},
  excluidosDe = {},
  onAlternarDueno,
  onAnexo,
  anexoCargando = false,
  anexoAviso = null,
}: {
  marcados: readonly string[];
  onLimpiar: () => void;
  /** Los dueños de cada día marcado (tomados al marcarlo). */
  duenosDe?: Readonly<Record<string, readonly string[]>>;
  /** Los que se sacaron del resumen, por día. */
  excluidosDe?: Readonly<Record<string, readonly string[]>>;
  onAlternarDueno?: (dia: string, dueno: string) => void;
  /** Abre el resumen de los días marcados con ese corte (el modal deja cambiarlo). */
  onResumen: (corte: CorteResumen) => void;
  /**
   * El Anexo 04 de los días marcados, combinados (Brandon, 2026-09-23). Sólo
   * en producción: un consumo o un despacho no tienen piezas que detallar.
   */
  onAnexo?: () => void;
  anexoCargando?: boolean;
  /** Lo que el anexo no pudo llevar (paquetes sin escuadría) o por qué no abrió. */
  anexoAviso?: string | null;
}) {
  const conVarios = [...marcados].sort().filter((d) => (duenosDe[d]?.length ?? 0) > 1);
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
      {/* Un día con dos dueños o más (Brandon, 2026-09-23): se elige cuál entra
          al resumen — uno, el otro o los dos. Van en su propio renglón, debajo:
          son una decisión sobre QUÉ se resume, antes de tocar el botón. */}
      {onAlternarDueno && conVarios.length > 0 && (
        <div className="order-last flex basis-full flex-wrap items-center gap-x-4 gap-y-1.5">
          {conVarios.map((dia) => {
            const fuera = excluidosDe[dia] ?? [];
            return (
              <div key={dia} role="group" aria-label={`Dueños del ${etiquetaLarga(dia)} en el resumen`} className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs text-[var(--text-tertiary)]">{etiquetaCorta(dia)}:</span>
                {(duenosDe[dia] ?? []).map((d) => {
                  const dentro = !fuera.includes(d);
                  return (
                    <button
                      key={d}
                      type="button"
                      aria-pressed={dentro}
                      onClick={() => onAlternarDueno(dia, d)}
                      title={dentro ? `Sacar a ${d} del resumen de ese día` : `Sumar a ${d} al resumen de ese día`}
                      className={
                        dentro
                          ? "inline-flex items-center gap-1 rounded-full border border-[var(--accent)] bg-primary/10 px-2 py-0.5 text-xs font-bold text-[var(--accent-ink)] dark:text-[var(--accent)]"
                          : "inline-flex items-center gap-1 rounded-full border border-dashed border-[var(--rule-base)] px-2 py-0.5 text-xs font-semibold text-[var(--text-tertiary)] line-through hover:text-[var(--text-secondary)]"
                      }
                    >
                      {dentro && <Check className="h-3 w-3" aria-hidden />}
                      {nombreCortoDeDueno(d)}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}
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
        {/* Las piezas de TODOS los días marcados (con los dueños que quedaron
            en los chips) en un solo Anexo 04. */}
        {onAnexo && (
          <button
            type="button"
            onClick={onAnexo}
            disabled={anexoCargando}
            aria-busy={anexoCargando}
            className={`${BOTON_RESUMEN_OTRO} disabled:opacity-60`}
          >
            {anexoCargando ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            ) : (
              <FileText className="h-3.5 w-3.5" aria-hidden />
            )}{" "}
            Anexo 04 de {marcados.length === 1 ? "ese día" : `los ${marcados.length} días`}
          </button>
        )}
      </div>
      {anexoAviso && (
        <p role="status" className="order-last basis-full text-xs text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
          {anexoAviso}
        </p>
      )}
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

/**
 * La ayuda de debajo de la tira cuando el día elegido está libre (o no se pudo
 * leer, o se está mirando otra semana): si el día ya tiene registros, el aviso
 * de arriba dice lo mismo con las cifras.
 */
export function AyudaDeLaTira({
  error,
  elegidoFuera,
  valor,
  nombre,
  esProduccion,
}: {
  error: string | null;
  elegidoFuera: boolean;
  valor: string;
  nombre: NombreDeLaTira;
  esProduccion: boolean;
}) {
  return (
    <p className="mt-1 text-xs leading-snug text-[var(--text-tertiary)]">
      {error ? (
        <span className="text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
          No se pudo leer lo ya producido ({error}). Elige el día igual: el registro no depende de
          este dato.
        </span>
      ) : elegidoFuera ? (
        <>
          Estás viendo otra semana. El registro va al{" "}
          <b className="text-[var(--text-secondary)]">{etiquetaLarga(valor)}</b>.
        </>
      ) : (
        <>
          El día que elijas es la fecha del asiento. Los que ya tienen {nombre.varios} lo dicen en pie
          tablar — dos {nombre.varios} el mismo día es normal, pero repetir{" "}
          {esProduccion ? "la misma corrida" : `el mismo ${nombre.uno}`} no.
        </>
      )}
    </p>
  );
}
