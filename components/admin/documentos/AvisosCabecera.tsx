"use client";

/**
 * Los avisos de Documentos en la cabecera (Brandon 31-10: «esta parte marcada
 * quiero que pase arriba… en opciones o los tres puntitos para que ocupe menos
 * espacio»). La fila de avisos del Archivo (vencidos · por ordenar · carpetas
 * vacías · ¿Va a…? · fotos escondidas · sin descripción) y la de Esenciales
 * (papeles sin leer · fechas encontradas · sugeridas) empujaban los documentos
 * dos o tres filas más abajo; el hueco a la derecha de las pestañas estaba vacío.
 *
 * ── API ──────────────────────────────────────────────────────────────────────
 *
 *   <AvisosCabecera avisos={[…]} enLinea={3} />
 *     · Dentro de Documentos (`ProveedorHuecoAvisos`): va por portal al hueco de
 *       la fila de pestañas. Fuera (sin hueco): en su lugar, en una fila.
 *     · Los primeros `enLinea` avisos que pueden ir a la vista (`enLinea !== false`)
 *       salen como pastilla —ícono + cifra + palabra; un clic hace su acción—
 *       según el ancho de Documentos (container `riel`): 1 desde 48rem, 2 desde
 *       60rem, 3 desde 64rem. El resto, sólo en el menú.
 *     · El menú «Avisos» los trae TODOS, cada uno en su grupo con todas sus
 *       acciones (ver, ocultar, aplicar todas…): nada se pierde al compactar.
 *     · Sin avisos no dibuja nada.
 */

import { createContext, useContext } from "react";
import { createPortal } from "react-dom";
import { BellRing, Loader2, type LucideIcon } from "@buleje/design-system/icons";
import ActionMenu, { type MenuAccion } from "@/components/admin/shared/action-menu";
import { button } from "@/components/ui-system/button-variants";
import { cn } from "@/lib/utils";

/** El hueco de la fila de pestañas. `undefined` = no hay (se pinta en su lugar); `null` = todavía no montó. */
const HuecoAvisos = createContext<HTMLElement | null | undefined>(undefined);
export const ProveedorHuecoAvisos = HuecoAvisos.Provider;

export type TonoAviso = "error" | "warning" | "accent" | "neutro";

export interface OpcionAviso {
  id: string;
  label: string;
  hint?: string;
  icon: LucideIcon;
  onSelect: () => void;
  busy?: boolean;
  /** Lo que está puesto ahora (la lista abierta, el filtro activo): pastilla presionada y tilde en el menú. */
  activo?: boolean;
  disabled?: boolean;
}

export interface AvisoCabecera {
  id: string;
  tono: TonoAviso;
  icono: LucideIcon;
  /** En la pastilla: cifra + palabra («5 vencidos»). */
  corto: string;
  /** Título de su grupo en el menú («Documentos vencidos»). */
  titulo: string;
  /** Lo que explica el ⓘ de antes: tooltip de la pastilla y línea del menú. */
  detalle?: string;
  /** La acción de un clic (la de la pastilla); en el menú va primera. */
  accion: OpcionAviso;
  /** Lo demás (ocultar, aplicar todas, cambiar los días): sólo en el menú. */
  opciones?: OpcionAviso[];
  /** `false` = sólo en el menú (lo informativo, como las fotos escondidas). */
  enLinea?: boolean;
}

/** Desde qué ancho de Documentos se ve cada pastilla (container `riel`). */
const VISIBLE_DESDE = ["@min-[48rem]/riel:inline-flex", "@min-[60rem]/riel:inline-flex", "@min-[64rem]/riel:inline-flex"] as const;

