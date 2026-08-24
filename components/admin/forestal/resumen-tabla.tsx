"use client";

/**
 * resumen-tabla — las piezas compartidas de la pestaña Resúmenes: la sección
 * con cabecera, el KPI y la tabla de grupos.
 *
 * Viven acá y no dentro de `CubicacionResumenes` porque las usan cinco vistas
 * (especie×tipo, general por especie, general por tipo, agrupado libre y el
 * reparto de rolliza). Una sola tabla = una sola forma de leer una cifra: el
 * pie tablar entero y el m³ con tres decimales, siempre, en todas.
 */

import type { ReactNode } from "react";
import { CardTitle, DataTable } from "@buleje/design-system";
import type { LucideIcon } from "@buleje/design-system/icons";
import type { GrupoResumen, ResumenLote } from "@/lib/forestal/cubicacion-resumen";
import { fmtM3, fmtPct, fmtPt, fmtSoles } from "@/lib/forestal/cubicacion-formato";
import type { TipoComercial } from "@/lib/forestal/cubicacion-tipo";
import { TipoBadge } from "./tipo-badge";

/** Tarjeta de sección: misma caja para las siete lecturas del lote. */
export function SeccionResumen({ id, icon: Icono, titulo, hint, acciones, children, className = "" }: {
  id?: string;
  icon?: LucideIcon;
  titulo: string;
  /** Una línea que explica qué contesta la sección — no decorativa: la gente no sabe qué mira. */
  hint?: ReactNode;
  acciones?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      id={id}
      /* `scroll-mt`: los chips de la cabecera saltan acá y el header pegajoso
         del admin se comía el título de la sección al aterrizar. */
      className={`scroll-mt-24 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-4 sm:p-5 ${className}`}
    >
      <div className="mb-3 flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
        <div className="min-w-0">
          <CardTitle as="h4" className="flex items-center gap-2 text-base font-bold text-[var(--text-primary)]">
            {Icono && <Icono className="h-4 w-4 shrink-0 text-[var(--accent)]" aria-hidden />}
            {titulo}
          </CardTitle>
          {hint && <div className="mt-0.5 text-sm text-[var(--text-tertiary)]">{hint}</div>}
        </div>
        {acciones && <div className="flex flex-wrap items-center gap-2 print:hidden">{acciones}</div>}
      </div>
      {children}
    </section>
  );
}

/** KPI del encabezado: el número grande y, debajo, de qué está hecho. */
export function KpiResumen({ label, value, unidad, hint, icon: Icono, destacado, tono }: {
  label: string;
  value: string;
  unidad?: string;
  hint?: ReactNode;
  icon?: LucideIcon;
  /** El del valor del lote: es el número por el que se abre esta pantalla. */
  destacado?: boolean;
  /** Clase de color del número, cuando el KPI juzga (rendimiento, faltante). */
  tono?: string;
}) {
  return (
    <div
      className={`rounded-xl border px-3 py-2.5 ${destacado
        ? "border-[var(--accent)]/40 bg-primary/10"
        : "border-[var(--rule-soft)] bg-[var(--surface-canvas)]"}`}
    >
      <div className="flex items-center gap-1.5 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--text-tertiary)]">
        {Icono && <Icono className="h-3.5 w-3.5 shrink-0" aria-hidden />}
        {label}
      </div>
      <div className={`mt-1 flex items-baseline gap-1 font-mono text-2xl font-extrabold tabular-nums ${tono ?? (destacado ? "text-[var(--accent-ink)] dark:text-[var(--accent)]" : "text-[var(--text-primary)]")}`}>
        <span className="truncate">{value}</span>
        {unidad && <span className="text-sm font-bold text-[var(--text-tertiary)]">{unidad}</span>}
      </div>
      {/* `line-clamp` y no `truncate`: el pie del rendimiento dice «esperabas
          55 % · sobran 14.156 m³ sin aserrar» y en una línea se cortaba justo
          donde está la explicación. */}
      {hint && <div className="mt-0.5 line-clamp-2 text-sm text-[var(--text-tertiary)]">{hint}</div>}
    </div>
  );
}

const TH_BASE = "py-2.5 text-left align-bottom text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--text-tertiary)]";
const TD_BASE = "py-2.5 align-middle";
const NUM = "text-right font-mono tabular-nums";

/**
 * Tabla de grupos (piezas · PT · m³ · participación · valor) con fila de total.
 *
 * La participación va como barra y no como número suelto: la pregunta real es
 * "¿en qué se me fue el volumen?", y eso se contesta comparando largos de barra,
 * no leyendo seis porcentajes en fila.
 */
