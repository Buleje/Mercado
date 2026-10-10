"use client";

/**
 * Cabecera de la pestaña Caja en UNA fila: el título de la vista (con su ⓘ),
 * el estado de la caja, las cinco secciones y el menú «Más» con lo que no es de
 * uso constante (arqueos, imprimir, exportar, WhatsApp, tolerancia, refrescar).
 *
 * En «Cuadrar» el título, su ⓘ, el botón «Indicadores» y las acciones los arma
 * el módulo de cuadres (CashAuditTab, montado tal cual) y llegan por `titulo`,
 * `extra` y `acciones`: siguen en ESTA fila. Hasta la pasada de diseño de la
 * ola 3 Cuadrar tenía dos cabeceras apiladas —«Cerrada … secciones · Más» y
 * «Cuadres de caja … Indicadores · ⋯»—, cada una con su menú.
 */
import { useEffect, useRef, type ReactNode } from "react";
import { SectionTitle } from "@buleje/design-system";
import { MoreHorizontal } from "@buleje/design-system/icons";
import ActionMenu, { type MenuAccion } from "@/components/admin/shared/action-menu";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { cn } from "@/lib/utils";
import type { VistaCaja } from "./tipos";

const VISTAS: Array<{ clave: VistaCaja; rotulo: string }> = [
  { clave: "hoy", rotulo: "Hoy" },
  { clave: "historial", rotulo: "Historial" },
  { clave: "auditoria", rotulo: "Quién la tocó" },
  { clave: "reconciliacion", rotulo: "Reconciliación" },
  { clave: "cuadrar", rotulo: "Cuadrar" },
];

/** Cuadrar trae su propio título (CashAuditTab). */
type ConTitulo = Exclude<VistaCaja, "cuadrar">;

const TITULO: Record<ConTitulo, string> = {
  hoy: "Caja de hoy",
  historial: "Historial de cajas",
  auditoria: "Quién tocó la caja",
  reconciliacion: "Reconciliación por día",
};

const AYUDA: Record<ConTitulo, { what: string; example?: string }> = {
  hoy: {
    what: "El efectivo físico del día: abres con un monto inicial, registras ingresos y retiros durante el turno y al cerrar comparas lo contado con lo esperado.",
    example: "Valentina abre con S/ 200, vende durante el turno y al cerrar el sistema le dice si hay faltante o sobrante.",
  },
  historial: { what: "Todas las cajas cerradas con su diferencia entre lo esperado y lo contado." },
  auditoria: { what: "Aperturas, cierres e ingresos o retiros a mano, con el usuario que los hizo. Es un registro de auditoría: no se edita ni se borra." },
  reconciliacion: { what: "Esperado contra real por día y el flujo de efectivo de la semana." },
};

interface Props {
  vista: VistaCaja;
  onVista: (v: VistaCaja) => void;
  /** Chip de la caja (abierta o cerrada). En Cuadrar no va: el contador ya lo dice. */
  estado?: ReactNode;
  acciones: MenuAccion[];
  /** Título con su ⓘ cuando lo arma otro (Cuadrar); si no, el de la sección. */
  titulo?: ReactNode;
  /** Controles propios de la sección, entre las secciones y «Más» (Indicadores de Cuadrar). */
  extra?: ReactNode;
}

/**
 * Entre Cuadrar y las otras secciones la cabecera se vuelve a montar (en
 * Cuadrar la dibuja el módulo de cuadres): el foco del teclado se perdía en el
 * <body>. Sólo un clic o Enter en una sección lo pide; al cargar la página no.
 */
let enfocarSeccion = false;

export function CajaCabecera({ vista, onVista, estado, acciones, titulo, extra }: Props) {
  /* A 400 px las secciones no entran y se desplazan: la elegida queda a la
     vista (medido: «Cuadrar» quedaba cortada a la derecha). Con scrollLeft del
     carril, no scrollIntoView, para no mover la página. */
  const carril = useRef<HTMLDivElement>(null);
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
    if (enfocarSeccion) {
      enfocarSeccion = false;
      c.querySelector<HTMLElement>('[aria-selected="true"]')?.focus({ preventScroll: true });
    }
    // También al angostarse (girar el celular): sin esto la elegida quedaba afuera.
    const obs = new ResizeObserver(centrar);
    obs.observe(c);
    return () => obs.disconnect();
  }, [vista]);

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <div className="flex min-w-0 flex-1 sm:flex-none items-center gap-2">
        {titulo ??
          (vista !== "cuadrar" && (
            <>
              <SectionTitle className="text-[var(--text-primary)]">{TITULO[vista]}</SectionTitle>
              <InfoTip what={AYUDA[vista].what} example={AYUDA[vista].example} />
            </>
          ))}
        {estado}
      </div>
      {/* En el celular las vistas bajan a su propia fila (con scroll) y «Más» se queda arriba, como ícono. */}
      <div ref={carril} className="order-last sm:order-none w-full sm:w-auto sm:ml-auto overflow-x-auto scrollbar-none">
        <div className="flex w-max rounded-xl bg-[var(--surface-sunken)] p-1" role="tablist" aria-label="Secciones de la caja">
          {VISTAS.map((v) => (
            <button
              key={v.clave}
              type="button"
              role="tab"
              aria-selected={vista === v.clave}
              onClick={() => {
                if (v.clave === vista) return;
                enfocarSeccion = true;
                onVista(v.clave);
              }}
              className={cn(
                "px-3 min-h-9 rounded-lg text-sm font-semibold transition-colors whitespace-nowrap",
                vista === v.clave ? "bg-[var(--surface-raised)] text-[var(--text-primary)] shadow-[var(--shadow-sm)]" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]",
              )}
            >
              {v.rotulo}
            </button>
          ))}
        </div>
      </div>
      {extra}
      <ActionMenu label="Más" icon={MoreHorizontal} actions={acciones} size="md" compactoEnMovil title="Arqueos, imprimir, exportar y ajustes" />
    </div>
  );
}
