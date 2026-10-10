"use client";

/**
 * La barra de secciones de Caja, en una fila: la pestaña abierta muestra sus
 * secciones y la otra queda como una sola pestaña que lleva a la última
 * sección que usaste ahí.
 *
 *   Hoy:       [Resumen][Movimientos][Medios de pago][Cuadrar] · [Historial]
 *   Historial: [Hoy] · [Por caja][Por día][Quién la tocó]
 *
 * Teclado: ← → recorren las pestañas (patrón ARIA de tabs), Inicio/Fin van a
 * la primera y la última. A 400 px el carril se desplaza y la elegida queda a
 * la vista (con `scrollLeft` del carril, no `scrollIntoView`: no mueve la página).
 */
import { Fragment, useEffect, useRef, type KeyboardEvent } from "react";
import { cn } from "@/lib/utils";
import { GRUPOS, SECCIONES, grupoDe, seccionRecordada, type GrupoCaja } from "./secciones";
import type { VistaCaja } from "./tipos";

interface Props {
  vista: VistaCaja;
  onVista: (v: VistaCaja) => void;
  /** Con la caja cerrada «Hoy» no tiene secciones que mirar: va como una sola pestaña. */
  hoyConSecciones: boolean;
}

interface Pestana {
  clave: string;
  rotulo: string;
  activa: boolean;
  ir: VistaCaja;
}

/** Un solo panel para todas las pestañas (cambia su contenido): lo arma CashRegisterTab. */
export const ID_PANEL_CAJA = "caja-secciones-panel";
const idPestana = (clave: string) => `caja-pestana-${clave}`;

/** El id de la pestaña elegida, para el `aria-labelledby` del panel. */
export function idPestanaActiva(vista: VistaCaja, hoyConSecciones: boolean): string {
  const g = grupoDe(vista);
  return idPestana(g === "hoy" && !hoyConSecciones ? `grupo-${g}` : vista);
}

/**
 * Entre secciones la cabecera puede volver a montarse (Historial › Por caja la
 * arma el módulo de cuadres) y el foco caía al <body>. Sólo un clic o una
 * flecha lo pide; al cargar la página no.
 */
let enfocarActiva = false;

export function CajaSecciones({ vista, onVista, hoyConSecciones }: Props) {
  const carril = useRef<HTMLDivElement>(null);
  const grupo = grupoDe(vista);

  const pestanas: Pestana[] = [];
  const separadores = new Set<number>();
  for (const g of GRUPOS) {
    const expandido = g === grupo && (g !== "hoy" || hoyConSecciones);
    if (pestanas.length > 0) separadores.add(pestanas.length);
    if (expandido) {
      for (const s of SECCIONES[g].secciones) pestanas.push({ clave: s.clave, rotulo: s.rotulo, activa: s.clave === vista, ir: s.clave });
    } else {
      pestanas.push({ clave: `grupo-${g}`, rotulo: SECCIONES[g].rotulo, activa: g === grupo, ir: irAGrupo(g) });
    }
  }

  useEffect(() => {
    const c = carril.current;
    if (!c) return;
    const centrar = () => {
      const activa = c.querySelector<HTMLElement>('[aria-selected="true"]');
      if (!activa || c.scrollWidth <= c.clientWidth) return;
      const rc = c.getBoundingClientRect();
      const ra = activa.getBoundingClientRect();
      c.scrollLeft += ra.left + ra.width / 2 - (rc.left + rc.width / 2);
    };
    centrar();
    if (enfocarActiva) {
      enfocarActiva = false;
      c.querySelector<HTMLElement>('[aria-selected="true"]')?.focus({ preventScroll: true });
    }
    // También al angostarse (girar el celular): sin esto la elegida quedaba afuera.
    const obs = new ResizeObserver(centrar);
    obs.observe(c);
    return () => obs.disconnect();
  }, [vista, hoyConSecciones]);

  const ir = (p: Pestana) => {
    if (p.activa) return;
    enfocarActiva = true;
    onVista(p.ir);
  };

  const alTeclear = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = pestanas.findIndex((p) => p.activa);
    const destino =
      e.key === "ArrowRight" ? i + 1 : e.key === "ArrowLeft" ? i - 1 : e.key === "Home" ? 0 : e.key === "End" ? pestanas.length - 1 : null;
    if (destino == null || destino < 0 || destino >= pestanas.length || destino === i) return;
    e.preventDefault();
    ir(pestanas[destino]);
  };

  return (
    <div ref={carril} className="min-w-0 max-w-full overflow-x-auto scrollbar-none">
      <div className="flex w-max items-center gap-1 rounded-xl bg-[var(--surface-sunken)]" role="tablist" aria-label="Secciones de la caja" onKeyDown={alTeclear}>
        {pestanas.map((p, i) => (
          <Fragment key={p.clave}>
            {separadores.has(i) && <span className="mx-1 h-6 w-px shrink-0 bg-[var(--rule-strong)]/30" aria-hidden />}
            <button
              type="button"
              role="tab"
              id={idPestana(p.clave)}
              aria-controls={ID_PANEL_CAJA}
              aria-selected={p.activa}
              tabIndex={p.activa ? 0 : -1}
              onClick={() => ir(p)}
              className={cn(
                "min-h-12 whitespace-nowrap rounded-xl px-4 text-sm font-semibold transition-colors",
                p.activa
                  ? "bg-[var(--surface-raised)] text-[var(--text-primary)] shadow-[var(--shadow-sm)] ring-1 ring-[var(--rule-base)]"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]",
              )}
            >
              {p.rotulo}
            </button>
          </Fragment>
        ))}
      </div>
    </div>
  );
}

/** A la otra pestaña: la última sección que usaste ahí. */
function irAGrupo(g: GrupoCaja): VistaCaja {
  return seccionRecordada(g);
}
