"use client";

/**
 * Cruceta de 4 flechas para mover la cámara de la nube (ADR-472).
 *
 * Mantener apretado = se mueve; soltar = frena. El dedo queda «capturado» por
 * la flecha (`setPointerCapture`): en el celular, correrse unos píxeles fuera
 * del botón no frena a mitad de camino, y soltar fuera del botón igual frena.
 * Con el teclado: ←↑→↓ mientras estén apretadas (en todo el visor o sólo en el
 * cuadro enfocado del mosaico), nunca mientras se escribe en un campo.
 */

import { useEffect } from "react";
import { ArrowUp, Square } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import type { Direccion } from "@/lib/camaras/ezviz-control";

const FLECHAS: { d: Direccion; giro: string; texto: string; lugar: string }[] = [
  { d: "up", giro: "", texto: "arriba", lugar: "col-start-2 row-start-1" },
  { d: "left", giro: "-rotate-90", texto: "a la izquierda", lugar: "col-start-1 row-start-2" },
  { d: "right", giro: "rotate-90", texto: "a la derecha", lugar: "col-start-3 row-start-2" },
  { d: "down", giro: "rotate-180", texto: "abajo", lugar: "col-start-2 row-start-3" },
];

const TECLA: Record<string, Direccion> = {
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
};

const BOTON =
  "grid h-11 w-11 place-items-center rounded-full border border-[var(--rule-base)] bg-[var(--surface-raised)]/85 text-[var(--text-primary)] shadow-[var(--shadow-sm)] backdrop-blur transition select-none touch-none hover:border-[var(--accent)] disabled:opacity-40";

/** Las flechas ya son de otro control: un campo, el SD/HD, un menú. */
const escribiendo = (t: EventTarget | null) =>
  t instanceof HTMLElement &&
  (t.isContentEditable ||
    ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName) ||
    !!t.closest(
      '[role="radiogroup"],[role="tablist"],[role="menu"],[role="listbox"],[role="slider"]',
    ));

interface Props {
  moviendo: Direccion | null;
  onMover: (d: Direccion) => void;
  onParar: () => void;
  /** El cuadradito del medio: frena siempre, aunque el panel crea que ya está quieta. */
  onFrenar: () => void;
  /** Sin arriba/abajo si la cámara sólo gira de lado. */
  vertical: boolean;
  /** «documento» = las flechas mueven en todo el visor; «grupo» = sólo con el foco en el cuadro. */
  teclado: "documento" | "grupo";
  nombre: string;
}

export default function ControlesCamaraJoystick({
  moviendo,
  onMover,
  onParar,
  onFrenar,
  vertical,
  teclado,
  nombre,
}: Props) {
  /* En el visor de UNA cámara, las flechas del teclado la mueven. */
  useEffect(() => {
    if (teclado !== "documento") return;
    const abajo = (e: KeyboardEvent) => {
      const d = TECLA[e.key];
      if (!d || e.repeat || e.altKey || e.ctrlKey || e.metaKey || escribiendo(e.target)) return;
      if (!vertical && (d === "up" || d === "down")) return;
      e.preventDefault();
      onMover(d);
    };
    const arriba = (e: KeyboardEvent) => {
      if (TECLA[e.key]) onParar();
    };
    document.addEventListener("keydown", abajo);
    document.addEventListener("keyup", arriba);
    window.addEventListener("blur", onParar);
    return () => {
      document.removeEventListener("keydown", abajo);
      document.removeEventListener("keyup", arriba);
      window.removeEventListener("blur", onParar);
    };
  }, [teclado, vertical, onMover, onParar]);

  return (
    <div
      role="group"
      aria-label={`Mover ${nombre}`}
      className="grid grid-cols-3 grid-rows-3 gap-1"
      onKeyDown={(e) => {
        if (teclado !== "grupo") return;
        const d = TECLA[e.key];
        if (!d || e.repeat || escribiendo(e.target)) return;
        if (!vertical && (d === "up" || d === "down")) return;
        e.preventDefault();
        onMover(d);
      }}
      onKeyUp={(e) => {
        if (teclado === "grupo" && TECLA[e.key]) onParar();
      }}
      onBlur={teclado === "grupo" ? onParar : undefined}
    >
      {FLECHAS.filter((f) => vertical || f.d === "left" || f.d === "right").map((f) => (
        <button
          key={f.d}
          type="button"
          aria-label={`Mover la cámara ${f.texto}`}
          aria-pressed={moviendo === f.d}
          data-ptz={f.d}
          className={cn(
            BOTON,
            f.lugar,
            moviendo === f.d && "border-[var(--accent)] bg-[var(--accent)]/25",
          )}
          onPointerDown={(e) => {
            e.preventDefault();
            e.currentTarget.setPointerCapture?.(e.pointerId);
            onMover(f.d);
          }}
          onPointerUp={onParar}
          onPointerCancel={onParar}
          onLostPointerCapture={onParar}
          onKeyDown={(e) => {
            if (e.repeat || (e.key !== "Enter" && e.key !== " ")) return;
            e.preventDefault();
            onMover(f.d);
          }}
          onKeyUp={(e) => {
            if (e.key === "Enter" || e.key === " ") onParar();
          }}
          onContextMenu={(e) => e.preventDefault()}
        >
          <ArrowUp className={cn("h-5 w-5", f.giro)} aria-hidden />
        </button>
      ))}
      <button
        type="button"
        aria-label="Dejar la cámara quieta"
        title="Frenar"
        className={cn(BOTON, "col-start-2 row-start-2")}
        onClick={onFrenar}
      >
        <Square className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
}