export function TablaGrupos({ grupos, total, primeraCol, conValor, esTipo, caption, compacta }: {
  grupos: GrupoResumen[];
  total: ResumenLote["total"];
  primeraCol: string;
  conValor: boolean;
  esTipo?: boolean;
  /** Nombre accesible de la tabla (va en un `<caption>` sr-only). */
  caption?: string;
  /**
   * Tabla dentro de una tarjeta angosta (las de especie × tipo, dos por fila).
   * Ahí «S/ por PT» no entraba y se cortaba contra el borde: el dato ya está en
   * la cabecera de la especie, así que la columna se va en vez de quedar a
   * medias detrás de un scroll que nadie descubre.
   */
  compacta?: boolean;
}) {
  /* Con muchas filas la tabla toma su propio scroll: sin eso, `sticky` no se
     pega a nada y al llegar al final ya no se sabe qué columna era cuál. */
  const larga = grupos.length > 12;
  const conRendimiento = conValor && !compacta;
  /* Medido: la general por especie en dos columnas pedía 529 px sobre 510 —
     el valor quedaba cortado contra el borde. Con el padding chico entra. */
  const TH = `${compacta ? "px-2" : "px-3"} ${TH_BASE}`;
  const TD = `${compacta ? "px-2" : "px-3"} ${TD_BASE}`;
  return (
    <div className={`overflow-x-auto rounded-xl border border-[var(--rule-base)] ${larga ? "max-h-[70vh] overflow-y-auto" : ""}`}>
      <DataTable className={`w-full text-sm ${compacta ? "min-w-[400px]" : "min-w-[480px]"}`}>
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead className="sticky top-0 z-10 bg-[var(--surface-sunken)]">
          <tr>
            <th scope="col" className={TH}>{primeraCol}</th>
            <th scope="col" className={`${TH} text-right`}>Piezas</th>
            <th scope="col" className={`${TH} text-right`}>Pie tablar</th>
            <th scope="col" className={`${TH} text-right`}>Volumen m³</th>
            <th scope="col" className={`${TH} ${compacta ? "w-[22%]" : "w-[26%]"}`}>Participación</th>
            {conValor && <th scope="col" className={`${TH} text-right`}>Valor S/</th>}
            {conRendimiento && <th scope="col" className={`${TH} text-right`} title="Lo que rinde cada pie tablar de ese grupo">S/ por PT</th>}
          </tr>
        </thead>
        <tbody>
          {grupos.map((g, i) => (
            <tr
              key={g.clave}
              className="border-t border-[var(--rule-soft)] transition-colors even:bg-[var(--surface-canvas)]/50 hover:bg-primary/5"
            >
              {/* El grupo que manda lleva la marca al costado: es el que define
                  el precio del lote y en una lista de doce se perdía. */}
              <td className={`${TD} border-l-[3px] font-bold text-[var(--text-primary)] ${i === 0 && grupos.length > 1 ? "border-l-[var(--accent)]" : "border-l-transparent"}`}>
                {esTipo ? <TipoBadge tipo={g.label as TipoComercial} /> : g.label}
              </td>
              <td className={`${TD} ${NUM} text-[var(--text-secondary)]`}>{g.cantidad}</td>
              <td className={`${TD} ${NUM} font-bold text-[var(--text-primary)]`}>{fmtPt(g.pieTablar)}</td>
              <td className={`${TD} ${NUM} text-[var(--text-secondary)]`}>{fmtM3(g.m3)}</td>
              <td className={TD}>
                <div className="flex items-center gap-2">
                  {/* En mobile la fila se vuelve card y la barra queda de un
                      píxel: ahí manda el porcentaje solo. */}
                  <div className="hidden h-2 min-w-[2.5rem] flex-1 overflow-hidden rounded-full bg-[var(--surface-sunken)] sm:block">
                    <div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${Math.min(100, g.pctPt)}%` }} />
                  </div>
                  <span className={`shrink-0 text-right font-mono text-xs tabular-nums text-[var(--text-tertiary)] ${compacta ? "w-11" : "w-14"}`}>{fmtPct(g.pctPt)}%</span>
                </div>
              </td>
              {conValor && <td className={`${TD} ${NUM} font-bold text-[var(--accent-ink)] dark:text-[var(--accent)]`}>{fmtSoles(g.valor)}</td>}
              {conRendimiento && (
                <td className={`${TD} ${NUM} text-[var(--text-secondary)]`}>
                  {g.pieTablar > 0 ? fmtSoles(g.valor / g.pieTablar) : "—"}
                </td>
              )}
            </tr>
          ))}
        </tbody>
        {/* El fondo opaco es del `tfoot` y el tinte del `tr`: pegado abajo, un
            tinte translúcido dejaba ver la fila que pasa por debajo. */}
        <tfoot className="sticky bottom-0 bg-[var(--surface-raised)]">
          <tr className="border-t-2 border-[var(--accent)]/40 bg-primary/10 font-bold text-[var(--accent-ink)] dark:text-[var(--accent)]">
            <th scope="row" className={`${TD} whitespace-nowrap text-left`}>{compacta ? "Total" : `Total · ${grupos.length} ${grupos.length === 1 ? "grupo" : "grupos"}`}</th>
            <td className={`${TD} ${NUM}`}>{total.cantidad}</td>
            <td className={`${TD} ${NUM}`}>{fmtPt(total.pieTablar)}</td>
            <td className={`${TD} ${NUM}`}>{fmtM3(total.m3)}</td>
            <td className={`${TD} text-[length:var(--ts-2xs)] uppercase tracking-wide`}>100%</td>
            {conValor && <td className={`${TD} ${NUM}`}>{fmtSoles(total.valor)}</td>}
            {conRendimiento && (
              <td className={`${TD} ${NUM}`}>{total.pieTablar > 0 ? fmtSoles(total.valor / total.pieTablar) : "—"}</td>
            )}
          </tr>
        </tfoot>
      </DataTable>
    </div>
  );
}