/** Tonos del DS: texto `-ink` (cambia sólo en oscuro), fondo el tinte del estado. */
const TONO: Record<TonoAviso, string> = {
  error:
    "border-[var(--data-error-500)]/40 bg-[var(--data-error-50)] text-[var(--data-error-ink)] hover:border-[var(--data-error-500)] dark:bg-[var(--data-error-500)]/15 dark:hover:border-[var(--data-error-500)]",
  warning:
    "border-[var(--data-warning-500)]/40 bg-[var(--data-warning-50)] text-[var(--data-warning-ink)] hover:border-[var(--data-warning-500)] dark:bg-[var(--data-warning-500)]/15 dark:hover:border-[var(--data-warning-500)]",
  accent:
    "border-[var(--accent)]/40 bg-[var(--accent)]/10 text-[var(--accent-ink)] hover:border-[var(--accent)] dark:text-[var(--accent)] dark:hover:border-[var(--accent)]",
  neutro: "text-[var(--text-secondary)]",
};

function Pastilla({ aviso, visibleDesde }: { aviso: AvisoCabecera; visibleDesde: string }) {
  const { accion, icono: Icono } = aviso;
  return (
    <button
      type="button"
      onClick={accion.onSelect}
      disabled={accion.disabled || accion.busy}
      aria-pressed={accion.activo}
      aria-label={`${aviso.corto}: ${accion.label}`}
      title={[aviso.titulo, aviso.detalle, `Clic: ${accion.label}`].filter(Boolean).join(" · ")}
      data-aviso={aviso.id}
      className={button({
        variant: "secondary",
        size: "md",
        /* h-9 = el alto de las pestañas del riel: la fila no crece. */
        className: cn("hidden h-9 gap-1.5 rounded-lg px-3", TONO[aviso.tono], visibleDesde, accion.activo && "ring-2 ring-[var(--accent)]/50"),
      })}
    >
      {accion.busy ? <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden /> : <Icono className="h-4 w-4 shrink-0" aria-hidden />}
      {aviso.corto}
    </button>
  );
}

function opcionDelMenu(o: OpcionAviso, seccion: string): MenuAccion {
  return { id: o.id, label: o.label, hint: o.hint, icon: o.icon, onSelect: o.onSelect, busy: o.busy, activo: o.activo, disabled: o.disabled, seccion };
}

export default function AvisosCabecera({ avisos, enLinea = 0 }: {
  avisos: readonly AvisoCabecera[];
  /** Cuántos pueden salir como pastilla (máx. 3). 0 = sólo el menú. */
  enLinea?: number;
}) {
  const hueco = useContext(HuecoAvisos);
  if (avisos.length === 0 || hueco === null) return null;

  const aLaVista = avisos.filter((a) => a.enLinea !== false).slice(0, Math.min(enLinea, VISIBLE_DESDE.length));
  const acciones = avisos.flatMap((a) => {
    // El grupo lleva la cifra («Sin descripción (24)»): lo que no sale como pastilla también se cuenta.
    const cifra = /^\d+/.exec(a.corto)?.[0];
    const seccion = cifra ? `${a.titulo} (${cifra})` : a.titulo;
    return [
      opcionDelMenu({ ...a.accion, hint: a.accion.hint ?? a.detalle }, seccion),
      ...(a.opciones ?? []).map((o) => opcionDelMenu(o, seccion)),
    ];
  });
  const hayError = avisos.some((a) => a.tono === "error");

  const contenido = (
    <div className="flex items-center gap-1.5" data-qa="avisos-cabecera">
      {aLaVista.map((a, i) => <Pastilla key={a.id} aviso={a} visibleDesde={VISIBLE_DESDE[i]} />)}
      {/* El rótulo «Avisos» sólo con Documentos ancho: a 1366 Esenciales tiene ~150 px libres en la fila. */}
      <ActionMenu
        label="Avisos"
        icon={BellRing}
        size="sm"
        badge={avisos.length}
        tonoBadge={hayError ? "alerta" : "acento"}
        title={`Avisos (${avisos.length}): ${avisos.map((a) => a.corto).join(" · ")}`}
        claseEtiqueta="@max-[80rem]/riel:sr-only"
        compactoEnMovil
        className="max-sm:h-11 sm:h-9"
        actions={acciones}
      />
    </div>
  );
  return hueco ? createPortal(contenido, hueco) : <div className="flex flex-wrap items-center gap-2">{contenido}</div>;
}
