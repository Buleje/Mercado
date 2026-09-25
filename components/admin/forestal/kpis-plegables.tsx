"use client";

/**
 * Los indicadores plegables de una vista: el botón «Indicadores» y su panel.
 *
 * Brandon, 2026-09-02: «que los KPIs estén ocultos y que haya un botón para
 * mostrarlos». Y 2026-09-24: «el botón de KPIs alineado con otros botones de
 * otras funciones, para evitar que ocupe mucho espacio». Antes el botón vivía
 * en su propia fila —[Indicadores ▾] + el titular— y la barra de búsqueda y
 * acciones iba en otra: dos renglones donde entra uno.
 *
 * Dos formas de usarlo:
 *  · `useKpisPlegables(...)` devuelve `{ boton, panel }`: la vista pone el
 *    botón DENTRO de su barra (al lado de «Filtros», «Opciones», «Nuevo…») y
 *    el panel debajo. El titular viaja adentro del botón mientras está
 *    cerrado — plegar no es esconder el dato (ley de Brandon, regla 3).
 *  · `<CtpKpisPlegables acciones={…} />`: la fila de siempre, con los botones
 *    de la vista a la derecha en la MISMA fila.
 *
 * Arranca CERRADO y recuerda por vista (`ctp-kpis-v2:<clave>`). Con trabajo
 * abierto abajo (un lote elegido) se repliega solo y, al soltarlo, vuelve como
 * estaba — decide en el momento del cambio, no en cada render.
 */

import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { BarChart3, ChevronDown } from "@buleje/design-system/icons";

export interface KpisPlegablesProps {
  claveMemoria: string;
  tarjetas: ReactNode[];
  /** El titular en una línea (dos o tres cifras), de las MISMAS cuentas que las tarjetas. */
  resumen?: string;
  /** Lo que acompaña al titular con el panel cerrado (el mini-gauge de rendimiento). */
  resumenExtra?: ReactNode;
  /** El bloque ancho ARRIBA de las tarjetas dentro del panel (el balance del período). */
  encabezado?: ReactNode;
  /** La fila que gobierna estas cifras (ADR-400), dentro del panel. */
  filtros?: ReactNode;
  /** Cuántos filtros recortan las cifras: se dice aunque el panel esté cerrado. */
  filtrosActivos?: number;
  /** Hay trabajo abierto abajo: el panel se repliega y le devuelve la pantalla. */
  trabajoActivo?: boolean;
  /**
   * Alto del botón: `md` (h-12) para ir en una barra con buscador y botones de
   * h-12; `sm` (h-9) suelto. Default `sm`.
   */
  alto?: "sm" | "md";
}

