"use client";

/**
 * ctp-riel-control — los dos botones que repiten las vistas de Control y
 * Gestión del Libro CTP (Tablero, Saldos, Cumplimiento, Contratos) en el riel
 * de las pestañas (Brandon, 2026-10-17: «los botones… al lado de las pestañas
 * en la esquina para ocupar menos espacio»).
 *
 *  · `BotonRecargar`: siempre ícono de 48 px. «Recargar» con texto ocupaba
 *    ~130 px del riel en cada vista para una acción que se reconoce por la
 *    flecha; el nombre queda en `title` y en `aria-label`.
 *  · `MenuDescargar`: las descargas van juntas en un «Descargar ▾». En el riel
 *    es sólo el ícono (como el «Opciones» de Ingresos); fuera del libro, con
 *    su rótulo.
 */

import { Download, RefreshCw } from "@buleje/design-system/icons";
import ActionMenu, { type MenuAccion } from "@/components/admin/shared/action-menu";
import { useEnElLibro } from "@/components/admin/shared/libro-acciones-vista";
import { cn } from "@/lib/utils";
import { BTN_ICONO_RIEL } from "./ctp-riel-piezas";

export function BotonRecargar({
  onClick,
  cargando = false,
  etiqueta = "Recargar",
  disabled,
}: {
  onClick: () => void;
  cargando?: boolean;
  /** Qué refresca, en palabras («Recargar todos los saldos»). */
  etiqueta?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled ?? cargando}
      title={etiqueta}
      aria-label={etiqueta}
      aria-busy={cargando || undefined}
      className={cn(BTN_ICONO_RIEL, "disabled:cursor-not-allowed disabled:opacity-60")}
    >
      <RefreshCw className={cn("h-4 w-4", cargando && "animate-spin")} aria-hidden />
    </button>
  );
}

export function MenuDescargar({
  acciones,
  disabled,
  title,
  label = "Descargar",
}: {
  acciones: MenuAccion[];
  disabled?: boolean;
  /** Por qué está apagado, o qué baja. */
  title?: string;
  label?: string;
}) {
  const enLibro = useEnElLibro();
  return (
    <ActionMenu
      label={label}
      icon={Download}
      size="md"
      compactoEnMovil
      soloIcono={enLibro}
      className={enLibro ? "w-12!" : ""}
      disabled={disabled}
      title={title ?? label}
      actions={acciones}
    />
  );
}

/** Una sola descarga (un PDF): sin menú de por medio, el ícono la baja directo. */
export function BotonDescargar({
  onClick,
  etiqueta,
  ocupado = false,
}: {
  onClick: () => void;
  /** Qué baja, en palabras («Descargar el reporte de cumplimiento (PDF)»). */
  etiqueta: string;
  ocupado?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={ocupado}
      title={etiqueta}
      aria-label={etiqueta}
      aria-busy={ocupado || undefined}
      className={cn(BTN_ICONO_RIEL, "disabled:cursor-not-allowed disabled:opacity-60")}
    >
      <Download className="h-4 w-4" aria-hidden />
    </button>
  );
}
