"use client";

/**
 * Análisis › Métricas: el panel de cada sección y su estado vacío.
 *
 * UN gráfico a la vista a la vez (Brandon 11-10: «muchos datos → secciones, no
 * bloques apilados»). Antes cada sección apilaba dos o tres tarjetas, algunas
 * con pestañas propias, y Productos medía 2,4 pantallas. Ahora la sección es
 * una tarjeta con sus gráficos en `BarraDeSecciones` (el mismo control que la
 * fila de arriba), el ⓘ del gráfico elegido y, si el gráfico depende del
 * tiempo, el período a la derecha. El elegido se recuerda por sección.
 *
 * El período es uno para todos (`ProveedorPeriodo` en el hub): si miras 7 días
 * en la tendencia, el mapa de calor y la cesta también salen de 7 días.
 */

import { createContext, useContext, type ReactNode } from "react";
import type { LucideIcon } from "@buleje/design-system/icons";
import { BarraDeSecciones, idPestanaDeSeccion } from "@/components/admin/shared/BarraDeSecciones";
import EmptyDateRangeState from "@/components/admin/inicio/EmptyDateRangeState";
import type { DateRange } from "@/components/admin/inicio/DashboardDateRange";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";

export type PeriodoMetricas = "7d" | "30d" | "90d";

export const PERIODOS: readonly { clave: PeriodoMetricas; rotulo: string }[] = [
  { clave: "7d", rotulo: "Últimos 7 días" },
  { clave: "30d", rotulo: "Últimos 30 días" },
  { clave: "90d", rotulo: "Últimos 90 días" },
];

interface CtxPeriodo {
  periodo: PeriodoMetricas;
  cambiar: (p: PeriodoMetricas) => void;
}
const Periodo = createContext<CtxPeriodo | null>(null);
export const ProveedorPeriodo = Periodo.Provider;
/** `null` fuera de Métricas: el gráfico usa su propio período. */
export function usePeriodoMetricas() {
  return useContext(Periodo);
}

export interface GraficoMetricas<T extends string = string> {
  clave: T;
  rotulo: string;
  /** Qué muestra, en una frase: va en el ⓘ al lado de las pestañas. */
  ayuda: string;
  /** El gráfico lee el período: se muestra el selector. */
  conPeriodo?: boolean;
  contenido: ReactNode;
}

interface PanelProps<T extends string> {
  id: string;
  etiqueta: string;
  graficos: readonly GraficoMetricas<T>[];
  activo: T;
  onCambiar: (clave: T) => void;
}

export function PanelDeGraficos<T extends string>({ id, etiqueta, graficos, activo, onCambiar }: PanelProps<T>) {
  const ctx = usePeriodoMetricas();
  const actual = graficos.find((g) => g.clave === activo) ?? graficos[0];
  const idPanel = `${id}-grafico`;
  return (
    <section className="@container rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-3 sm:p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {/* Pestañas y ⓘ juntos: a 400 px el carril se desplaza y el ⓘ no cae solo a otra fila. */}
        <div className="flex min-w-0 max-w-full items-center gap-2">
          <div className="min-w-0">
            <BarraDeSecciones
              secciones={graficos.map((g) => ({ clave: g.clave, rotulo: g.rotulo }))}
              activa={actual.clave}
              onCambiar={onCambiar}
              etiqueta={etiqueta}
              idPanel={idPanel}
            />
          </div>
          <span className="shrink-0">
            <InfoTip title={actual.rotulo} what={actual.ayuda} side="bottom" />
          </span>
        </div>
        {actual.conPeriodo && ctx && (
          <label className="ml-auto">
            <span className="sr-only">Período</span>
            <select
              value={ctx.periodo}
              onChange={(e) => ctx.cambiar(e.target.value as PeriodoMetricas)}
              className="h-12 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm font-semibold text-[var(--text-primary)] focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
            >
              {PERIODOS.map((p) => (
                <option key={p.clave} value={p.clave}>{p.rotulo}</option>
              ))}
            </select>
          </label>
        )}
      </div>
      <div role="tabpanel" id={idPanel} aria-labelledby={idPestanaDeSeccion(idPanel, actual.clave)}>
        {actual.contenido}
      </div>
    </section>
  );
}

/** Sólo para cumplir el tipo de `EmptyDateRangeState`: el título va siempre propio. */
const RANGO_SIN_USO: DateRange = { preset: "mensual", from: new Date(0), to: new Date(0) };

/**
 * El estado vacío del panel (el del paiche, `EmptyDateRangeState`, Brandon
 * 11-10: «para páginas que no tengan datos»). Con `conPeriodo` y menos de 90
 * días elegidos, el botón amplía el período; si no, lleva a registrar una venta.
 */
export function VacioMetricas({ titulo, descripcion, conPeriodo, icono, accion }: {
  titulo: string;
  descripcion: string;
  conPeriodo?: boolean;
  icono?: LucideIcon;
  accion?: { label: string; href?: string; onClick?: () => void };
}) {
  const ctx = usePeriodoMetricas();
  const ampliar = conPeriodo && ctx && ctx.periodo !== "90d" ? ctx : null;
  return (
    <EmptyDateRangeState
      dateRange={RANGO_SIN_USO}
      title={titulo}
      description={descripcion}
      icon={icono}
      action={
        accion ??
        (ampliar
          ? { label: "Ver los últimos 90 días", onClick: () => ampliar.cambiar("90d") }
          : { label: "Registrar venta manual", href: "/admin?tab=ventas-caja" })
      }
    />
  );
}
