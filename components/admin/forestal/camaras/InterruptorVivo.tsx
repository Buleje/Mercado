"use client";

/**
 * Los interruptores del vivo de la nube (mosaico y visor de una cámara):
 * «Detectar personas» y «Ver movimiento» (08-10), cada uno con su ⓘ. Antes los
 * recuadros celestes del movimiento salían siempre que se detectaban personas;
 * ahora tienen su propio interruptor, recordado en este navegador
 * (`use-ver-movimiento.ts`). El movimiento lo ve el MISMO detector: con
 * «Detectar personas» apagado no hay nada que pintar y el interruptor se apaga.
 */

import type { ComponentType, ReactNode } from "react";
import { Scan, Users } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";

export function InterruptorVivo({
  activo,
  onCambiar,
  icono: Icono,
  deshabilitado = false,
  titulo,
  children,
}: {
  activo: boolean;
  onCambiar: (v: boolean) => void;
  icono: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  deshabilitado?: boolean;
  titulo?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={activo}
      onClick={() => onCambiar(!activo)}
      disabled={deshabilitado}
      title={titulo}
      className="inline-flex min-h-9 items-center gap-2 rounded-lg pr-1 text-sm font-bold text-[var(--text-secondary)] disabled:cursor-not-allowed disabled:opacity-60 max-sm:min-h-11"
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

interface PropsDetector {
  detectar: boolean;
  onDetectar: (v: boolean) => void;
  verMovimiento: boolean;
  onVerMovimiento: (v: boolean) => void;
  /** El ⓘ de «Detectar personas» habla del mosaico (minimizar, burbuja) o de una cámara sola. */
  donde: "mosaico" | "camara";
}

const DETECTAR: Record<PropsDetector["donde"], { what: string; affects: string; example: string }> =
  {
    mosaico: {
      what: "Esta PC mira el video de cada cámara, marca a cada persona con un recuadro y su número y, cuando aparece alguien, te avisa y guarda la foto en la carpeta «Personas» del Drive.",
      affects:
        "No gasta datos extra: mira el video que ya llega. Minimizado sigue mirando y avisando; pausado o cerrado, no.",
      example:
        "Minimiza el mosaico y sigue trabajando: si entra alguien al patio, suena y sale «Apareció 1 persona en Patio de trozas».",
    },
    camara: {
      what: "Esta PC mira el video de esta cámara, marca a cada persona con un recuadro y su número y, cuando aparece alguien, guarda la foto en la carpeta «Personas» del Drive.",
      affects:
        "No gasta datos extra: mira el video que ya llega. Las fotos van a la misma carpeta «Personas» que las del mosaico.",
      example:
        "Abre «En vivo» del portón y deja la ventana: cada persona sale con su recuadro y su número.",
    },
  };

const GRUPO = "inline-flex items-center gap-2";

export function InterruptoresDetector(p: PropsDetector) {
  const textos = DETECTAR[p.donde];
  /* Cada interruptor con su ⓘ en un grupo: a 400 px el ⓘ de «Movimiento» quedaba solo en otra fila. */
  return (
    <>
      <span className={GRUPO}>
        <InterruptorVivo activo={p.detectar} onCambiar={p.onDetectar} icono={Users}>
          {/* A 400 px «Detectar personas» partía la fila en dos. */}
          <span className="sm:hidden">Personas</span>
          <span className="max-sm:hidden">Detectar personas</span>
        </InterruptorVivo>
        <InfoTip
          title="Detectar personas"
          what={textos.what}
          affects={textos.affects}
          example={textos.example}
        />
      </span>
      <span className={GRUPO}>
        <InterruptorVivo
          activo={p.detectar && p.verMovimiento}
          onCambiar={p.onVerMovimiento}
          icono={Scan}
          deshabilitado={!p.detectar}
          titulo={
            p.detectar
              ? undefined
              : "Prende «Detectar personas»: el movimiento lo ve el mismo detector"
          }
        >
          <span className="sm:hidden">Movimiento</span>
          <span className="max-sm:hidden">Ver movimiento</span>
        </InterruptorVivo>
        <InfoTip
          title="Ver movimiento"
          what="Pinta un recuadro celeste punteado donde algo se movió: gente, un carro, ramas con viento."
          affects="Sólo cambia lo que ves: el detector sigue buscando personas, avisando y guardando fotos igual. Se recuerda en este navegador."
          example="Apágalo si los recuadros tapan a las personas; préndelo para ver por qué el detector se fijó en una esquina."
        />
      </span>
    </>
  );
}
