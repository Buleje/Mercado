"use client";

/**
 * El cuadro de la cámara con las «zonas a ignorar» encima (2026-10-08): se
 * arrastra con el mouse o el dedo para marcar un rectángulo (hasta 4) y cada
 * uno tiene su ✕. Las cajas punteadas son lo que el detector ve como persona
 * en este cuadro (si estaba cargado): tachadas y grises si una zona las tapa.
 *
 * Mismo arrastre que `RecorteCuadro` (puntero capturado, esquina de inicio en
 * un ref para los toques rápidos) y los mismos helpers de fracciones.
 */

import { useRef, useState, type PointerEvent } from "react";
import { Loader2, X } from "@buleje/design-system/icons";
import {
  cajaIgnorada,
  LADO_MINIMO_ZONA,
  MAX_ZONAS_IGNORAR,
  type ZonaIgnorada,
} from "@/lib/camaras/zonas-ignorar";
import { cn } from "@/lib/utils";
import { estiloRecorte, fraccionEnCaja, recorteDeArrastre } from "./puente-pc";
import type { EstadoImagenZonas } from "./use-zonas-imagen";

type Punto = { x: number; y: number };

interface Props {
  src: string | null;
  estado: EstadoImagenZonas;
  /** Qué decir si no hay cuadro (depende de dónde se abrió). */
  sinImagen: string;
  zonas: readonly ZonaIgnorada[];
  onAgregar: (zona: ZonaIgnorada) => void;
  onBorrar: (indice: number) => void;
  /** Cajas de persona del detector en este cuadro (fracciones), o `null` si no miró. */
  cajas: readonly ZonaIgnorada[] | null;
  /** Para que el detector mire la imagen ya cargada. */
  onImagen: (img: HTMLImageElement | null) => void;
  onCargada: (src: string) => void;
}

const ZONA =
  "absolute rounded-sm border-2 border-[var(--data-warning-500)] bg-[var(--data-warning-500)]/25";

export default function ZonasDibujo({
  src,
  estado,
  sinImagen,
  zonas,
  onAgregar,
  onBorrar,
  cajas,
  onImagen,
  onCargada,
}: Props) {
  const imgRef = useRef<HTMLImageElement | null>(null);
  const inicioRef = useRef<Punto | null>(null);
  const [arrastre, setArrastre] = useState<{ a: Punto; b: Punto } | null>(null);
  /* Ancho × alto del cuadro: la caja toma su proporción y crece hasta 40rem
     (una foto chica del historial se veía de 320 px y no se podía apuntar). */
  const [proporcion, setProporcion] = useState<number | null>(null);
  const lleno = zonas.length >= MAX_ZONAS_IGNORAR;
  const hayImagen = estado === "lista" && !!src;

  const punto = (e: PointerEvent<HTMLDivElement>) =>
    fraccionEnCaja(e.clientX, e.clientY, (imgRef.current ?? e.currentTarget).getBoundingClientRect());

  const alBajar = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || lleno || !hayImagen) return;
    if ((e.target as HTMLElement).closest("[data-sin-dibujo]")) return;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* Sin captura (puntero sintético) el arrastre igual anda dentro de la caja. */
    }
    const p = punto(e);
    inicioRef.current = p;
    setArrastre({ a: p, b: p });
  };
  const alMover = (e: PointerEvent<HTMLDivElement>) => {
    const a = inicioRef.current;
    if (a) setArrastre({ a, b: punto(e) });
  };
  const alSoltar = (e: PointerEvent<HTMLDivElement>) => {
    const a = inicioRef.current;
    if (!a) return;
    inicioRef.current = null;
    setArrastre(null);
    const z = recorteDeArrastre(a, punto(e), LADO_MINIMO_ZONA);
    if (z) onAgregar(z);
  };

  const enCurso = arrastre ? recorteDeArrastre(arrastre.a, arrastre.b, 0) : null;

  return (
    <div className="flex justify-center rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] p-2">
      <div
        role="presentation"
        onPointerDown={alBajar}
        onPointerMove={alMover}
        onPointerUp={alSoltar}
        onPointerCancel={() => {
          inicioRef.current = null;
          setArrastre(null);
        }}
        style={
          hayImagen && proporcion ? { width: `min(100%, 40rem, calc(55vh * ${proporcion}))` } : undefined
        }
        className={cn(
          "relative max-w-full touch-none select-none overflow-hidden rounded-lg",
          hayImagen ? "block" : "aspect-video w-full",
          hayImagen && !lleno && "cursor-crosshair",
        )}
        data-zonas-dibujo
      >
        {hayImagen && src ? (
          // eslint-disable-next-line @next/next/no-img-element -- cuadro local (data URL) o foto del historial, tamaño desconocido
          <img
            ref={(el) => {
              imgRef.current = el;
              onImagen(el);
            }}
            src={src}
            alt="Cuadro de la cámara para marcar las zonas"
            draggable={false}
            onLoad={(e) => {
              const { naturalWidth: w, naturalHeight: h } = e.currentTarget;
              setProporcion(w > 0 && h > 0 ? w / h : null);
              onCargada(src);
            }}
            className="block h-auto w-full"
          />
        ) : (
          <p className="absolute inset-0 flex items-center justify-center gap-2 px-4 text-center text-sm text-[var(--text-tertiary)]">
            {estado === "cargando" ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Trayendo el cuadro…
              </>
            ) : (
              sinImagen
            )}
          </p>
        )}

        {hayImagen &&
          cajas?.map((c, i) => {
            const fuera = cajaIgnorada({ x: c.x, y: c.y, ancho: c.w, alto: c.h }, 1, 1, zonas);
            return (
              <span
                key={`caja-${i}`}
                aria-hidden
                style={estiloRecorte(c)}
                data-caja-persona={fuera ? "ignorada" : "cuenta"}
                className={cn(
                  "pointer-events-none absolute rounded-sm border-2 border-dashed",
                  fuera ? "border-[var(--text-tertiary)]" : "border-[var(--accent)]",
                )}
              >
                <span
                  className={cn(
                    "absolute left-0 top-0 rounded-br-sm bg-[var(--surface-raised)] px-1 text-xs font-bold",
                    fuera ? "text-[var(--text-tertiary)] line-through" : "text-[var(--accent-ink)] dark:text-[var(--accent)]",
                  )}
                >
                  Persona
                </span>
              </span>
            );
          })}

        {hayImagen &&
          zonas.map((z, i) => (
            <span key={`zona-${i}-${z.x}-${z.y}`} style={estiloRecorte(z)} className={ZONA} data-zona-ignorar={i + 1}>
              <span className="absolute left-0 top-0 rounded-br-sm bg-[var(--surface-raised)] px-1 text-xs font-bold text-[var(--data-warning-ink)]">
                {i + 1}
              </span>
              <button
                type="button"
                data-sin-dibujo
                onClick={() => onBorrar(i)}
                aria-label={`Borrar la zona ${i + 1}`}
                title={`Borrar la zona ${i + 1}`}
                className="absolute right-0.5 top-0.5 grid h-6 w-6 place-items-center rounded-full border border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)] shadow-[var(--shadow-sm)] before:absolute before:-inset-2 before:content-[''] hover:text-[var(--data-error-ink)]"
              >
                <X className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
              </button>
            </span>
          ))}

        {enCurso && (
          <span aria-hidden style={estiloRecorte(enCurso)} className={cn(ZONA, "pointer-events-none border-dashed")} />
        )}
      </div>
    </div>
  );
}
