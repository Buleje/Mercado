"use client";

/**
 * Cabecera del mosaico «Ver todas en vivo»: título, minimizar y cerrar; debajo,
 * la vigilancia (2026-10-07) — «Detectar personas», «No pausar» y la carpeta
 * «Personas» del Drive. Copia la cabecera de `AdminModal` (el mosaico ya no es
 * un `AdminModal`: tiene que poder esconderse sin desmontar los videos).
 */

import type { ComponentType, MouseEvent, ReactNode } from "react";
import { FolderOpen, LayoutGrid, Minimize2, Timer, Users, X } from "@buleje/design-system/icons";
import { MODAL_GUTTER } from "@/components/admin/shared/AdminModal";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { DATOS_POR_HORA, MINUTOS_SIN_TOCAR } from "./hik-connect-teams";

interface Props {
  tituloId: string;
  camaras: number;
  /** Detectar personas y la carpeta: no en el Modo TV (sólo mira). */
  vigilancia: boolean;
  detectar: boolean;
  onDetectar: (v: boolean) => void;
  sinPausa: boolean;
  onSinPausa: (v: boolean) => void;
  carpetaHref: string | null;
  onIrACarpeta: (e: MouseEvent<HTMLAnchorElement>) => void;
  /** Sin esto (fuera del panel) no hay burbuja: sólo cerrar. */
  onMinimizar?: () => void;
  onCerrar: () => void;
}

const BOTON_ICONO =
  "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-[var(--text-tertiary)] transition-colors hover:bg-[var(--surface-sunken)] hover:text-[var(--text-secondary)] sm:h-8 sm:w-8";

export default function MosaicoNubeCabecera(p: Props) {
  return (
    <header className="shrink-0 border-b border-[var(--rule-base)]">
      <div className={`flex items-center justify-between gap-3 pb-2 pt-4 ${MODAL_GUTTER}`}>
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-[var(--accent-ink)] dark:bg-primary/20 dark:text-[var(--accent)]">
            <LayoutGrid className="h-5 w-5" strokeWidth={1.75} aria-hidden />
          </span>
          <div className="min-w-0">
            <p
              id={p.tituloId}
              className="truncate font-display text-base font-semibold tracking-tight text-[var(--text-primary)] sm:text-lg"
            >
              En vivo · todas ({p.camaras})
            </p>
            <p className="mt-0.5 truncate text-xs text-[var(--text-tertiary)]">
              Video de Hik-Connect dentro del panel
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          {p.onMinimizar && (
            <button
              type="button"
              onClick={p.onMinimizar}
              className={BOTON_ICONO}
              aria-label="Minimizar: el video sigue en una burbuja"
              title="Minimizar (sigue en una burbuja)"
              data-mosaico-minimizar
            >
              <Minimize2 className="h-5 w-5 sm:h-4 sm:w-4" strokeWidth={1.75} aria-hidden />
            </button>
          )}
          <button
            type="button"
            onClick={p.onCerrar}
            className={BOTON_ICONO}
            aria-label="Cerrar y cortar el video"
            title="Cerrar (corta el video)"
          >
            <X className="h-5 w-5 sm:h-4 sm:w-4" strokeWidth={1.75} aria-hidden />
          </button>
        </div>
      </div>

      <div className={`flex flex-wrap items-center gap-x-2 gap-y-1 pb-2 ${MODAL_GUTTER}`}>
        {p.vigilancia && (
          <>
            <Interruptor activo={p.detectar} onCambiar={p.onDetectar} icono={Users}>
              {/* A 400 px «Detectar personas» partía la fila en dos. */}
              <span className="sm:hidden">Personas</span>
              <span className="max-sm:hidden">Detectar personas</span>
            </Interruptor>
            <InfoTip
              title="Detectar personas"
              what="Esta PC mira el video de cada cámara y, cuando aparece alguien, guarda la foto en la carpeta «Personas» del Drive."
              affects="No gasta datos extra: mira el video que ya llega. Minimizado sigue mirando; pausado o cerrado, no."
              example="Minimiza el mosaico y sigue trabajando: la burbuja cuenta las fotos nuevas."
            />
          </>
        )}
        <Interruptor activo={p.sinPausa} onCambiar={p.onSinPausa} icono={Timer}>
          No pausar
        </Interruptor>
        <InfoTip
          title="No pausar"
          what={`Apagado, el video se pausa a los ${MINUTOS_SIN_TOCAR} min sin tocar, también minimizado.`}
          affects={`Prendido, sigue hasta que lo cierres: cada cámara gasta ${DATOS_POR_HORA} de su chip y más batería.`}
          example="Para vigilar el patio un rato largo desde la PC de la oficina."
        />
        {p.vigilancia && p.carpetaHref && (
          <a
            href={p.carpetaHref}
            onClick={p.onIrACarpeta}
            className="ml-auto inline-flex min-h-9 items-center gap-1.5 text-sm font-bold text-[var(--accent-ink)] underline-offset-4 hover:underline dark:text-[var(--accent)]"
            title="Abre la carpeta del Drive con las fotos de personas (el video sigue en la burbuja)"
          >
            <FolderOpen className="h-4 w-4" aria-hidden /> Carpeta Personas
          </a>
        )}
      </div>
    </header>
  );
}

function Interruptor({
  activo,
  onCambiar,
  icono: Icono,
  children,
}: {
  activo: boolean;
  onCambiar: (v: boolean) => void;
  icono: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={activo}
      onClick={() => onCambiar(!activo)}
      className="inline-flex min-h-9 items-center gap-2 rounded-lg pr-1 text-sm font-bold text-[var(--text-secondary)] max-sm:min-h-11"
    >
      <span
        aria-hidden
        className={`relative h-6 w-10 shrink-0 rounded-full border transition-colors ${activo ? "border-[var(--accent-600,var(--accent))] bg-[var(--accent-600,var(--accent))]" : "border-[var(--rule-strong)]/40 bg-[var(--surface-sunken)]"}`}
      >
        <span
          className={`absolute top-0.5 h-4.5 w-4.5 rounded-full bg-[var(--surface-raised)] shadow-[var(--shadow-sm)] transition-[left] ${activo ? "left-[1.1rem]" : "left-0.5"}`}
        />
      </span>
      <Icono className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]" aria-hidden />
      {children}
    </button>
  );
}
