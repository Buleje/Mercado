"use client";

/**
 * LineaDeTiempo — los objetivos por trimestre (ADR-497): una columna por
 * trimestre en orden («ene–mar 2027»), el de hoy marcado y «Sin fecha» al
 * final. El scroll horizontal vive sólo dentro del riel; la página no se
 * corre a 400 px. Tocar un objetivo lo abre en la lista.
 */
import { useMemo } from "react";
import { irAEnlace } from "@/components/admin/shared/ir-a-enlace";
import { Button } from "@/components/ui-system/Button";
import { useSeccionPlan } from "@/hooks/use-plan-empresa";
import { avanceObjetivo, objetivoAtrasado, trimestreDe } from "@/lib/planificacion/calculos";
import { cn, limaDateKey } from "@/lib/utils";
import { CabeceraSeccion } from "../comun/CabeceraSeccion";
import { BARRA_TONO, PASTILLA, PASTILLA_TONO, TARJETA } from "../piezas/clases";
import { EstadoVacio } from "../piezas/EstadoVacio";
import { nombreTrimestre, trimestreDeFecha, trimestreSiguiente } from "../piezas/fechas";
import { ESTADO_OBJETIVO, enlaceObjetivo, type Objetivo } from "./objetivos-config";

/** Con más trimestres que esto entre el primero y el último, sólo se muestran los que tienen algo. */
const MAX_HUECOS = 8;
const SIN_FECHA = "sin-fecha";

function columnas(items: readonly Objetivo[], ahora: string): string[] {
  const conFecha = [...new Set([...items.map(trimestreDe).filter((t) => t !== SIN_FECHA), ahora])].sort();
  const primero = conFecha[0];
  const ultimo = conFecha[conFecha.length - 1];
  const todas: string[] = [];
  for (let t = primero; t <= ultimo && todas.length <= MAX_HUECOS; t = trimestreSiguiente(t)) todas.push(t);
  const cols = todas.length <= MAX_HUECOS ? todas : conFecha;
  return items.some((o) => trimestreDe(o) === SIN_FECHA) ? [...cols, SIN_FECHA] : cols;
}

export function LineaDeTiempo({ irALista }: { irALista: () => void }) {
  const { datos } = useSeccionPlan("objetivos");
  const hoy = limaDateKey();
  const ahora = trimestreDeFecha(hoy);
  const items = datos.items;
  const cols = useMemo(() => columnas(items, ahora), [items, ahora]);

  return (
    <div className="space-y-3">
      <CabeceraSeccion
        seccion="objetivos"
        titulo="Línea de tiempo"
        ayuda="Tus objetivos ordenados por el trimestre en que terminan (o empiezan, si no tienen fin). Desliza a los costados para ver más."
        ejemplo="Un objetivo que termina el 15/02/2027 va en «ene–mar 2027»."
      />
      {items.length === 0 ? (
        <EstadoVacio frase="Sin objetivos todavía: escríbelos en la lista y aparecen acá por trimestre.">
          <Button variant="secondary" onClick={irALista}>
            Ir a la lista
          </Button>
        </EstadoVacio>
      ) : (
        <div className="overflow-x-auto pb-2" tabIndex={0} role="region" aria-label="Línea de tiempo de los objetivos">
          <ol className="flex w-max gap-3">
            {cols.map((t) => {
              const deEste = items.filter((o) => trimestreDe(o) === t);
              const esAhora = t === ahora;
              return (
                <li
                  key={t}
                  className={cn(
                    "flex w-72 shrink-0 flex-col gap-2 rounded-xl border bg-[var(--surface-sunken)] p-3",
                    esAhora ? "border-[var(--accent)]" : "border-[var(--rule-base)]",
                  )}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-[var(--text-primary)]">{nombreTrimestre(t)}</span>
                    {esAhora && <span className={cn(PASTILLA, "bg-[var(--accent-soft)] text-[var(--accent-ink)] dark:text-[var(--accent)]")}>Ahora</span>}
                    <span className="ml-auto text-xs text-[var(--text-tertiary)] tabular-nums">{deEste.length}</span>
                  </div>
                  {deEste.length === 0 ? (
                    <span className="py-2 text-sm text-[var(--text-tertiary)]">Nada para este trimestre.</span>
                  ) : (
                    <ul className="space-y-2">
                      {deEste.map((o) => (
                        <TarjetaLinea key={o.id} objetivo={o} hoy={hoy} />
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ol>
        </div>
      )}
    </div>
  );
}

function TarjetaLinea({ objetivo: o, hoy }: { objetivo: Objetivo; hoy: string }) {
  const avance = avanceObjetivo(o);
  const atrasado = objetivoAtrasado(o, hoy);
  const estado = ESTADO_OBJETIVO[o.estado];
  const barra = o.estado === "hecho" ? "exito" : atrasado ? "error" : "info";
  return (
    <li>
      <button
        type="button"
        onClick={() => irAEnlace(enlaceObjetivo(o.id))}
        className={cn(TARJETA, "block w-full p-3 text-left transition-colors hover:border-[var(--accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40")}
      >
        <span className="block text-sm font-semibold leading-snug text-[var(--text-primary)]">{o.titulo || "Sin título"}</span>
        <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <span className={cn(PASTILLA, PASTILLA_TONO[estado.tono])}>{estado.nombre}</span>
          {atrasado && <span className={cn(PASTILLA, PASTILLA_TONO.error)}>Atrasado</span>}
        </span>
        <span className="mt-2 flex items-center gap-2">
          <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--surface-sunken)]" aria-hidden>
            <span className={cn("block h-full rounded-full", BARRA_TONO[barra])} style={{ width: `${avance}%` }} />
          </span>
          <span className="text-xs text-[var(--text-secondary)] tabular-nums">{avance} %</span>
        </span>
      </button>
    </li>
  );
}
