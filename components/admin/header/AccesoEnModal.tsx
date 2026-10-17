"use client";

/**
 * El módulo de un acceso rápido, en un modal ENCIMA de la pantalla donde
 * estás (Brandon 2026-10-10: «que salga su versión modal ahí mismo, en la
 * misma página o sección que se invoca, no que se vaya a la página»).
 *
 * Por qué a mano y no `AdminModal` (Radix): adentro va un módulo entero, con
 * sus propios modales. Radix apaga los clics de todo lo que no sea su
 * contenido (`pointer-events: none` en body) y los modales a mano del módulo
 * viven fuera de él; además centra con `translate`, y eso vuelve `fixed`
 * relativo a la tarjeta a todo lo de adentro. Acá: overlay `fixed` centrado
 * con flex (sin transformar), `z-modal` como un `AdminModal` (los de adentro,
 * que se montan después, quedan encima) y `useModalAccesible` (foco, Tab,
 * Escape —cede si hay otro diálogo arriba—, scroll y foco de vuelta).
 *
 * Va por portal al shell del panel (`[data-admin-shell]`), no a body: hereda
 * los tokens y las reglas del panel (tarjetas de tabla en celular, oscuro).
 * La vista del módulo vive en memoria (`VistaEmbebidaProvider`): la URL sigue
 * siendo de la pantalla de atrás. Si algo adentro lleva a OTRA pantalla
 * (`admin:navigate`), el modal se cierra.
 */
import dynamic from "next/dynamic";
import { useEffect, useId, useRef, useState, type ComponentType } from "react";
import { createPortal } from "react-dom";
import { Maximize2, X } from "@buleje/design-system/icons";
import { LoadingState } from "@buleje/design-system";
import { irAEnlace } from "@/components/admin/shared/ir-a-enlace";
import { ModuleDepthProvider } from "@/components/admin/shared/module-depth";
import { useModalAccesible } from "@/hooks/use-modal-accesible";
import { VistaEmbebidaProvider } from "@/hooks/use-vista-modulo";
import { hrefDelAcceso, type AccesoId, type AccesoRapido } from "./accesos-rapidos";
import { button } from "@/components/ui-system/button-variants";

const Cargando = () => <LoadingState message="Cargando…" />;
type Modulo = ComponentType<{ initialTab?: string } | undefined>;

/** Los mismos módulos que monta `TabRouter` para cada pestaña (comparten el chunk). */
const MODULOS: Record<AccesoId, Modulo> = {
  camaras: dynamic(() => import("@/components/admin/CamarasModule"), { loading: Cargando }),
  archivos: dynamic(() => import("@/components/admin/unified/DocumentosHubModule"), {
    loading: Cargando,
  }),
  asistencia: dynamic(() => import("@/components/admin/unified/RecursosHumanosHubModule"), {
    loading: Cargando,
  }),
  caja: dynamic(() => import("@/components/admin/unified/POSCajaModule"), { loading: Cargando }),
  vender: dynamic(() => import("@/components/admin/unified/POSCajaModule"), { loading: Cargando }),
  pedidos: dynamic(() => import("@/components/admin/OrdersTab"), { loading: Cargando }),
  "ingresos-madera": dynamic(() => import("@/components/admin/forestal/CTPLibroOperaciones"), {
    loading: Cargando,
  }),
  asistente: dynamic(() => import("@/components/admin/unified/AsistenteIAHubModule"), {
    loading: Cargando,
  }),
};

const BOTON =
  button({ variant: "ghost", size: "icon", className: "shrink-0 rounded-xl" });

/** Enfoca `selector` dentro de `caja` en cuanto se dibuja (el módulo carga aparte), con tope. */
function enfocarAlAparecer(caja: HTMLElement | null, selector: string, topeMs = 8000): () => void {
  const inicio = performance.now();
  let id = 0;
  const intentar = () => {
    const el = caja?.querySelector<HTMLElement>(selector);
    if (el && el.offsetParent !== null) {
      el.focus();
      return;
    }
    if (performance.now() - inicio < topeMs) id = requestAnimationFrame(intentar);
  };
  id = requestAnimationFrame(intentar);
  return () => cancelAnimationFrame(id);
}

interface Props {
  acceso: AccesoRapido;
  onCerrar: () => void;
}

export default function AccesoEnModal({ acceso, onCerrar }: Props) {
  const cajaRef = useRef<HTMLDivElement>(null);
  const idTitulo = useId();
  const [destino] = useState<HTMLElement | null>(() =>
    typeof document === "undefined"
      ? null
      : (document.querySelector<HTMLElement>('[data-admin-shell="true"]') ?? document.body),
  );
  useModalAccesible(cajaRef, { onCerrar });

  useEffect(() => {
    const alNavegar = () => onCerrar();
    window.addEventListener("admin:navigate", alNavegar);
    return () => window.removeEventListener("admin:navigate", alNavegar);
  }, [onCerrar]);

  useEffect(
    () => (acceso.enfocar ? enfocarAlAparecer(cajaRef.current, acceso.enfocar) : undefined),
    [acceso.enfocar],
  );

  if (!destino) return null;
  const Modulo = MODULOS[acceso.id];
  const Icono = acceso.icon;

  return createPortal(
    <div
      className="fixed inset-0 z-modal flex items-end justify-center bg-black/50 sm:items-center sm:p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCerrar();
      }}
    >
      <div
        ref={cajaRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={idTitulo}
        tabIndex={-1}
        data-acceso-modal={acceso.id}
        className="flex h-[92dvh] w-full flex-col overflow-clip rounded-t-2xl bg-[var(--surface-sunken)] shadow-[var(--shadow-xl)] outline-none dark:bg-[var(--surface-canvas)] sm:h-[min(92dvh,64rem)] sm:max-w-[88rem] sm:rounded-2xl"
      >
        <header className="flex shrink-0 items-center gap-3 border-b border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 py-2 sm:px-6">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-[var(--accent-ink)] dark:bg-primary/20 dark:text-[var(--accent)]">
            <Icono className="h-5 w-5" strokeWidth={1.75} aria-hidden />
          </span>
          <h2
            id={idTitulo}
            className="min-w-0 flex-1 truncate font-display text-lg font-semibold tracking-tight text-[var(--text-primary)]"
          >
            {acceso.label}
          </h2>
          <button
            type="button"
            className={BOTON}
            aria-label={`Abrir ${acceso.label} en su pantalla`}
            title="Abrir en su pantalla"
            onClick={() => {
              onCerrar();
              irAEnlace(hrefDelAcceso(acceso));
            }}
          >
            <Maximize2 className="h-5 w-5" aria-hidden />
          </button>
          <button
            type="button"
            className={BOTON}
            aria-label="Cerrar"
            title="Cerrar (Esc)"
            onClick={onCerrar}
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4 sm:px-6">
          <VistaEmbebidaProvider value={{ vista: acceso.vista }}>
            <ModuleDepthProvider>
              <Modulo initialTab={acceso.vista} />
            </ModuleDepthProvider>
          </VistaEmbebidaProvider>
        </div>
      </div>
    </div>,
    destino,
  );
}
