"use client";

/**
 * Cabecera del mosaico «Ver todas en vivo»: título, minimizar y cerrar; debajo,
 * la vigilancia (2026-10-07) — «Detectar personas», «Ver movimiento» y «Aviso
 * con sonido» (08-10), «No pausar» y la carpeta «Personas» del Drive. Copia la cabecera de `AdminModal` (el mosaico ya no es
 * un `AdminModal`: tiene que poder esconderse sin desmontar los videos).
 */

import type { MouseEvent } from "react";
import { BellRing, FolderOpen, LayoutGrid, Minimize2, Timer, X } from "@buleje/design-system/icons";
import { MODAL_GUTTER } from "@/components/admin/shared/AdminModal";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { DATOS_POR_HORA, MINUTOS_SIN_TOCAR } from "./hik-connect-teams";
import { InterruptoresDetector, InterruptorVivo as Interruptor } from "./InterruptorVivo";

interface Props {
  tituloId: string;
  camaras: number;
  /** Detectar personas y la carpeta: no en el Modo TV (sólo mira). */
  vigilancia: boolean;
  detectar: boolean;
  onDetectar: (v: boolean) => void;
  /** «Ver movimiento»: los recuadros celestes punteados (recordado en este navegador). */
  verMovimiento: boolean;
  onVerMovimiento: (v: boolean) => void;
  /** «Aviso con sonido» al aparecer alguien (recordado; el mensaje sale igual). */
  sonido: boolean;
  onSonido: (v: boolean) => void;
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
            <InterruptoresDetector
              detectar={p.detectar}
              onDetectar={p.onDetectar}
              verMovimiento={p.verMovimiento}
              onVerMovimiento={p.onVerMovimiento}
              donde="mosaico"
            />
            <Interruptor activo={p.sonido} onCambiar={p.onSonido} icono={BellRing}>
              <span className="sm:hidden">Sonido</span>
              <span className="max-sm:hidden">Aviso con sonido</span>
            </Interruptor>
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
            title="Abre las fotos de personas de hoy (el video sigue en la burbuja)"
          >
            <FolderOpen className="h-4 w-4" aria-hidden /> Carpeta Personas
          </a>
        )}
      </div>
    </header>
  );
}
