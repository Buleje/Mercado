"use client";

/**
 * AdminTabShell — wrapper canónico para cada página del admin/superadmin.
 *
 * Rediseño 2026-04-26: header hero premium consistente con /superadmin/marca y
 * /superadmin/banners. Toda página debe envolverse con este shell para evitar
 * divergencia visual entre módulos.
 *
 * Estructura del header:
 *   [icon badge teal] KICKER ACCENT
 *                     Título grande font-display extrabold
 *                     Descripción opcional
 *                     [chip Beta/Universal opcional]
 *                                                  [actions / stats →]
 *
 * El parámetro legacy `chip` sigue funcionando. Nuevo `kicker` para texto
 * uppercase encima del título (ej. "CENTRO DE CONTROL", "PLATAFORMA").
 * Nuevo `stats` para slot derecho con pills de KPI.
 */

import type { ComponentType, ReactNode } from "react";
import { ADMIN_TOKENS } from "./admin-tokens";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";

import { BANDA_MODULO, FILA_TITULO_MODULO, TituloModulo } from "@/components/admin/shared/titulo-modulo";
type LucideIcon = ComponentType<{
  className?: string;
  strokeWidth?: number;
  "aria-hidden"?: boolean;
}>;

interface ChipProps {
  label: string;
  icon?: LucideIcon;
  tone?: "accent" | "muted";
}

interface AdminTabShellProps {
  title: string;
  description?: string;
  icon?: LucideIcon;
  /** Texto uppercase encima del título — ej. "CENTRO DE CONTROL". */
  kicker?: string;
  chip?: ChipProps;
  /** Botones u otros elementos a la derecha del header. */
  actions?: ReactNode;
  /** Slot derecho con stat pills (ej. KPIs del módulo). Si presente, reemplaza actions. */
  stats?: ReactNode;
  /** Ícono de info junto al título con popover (qué hace / a dónde afecta / ejemplo). */
  info?: { title?: string; what: string; affects?: string; example?: string };
  children: ReactNode;
}

export default function AdminTabShell({
  title,
  description,
  icon: Icon,
  kicker,
  chip,
  actions,
  stats,
  info,
  children,
}: AdminTabShellProps) {
  const ChipIcon = chip?.icon;
  /* ⓘ del título: el `info` de la pantalla, o la descripción si no trae uno.
     Las 23 pantallas que pasaban los dos repetían lo mismo con otras palabras. */
  const ayuda = info
    ? { ...info, what: info.what || description || "" }
    : description
      ? { title, what: description }
      : null;

  return (
    <div className={ADMIN_TOKENS.sectionGap}>
      {/* ── Header hero premium ───────────────────────────────────────── */}
      {/* La misma banda e identidad que el Libro TH (titulo-modulo.tsx,
          Brandon 08-10: «todos los títulos iguales, como esta pestaña»). */}
      <header className={BANDA_MODULO}>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 px-3 py-2.5 sm:px-4">
        {/* Base de 20rem, no 0: con `flex-1` (base 0) el header nunca envolvía
            y los stats (`sm:shrink-0`) se comían el ancho — a 958 px el título
            de «Qué tiene cada negocio» medía 0 px, una palabra por renglón
            (Brandon 01-10). Con base real, si no entran juntos los stats bajan
            a la línea siguiente. `min-w-*` no sirve acá: el `* { min-width: 0 }`
            global lo anula (memoria min-w-anulado-por-global). */}
        <div className={`${FILA_TITULO_MODULO} flex-[1_1_20rem]`}>
          <TituloModulo
            icon={Icon}
            eyebrow={kicker}
            title={title}
            className="flex-1"
            ayuda={
              ayuda || chip ? (
                <>
                  {ayuda && <InfoTip side="bottom" {...ayuda} />}
                  {chip && (
                    <span
                      className={
                        chip.tone === "muted"
                          ? ADMIN_TOKENS.chipMuted
                          : ADMIN_TOKENS.chipAccent
                      }
                    >
                      {ChipIcon && <ChipIcon className="h-3 w-3" aria-hidden />}
                      {chip.label}
                    </span>
                  )}
                </>
              ) : undefined
            }
          />
        </div>
        {(stats || actions) && (
          // Brandon 2026-05-21 FIX bug "pedazo blanco al swipe mobile":
          // antes `shrink-0 flex-wrap` no comprimia y empujaba contenido
          // fuera del viewport. En mobile 390px, los chips de fecha (657px
          // combined) overflowearan silenciosamente — el body.scrollWidth
          // se mantenia 390 pero los hijos quedaban renderizados por
          // afuera. Al swipe-left aparecia el "pedazo blanco" reveal.
          //
          // Fix: en mobile (<sm) el wrapper es full-width abajo del
          // titulo (stack), permitiendo a sus hijos hacer su propio
          // overflow-x-auto o wrap. shrink-0 solo desde sm+ donde hay
          // espacio horizontal.
          <div className="flex items-stretch gap-2 flex-wrap w-full sm:w-auto sm:shrink-0 max-w-full overflow-x-auto">
            {stats}
            {actions}
          </div>
        )}
      </div>
      </header>
      {children}
    </div>
  );
}
