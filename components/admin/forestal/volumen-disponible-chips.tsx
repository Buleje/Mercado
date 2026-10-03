"use client";

/**
 * Los dos selectores de «Volumen disponible»: qué pilas se miran (chips con su
 * m³, «Todo» las suma) y de qué permisos. Van pegados, arriba de lo que
 * filtran (ley de organización 5): son los que deciden toda la pantalla.
 */

import { Check } from "@buleje/design-system/icons";
import { CHART_PALETTE } from "@/components/ui-system/charts";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import { formatNumber } from "@/lib/format";
import {
  DETALLE_FUENTE,
  ETIQUETA_FUENTE,
  FUENTES_VOLUMEN,
  UNIDAD_FUENTE,
  sonTodas,
  type FuenteVolumen,
  type OpcionPermiso,
  type ResumenVolumen,
} from "@/lib/forestal/volumen-disponible";

/** El color de cada pila: el mismo en el chip, la barra y la tabla. */
export const COLOR_FUENTE: Record<FuenteVolumen, string> = {
  trozas: CHART_PALETTE.amber,
  lotes: CHART_PALETTE.purple,
  recepcion: CHART_PALETTE.info,
  productos: CHART_PALETTE.accent,
};

const base =
  "inline-flex min-h-12 items-center gap-2 rounded-2xl border-2 px-3 py-1.5 text-left transition-colors";
const tono = (activo: boolean) =>
  activo
    ? "border-[var(--accent)] bg-primary/10"
    : "border-[var(--rule-base)] bg-[var(--surface-raised)] hover:border-[var(--accent)]";

export function SelectorDePilas({
  fuentes,
  porPila,
  cargando,
  onAlternar,
}: {
  fuentes: readonly FuenteVolumen[];
  /** Cada pila con el filtro de permiso puesto (elegida o no). */
  porPila: ResumenVolumen;
  cargando: boolean;
  onAlternar: (f: FuenteVolumen | "todo") => void;
}) {
  const todas = sonTodas(fuentes);
  const valor = (m3: number) => (cargando ? "…" : `${fmtM3(m3)} m³`);
  return (
    <div role="group" aria-label="Qué volumen mirar" className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => onAlternar("todo")}
        aria-pressed={todas}
        className={`${base} ${tono(todas)}`}
      >
        {todas && <Check className="h-4 w-4 shrink-0 text-[var(--accent-ink)] dark:text-[var(--accent)]" aria-hidden />}
        <span className="flex flex-col leading-tight">
          <span className="text-sm font-bold text-[var(--text-primary)]">Todo</span>
          <span className="text-sm tabular-nums text-[var(--text-secondary)]">
            {valor(porPila.total.m3)}
          </span>
        </span>
      </button>
      <span aria-hidden className="mx-0.5 h-8 w-px bg-[var(--rule-base)]" />
      {FUENTES_VOLUMEN.map((f) => {
        const activo = !todas && fuentes.includes(f);
        const p = porPila.porFuente[f];
        return (
          <button
            key={f}
            type="button"
            onClick={() => onAlternar(f)}
            aria-pressed={activo}
            title={`${ETIQUETA_FUENTE[f]}: ${DETALLE_FUENTE[f]}`}
            aria-label={`${ETIQUETA_FUENTE[f]}, ${DETALLE_FUENTE[f]}: ${cargando ? "leyendo" : `${fmtM3(p.m3)} m³ en ${formatNumber(p.unidades)} ${UNIDAD_FUENTE[f][p.unidades === 1 ? 0 : 1]}`}`}
            className={`${base} ${tono(activo)}`}
          >
            {activo ? (
              <Check className="h-4 w-4 shrink-0 text-[var(--accent-ink)] dark:text-[var(--accent)]" aria-hidden />
            ) : (
              <span aria-hidden className="h-3 w-3 shrink-0 rounded-full" style={{ background: COLOR_FUENTE[f] }} />
            )}
            <span className="flex flex-col leading-tight">
              <span className="text-sm font-bold text-[var(--text-primary)]">{ETIQUETA_FUENTE[f]}</span>
              <span className="text-sm tabular-nums text-[var(--text-secondary)]">
                {valor(p.m3)}
                {!cargando && p.unidades > 0 && (
                  <span className="max-sm:hidden"> · {formatNumber(p.unidades)} {UNIDAD_FUENTE[f][p.unidades === 1 ? 0 : 1]}</span>
                )}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * Los permisos para acotar las cuatro pilas a la vez. Sólo aparece si hay
 * entre qué elegir: con todo «sin permiso» (o uno solo) no filtra nada. Con un
 * permiso puesto se queda SIEMPRE: si su madera se despachó entera, «Todos» es
 * la única salida de una pantalla en cero.
 */
export function FiltroDePermisos({
  opciones,
  elegidos,
  onAlternar,
  onTodos,
}: {
  opciones: readonly OpcionPermiso[];
  elegidos: readonly string[];
  onAlternar: (clave: string) => void;
  onTodos: () => void;
}) {
  if (opciones.length < 2 && elegidos.length === 0) return null;
  const chip =
    "inline-flex h-10 items-center gap-1.5 rounded-xl border-2 px-3 text-sm font-bold transition-colors";
  const color = (activo: boolean) =>
    activo
      ? "border-[var(--accent)] bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]"
      : "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-primary)] hover:border-[var(--accent)]";
  return (
    <div role="group" aria-label="Filtrar por permiso" className="flex flex-wrap items-center gap-2">
      <span className="text-sm font-bold text-[var(--text-secondary)]">Permiso</span>
      <button type="button" onClick={onTodos} aria-pressed={elegidos.length === 0} className={`${chip} ${color(elegidos.length === 0)}`}>
        Todos
      </button>
      {opciones.map((o) => {
        const activo = elegidos.includes(o.clave);
        return (
          <button
            key={o.clave || "sin-permiso"}
            type="button"
            onClick={() => onAlternar(o.clave)}
            aria-pressed={activo}
            className={`${chip} ${color(activo)}`}
          >
            {o.etiqueta}
            <span className="font-normal tabular-nums text-[var(--text-secondary)]">{fmtM3(o.m3)} m³</span>
          </button>
        );
      })}
    </div>
  );
}
