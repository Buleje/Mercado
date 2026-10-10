"use client";

/**
 * El visor del puente de pantalla (ADR-466): lo que la PC está mirando en
 * Hik-Connect, casi en vivo.
 *
 * No es video: es el último cuadro que mandó la PC, pedido cada segundo
 * (`usePuenteDeFila`). Al pie, qué tan fresco es («en vivo · hace 2 s») o
 * desde cuándo no llega nada; abajo, lo que la IA leyó en la última foto que
 * pasó al historial —el cuadro en vivo no lo lee nadie: leer uno por segundo
 * serían US$864 al día—.
 */

import type { ReactNode, RefObject } from "react";
import { Crop, Loader2, Maximize2, Monitor, Radio, WifiOff } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { textoPastilla, textoSenal } from "./puente-pc";
import { useCuadroPuente, type CuadroPuente } from "./use-puente-pc";

const BOTON_CHICO =
  "inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--rule-base)] px-2.5 text-xs font-bold text-[var(--text-secondary)] transition hover:border-[var(--accent)] hover:text-[var(--text-primary)]";

interface Props {
  nombre: string;
  cuadro: CuadroPuente;
  cajaRef: RefObject<HTMLDivElement | null>;
  /** Abre «Conectar» en el puente: recorte, ajustes y el comando para la PC. Sin esto (Modo TV), sólo mirar. */
  onAjustar?: () => void;
  /** La última lectura de la IA, debajo del cuadro. */
  children?: ReactNode;
}

export default function VisorPuentePc({ nombre, cuadro, cajaRef, onAjustar, children }: Props) {
  const { src, senal, edadMs, detalle } = cuadro;
  const vivo = senal === "vivo";

  const pantallaCompleta = () => {
    const caja = cajaRef.current;
    if (!caja) return;
    if (document.fullscreenElement === caja) void document.exitFullscreen?.();
    else void caja.requestFullscreen?.();
  };

  return (
    <div className="space-y-2">
      <div ref={cajaRef} className="overflow-hidden rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)]">
        <div className="relative aspect-video w-full bg-[var(--surface-sunken)]">
          {src && (
            // eslint-disable-next-line @next/next/no-img-element -- cuadro en vivo del puente (blob local), sin tamaño conocido
            <img
              src={src}
              alt={`Lo que la PC está mirando de ${nombre}`}
              className={cn("h-full w-full object-contain", !vivo && "opacity-60")}
            />
          )}
          {!src && senal === "esperando" && (
            <p className="absolute inset-0 flex items-center justify-center gap-2 text-sm text-[var(--text-tertiary)]">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Buscando el puente…
            </p>
          )}
          {!src && senal !== "esperando" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-4 text-center">
              <Monitor className="h-6 w-6 text-[var(--text-tertiary)]" aria-hidden />
              <p className="text-sm font-bold text-[var(--text-primary)]">{textoSenal(senal, edadMs)}</p>
              <p className="max-w-[28rem] text-xs text-[var(--text-secondary)]">
                Arranca el script en la PC y deja la ventana de Hik-Connect a la vista, sin minimizar.
              </p>
              {onAjustar && (
                <button type="button" onClick={onAjustar} className={BOTON_CHICO}>
                  <Monitor className="h-3.5 w-3.5" aria-hidden /> Ver el comando
                </button>
              )}
            </div>
          )}
          {src && !vivo && (
            <span className="absolute left-2 top-2 inline-flex items-center gap-1.5 rounded-lg bg-[var(--surface-canvas)]/90 px-2 py-1 text-xs font-bold text-[var(--text-primary)]">
              <WifiOff className="h-3.5 w-3.5 text-[var(--data-warning-ink)]" aria-hidden />
              {textoSenal(senal, edadMs)}
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-[var(--rule-base)] bg-[var(--surface-raised)] px-2.5 py-2">
          <span className="inline-flex items-center gap-1.5 text-xs font-bold text-[var(--text-secondary)]" aria-live="polite">
            {vivo ? (
              <Radio className="h-4 w-4 text-[var(--data-success-600)] dark:text-[var(--data-success-500)]" aria-hidden />
            ) : (
              <WifiOff className="h-4 w-4 text-[var(--text-tertiary)]" aria-hidden />
            )}
            {senal === "esperando" ? "Conectando…" : textoSenal(senal, edadMs)}
          </span>
          <span className="ml-auto flex items-center gap-1">
            {onAjustar && (
              <button type="button" onClick={onAjustar} className={BOTON_CHICO}>
                <Crop className="h-3.5 w-3.5" aria-hidden /> Recorte y ajustes
              </button>
            )}
            <button
              type="button"
              onClick={pantallaCompleta}
              aria-label="Ver en pantalla completa"
              className="grid h-9 w-9 place-items-center rounded-lg border border-[var(--rule-base)] text-[var(--text-secondary)] transition hover:border-[var(--accent)] hover:text-[var(--text-primary)]"
            >
              <Maximize2 className="h-4 w-4" aria-hidden />
            </button>
          </span>
          {detalle && (
            <span className="basis-full text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]" aria-live="polite">
              {detalle}
            </span>
          )}
        </div>
      </div>
      {children}
    </div>
  );
}

/** La pastilla de la lista para una cámara con puente: «Puente PC · en vivo / sin señal». */
export function PastillaPuente({ cuadro }: { cuadro: CuadroPuente }) {
  const vivo = cuadro.senal === "vivo";
  return (
    <span
      title={textoSenal(cuadro.senal, cuadro.edadMs)}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-xs font-bold",
        vivo
          ? "border-[var(--data-success-500)]/40 bg-[var(--data-success-500)]/10 text-[var(--data-success-700)] dark:text-[var(--data-success-500)]"
          : "border-[var(--rule-base)] bg-[var(--surface-sunken)] text-[var(--text-secondary)]",
      )}
    >
      {vivo ? <Radio className="h-3.5 w-3.5" aria-hidden /> : <Monitor className="h-3.5 w-3.5" aria-hidden />}
      {textoPastilla(cuadro.senal)}
    </span>
  );
}

/** La pastilla sola, con su propio pedido de señal (un `HEAD` cada 15 s): para la línea de estado de «Fotos». */
export function SenalPuente({ camaraId, baseApi }: { camaraId: string; baseApi?: string }) {
  const cuadro = useCuadroPuente(camaraId, { activo: true, modo: "senal", baseApi });
  return <PastillaPuente cuadro={cuadro} />;
}
