"use client";

/**
 * Los botones del centro «Pendientes y avisos» (`AvisoAgendaModal`), aparte para
 * que el centro no pase de 300 líneas: «Agregar», la fila de acciones de la
 * cabecera de la ventana, el pie de la barra del costado y «Volver a la lista».
 */
import { AlarmClock, ArrowLeft, CheckCheck, PanelRight, Pin, Plus, RefreshCw, Settings, X } from "@buleje/design-system/icons";
import ActionMenu, { type MenuAccion } from "@/components/admin/shared/action-menu";
import { button } from "@/components/ui-system/button-variants";
import type { ModoAviso } from "@/lib/agenda/aviso-pantalla";
import { cn } from "@/lib/utils";

export const ICONO = "size-5";

const AYUDA_AGREGAR = "Agregar una tarea o una actividad";

/** «Agregar ▾»: nueva tarea o nueva actividad, sin salir del centro. */
export function AgregarAlCentro({ agregar, soloIcono = false }: { agregar: MenuAccion[]; soloIcono?: boolean }) {
  return <ActionMenu label="Agregar" icon={Plus} actions={agregar} variant="accent" soloIcono={soloIcono} compactoEnMovil={!soloIcono} title={AYUDA_AGREGAR} />;
}

interface Comunes {
  /** Cuántas notificaciones hay sin leer. */
  sinLeer: number;
  actualizando: boolean;
  onActualizar: () => void;
  onMarcarLeidas: () => void;
  onCerrar: () => void;
}

/** La fila de la cabecera de la ventana al centro. */
export function AccionesDeLaVentana({ agregar, sinLeer, actualizando, onActualizar, onMarcarLeidas, onCerrar, onCambiarModo }: Comunes & { agregar: MenuAccion[]; onCambiarModo: (m: ModoAviso) => void }) {
  return (
    <>
      <AgregarAlCentro agregar={agregar} />
      <button type="button" onClick={onActualizar} className={button({ variant: "ghost", size: "icon" })} aria-label="Actualizar" title="Actualizar">
        <RefreshCw className={cn(ICONO, actualizando && "animate-spin")} aria-hidden="true" />
      </button>
      <button
        type="button"
        onClick={onMarcarLeidas}
        aria-disabled={sinLeer === 0}
        className={button({ variant: "ghost", size: "icon", className: "aria-disabled:opacity-50" })}
        aria-label="Marcar todas las notificaciones leídas"
        title="Marcar todas las notificaciones leídas"
      >
        <CheckCheck className={ICONO} aria-hidden="true" />
      </button>
      <button type="button" data-qa="aviso-al-costado" className={button({ variant: "ghost", size: "icon" })} onClick={() => onCambiarModo("lateral")} title="Al costado: barra a la derecha, la página se achica para hacerle lugar" aria-label="Poner al costado">
        <PanelRight className={ICONO} aria-hidden="true" />
      </button>
      <button type="button" data-qa="aviso-fijar" className={button({ variant: "ghost", size: "icon" })} onClick={() => onCambiarModo("fija")} title="Fija al costado: igual, y vuelve al recargar" aria-label="Fijar al costado">
        <Pin className={ICONO} aria-hidden="true" />
      </button>
      <button type="button" onClick={onCerrar} className={button({ variant: "ghost", size: "icon" })} aria-label="Cerrar" title="Cerrar (Esc)">
        <X className={ICONO} aria-hidden="true" />
      </button>
    </>
  );
}

/** El pie de la barra del costado: lo de siempre en íconos, «Agregar» primero y «Entendido» a la derecha. `onMarcarLeidas` ya cuida que haya algo sin leer. */
export function PieDelCostado({ agregar, recordar, vuelve, actualizando, onActualizar, onMarcarLeidas, onCerrar, onConfigurar }: Omit<Comunes, "sinLeer"> & { agregar: MenuAccion[]; recordar: MenuAccion[]; vuelve: string; onConfigurar: () => void }) {
  return (
    <div className="flex items-center gap-1">
      <AgregarAlCentro agregar={agregar} soloIcono />
      <button type="button" className={button({ variant: "ghost", size: "icon" })} onClick={onConfigurar} title="Configurar los recordatorios" aria-label="Configurar">
        <Settings className={ICONO} aria-hidden="true" />
      </button>
      <ActionMenu label="Recordarme" icon={AlarmClock} actions={recordar} soloIcono title={`Volver a avisarme más tarde · ${vuelve}`} />
      <button type="button" className={button({ variant: "ghost", size: "icon" })} onClick={onMarcarLeidas} title="Marcar todas las notificaciones leídas" aria-label="Marcar todas leídas">
        <CheckCheck className={ICONO} aria-hidden="true" />
      </button>
      <button type="button" className={button({ variant: "ghost", size: "icon" })} onClick={onActualizar} title="Actualizar" aria-label="Actualizar">
        <RefreshCw className={cn(ICONO, actualizando && "animate-spin")} aria-hidden="true" />
      </button>
      <button type="button" data-qa="aviso-agenda-entendido" className={button({ variant: "primary", className: "ml-auto" })} onClick={onCerrar}>
        Entendido
      </button>
    </div>
  );
}

export function VolverALaLista({ onVolver }: { onVolver: () => void }) {
  return (
    <button type="button" data-qa="poner-al-dia-volver" className={button({ variant: "ghost" })} onClick={onVolver}>
      <ArrowLeft className="size-4" aria-hidden="true" />
      Volver a la lista
    </button>
  );
}