export function useKpisPlegables({
  claveMemoria,
  tarjetas,
  resumen,
  resumenExtra,
  encabezado,
  filtros,
  filtrosActivos = 0,
  trabajoActivo = false,
  alto = "sm",
}: KpisPlegablesProps): { boton: ReactNode; panel: ReactNode; abierto: boolean } {
  /* Clave `v2`: la v1 guardaba «¿está abierta la SEGUNDA fila?», otra pregunta. */
  const [abierto, setAbierto] = useState(false);
  useEffect(() => {
    try { setAbierto(localStorage.getItem(`ctp-kpis-v2:${claveMemoria}`) === "1"); } catch { /* modo privado */ }
  }, [claveMemoria]);
  const alternar = () => {
    setAbierto((v) => {
      const next = !v;
      try { localStorage.setItem(`ctp-kpis-v2:${claveMemoria}`, next ? "1" : "0"); } catch { /* quota */ }
      return next;
    });
  };

  /* Al ARRANCAR el trabajo el panel se repliega; al soltarlo vuelve a lo
     guardado. Depende sólo de `trabajoActivo`: si dependiera de `abierto`,
     reabrirlo a mano lo volvería a cerrar en el render siguiente. */
  const trabajoPrevio = useRef(trabajoActivo);
  useEffect(() => {
    if (trabajoActivo && !trabajoPrevio.current) setAbierto(false);
    if (!trabajoActivo && trabajoPrevio.current) {
      try { setAbierto(localStorage.getItem(`ctp-kpis-v2:${claveMemoria}`) === "1"); } catch { /* modo privado */ }
    }
    trabajoPrevio.current = trabajoActivo;
  }, [trabajoActivo, claveMemoria]);

  if (tarjetas.length === 0) return { boton: null, panel: null, abierto: false };

  const boton = (
    <button
      type="button"
      onClick={alternar}
      aria-expanded={abierto}
      title={
        abierto
          ? "Ocultar los indicadores"
          : resumen
            ? `Ver los indicadores · ${resumen}`
            : "Ver los indicadores"
      }
      className={`inline-flex min-w-0 shrink items-center gap-2 border-[1.5px] px-3 text-sm font-bold transition-colors print:hidden ${
        /* En una barra (h-12) el botón no pasa de 24rem: el titular se corta
           con «…» y el buscador conserva su lugar (medido en Ingresos: con el
           titular entero, el buscador quedaba en 70 px). */
        alto === "md" ? "h-12 max-w-[min(100%,24rem)] rounded-2xl" : "h-9 max-w-full rounded-lg"
      } ${
        abierto
          ? "border-[var(--accent)] bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]"
          : "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-primary)] hover:border-[var(--accent)]"
      }`}
    >
      <BarChart3 className="h-4 w-4 shrink-0" aria-hidden />
      <span className="shrink-0">Indicadores</span>
      <span className="shrink-0 rounded-full bg-[var(--surface-sunken)] px-1.5 text-xs tabular-nums text-[var(--text-tertiary)]">
        {tarjetas.length}
      </span>
      {/* Con el panel cerrado, las cifras viajan en el botón: el titular sigue
          a la vista sin gastar una fila propia. */}
      {!abierto && resumen && (
        <span className="min-w-0 truncate font-mono text-sm font-normal tabular-nums text-[var(--text-secondary)]">
          {resumen}
        </span>
      )}
      {!abierto && resumenExtra && <span className="shrink-0">{resumenExtra}</span>}
      {/* Cerrado sobre cifras recortadas: sin esto, un número chico se lee como una caída. */}
      {filtrosActivos > 0 && (
        <span
          title="Los indicadores están mostrando sólo una parte del período"
          className="shrink-0 rounded-full bg-[var(--accent-muted)] px-2 py-0.5 text-xs font-bold text-[var(--accent-ink)] dark:text-[var(--accent)]"
        >
          {filtrosActivos} filtro{filtrosActivos === 1 ? "" : "s"}
        </span>
      )}
      <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${abierto ? "rotate-180" : ""}`} aria-hidden />
    </button>
  );

  const panel = abierto ? (
    <div className="space-y-2">
      {filtros}
      {encabezado}
      {/* `auto-fit`: plegado son dos y desplegado cinco; un número fijo de
          columnas dejaba huecos del alto de una tarjeta. */}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(230px,1fr))] gap-3">
        {tarjetas.map((k, i) => <Fragment key={i}>{k}</Fragment>)}
      </div>
    </div>
  ) : null;

  return { boton, panel, abierto };
}

/**
 * La fila de siempre: el botón y, a la derecha EN LA MISMA FILA, las
 * `acciones` de la vista (buscador, «Filtros», «Opciones», «Nuevo…»). Sin
 * `acciones` queda como antes: el botón solo.
 */
export function CtpKpisPlegables({
  antes,
  acciones,
  ...props
}: KpisPlegablesProps & {
  /** A la izquierda del botón, en la misma fila (el título de la tarjeta). */
  antes?: ReactNode;
  /** A la derecha, en la misma fila: buscador y botones de la vista. */
  acciones?: ReactNode;
}) {
  const { boton, panel } = useKpisPlegables({ ...props, alto: props.alto ?? (acciones ? "md" : "sm") });
  if (!boton) {
    return antes || acciones ? (
      <div className="flex flex-wrap items-center gap-2">
        {antes}
        {acciones && <div className="ml-auto flex flex-wrap items-center justify-end gap-2">{acciones}</div>}
      </div>
    ) : null;
  }
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {antes}
        {boton}
        {acciones && <div className="ml-auto flex min-w-0 flex-1 flex-wrap items-center justify-end gap-2">{acciones}</div>}
      </div>
      {panel}
    </div>
  );
}
