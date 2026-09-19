"use client";

/**
 * Mover la cámara desde el panel (ADR-421).
 *
 * Sólo se dibuja si el aparato dijo que se mueve (`conexion.soportaPtz`): una
 * cruceta gris que no hace nada es peor que no tenerla — el operario aprieta,
 * no pasa nada, y a partir de ahí desconfía de toda la pantalla.
 *
 * ## Mientras se mantiene apretado
 *
 * La cámara no se mueve «un paso»: se mueve **mientras** se le manda el
 * comando y frena cuando le llega el cero. Por eso cada botón manda al apretar
 * (`pointerdown`) y manda ceros al soltar (`pointerup`), al salirse el dedo del
 * botón (`pointerleave`, muy común en celular) y al cancelarse el gesto. Sin el
 * cero la cámara sigue girando sola hasta el tope, y recuperarla es ir hasta el
 * patio.
 *
 * El centro de la cruceta es el joystick en reposo: deja la cámara quieta donde
 * está. Es el mismo cero, a mano, por si un comando de freno se perdió.
 */

import { useCallback, useEffect, useRef } from "react";
import { ArrowUp, Square, ZoomIn, ZoomOut } from "@buleje/design-system/icons";

/**
 * Cuánto de los 100 posibles.
 *
 * 60 es rápido para reencuadrar sin pasarse: al 100 un toque corto ya deja el
 * patio fuera de cuadro y hay que volver a buscarlo.
 */
const VELOCIDAD = 60;

/** Las 8 direcciones. `y` positivo es arriba; el giro es el de la flecha. */
const DIRECCIONES = [
  { clave: "nw", x: -VELOCIDAD, y: VELOCIDAD, giro: "-rotate-45", texto: "arriba y a la izquierda" },
  { clave: "n", x: 0, y: VELOCIDAD, giro: "", texto: "arriba" },
  { clave: "ne", x: VELOCIDAD, y: VELOCIDAD, giro: "rotate-45", texto: "arriba y a la derecha" },
  { clave: "w", x: -VELOCIDAD, y: 0, giro: "-rotate-90", texto: "a la izquierda" },
  { clave: "e", x: VELOCIDAD, y: 0, giro: "rotate-90", texto: "a la derecha" },
  { clave: "sw", x: -VELOCIDAD, y: -VELOCIDAD, giro: "rotate-[225deg]", texto: "abajo y a la izquierda" },
  { clave: "s", x: 0, y: -VELOCIDAD, giro: "rotate-180", texto: "abajo" },
  { clave: "se", x: VELOCIDAD, y: -VELOCIDAD, giro: "rotate-[135deg]", texto: "abajo y a la derecha" },
] as const;

/** Las teclas que mueven, con el mismo significado que los botones. */
const TECLAS: Record<string, readonly [number, number, number]> = {
  ArrowUp: [0, VELOCIDAD, 0],
  ArrowDown: [0, -VELOCIDAD, 0],
  ArrowLeft: [-VELOCIDAD, 0, 0],
  ArrowRight: [VELOCIDAD, 0, 0],
  "+": [0, 0, VELOCIDAD],
  "=": [0, 0, VELOCIDAD],
  "-": [0, 0, -VELOCIDAD],
  _: [0, 0, -VELOCIDAD],
};

const BOTON =
  "grid h-11 w-11 place-items-center rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)] transition select-none touch-none hover:border-[var(--accent)] hover:text-[var(--text-primary)] active:bg-primary/10 disabled:opacity-40";

interface Props {
  /** Manda el movimiento. `(0, 0, 0)` es frenar. */
  onMover: (x: number, y: number, zoom: number) => void;
  disabled?: boolean;
}

export default function ControlPtz({ onMover, disabled }: Props) {
  /* Sólo se manda el freno si antes se mandó un movimiento: sin esto, cada
     `pointerleave` del mouse paseando por encima dispara un comando al aparato. */
  const moviendoRef = useRef(false);

  const mover = useCallback(
    (x: number, y: number, zoom: number) => {
      if (disabled) return;
      moviendoRef.current = true;
      onMover(x, y, zoom);
    },
    [disabled, onMover],
  );

  const frenar = useCallback(() => {
    if (!moviendoRef.current) return;
    moviendoRef.current = false;
    onMover(0, 0, 0);
  }, [onMover]);

  /* Si el componente se va (se cerró el visor, se desconectó la cámara) con un
     botón todavía apretado, la cámara se quedaría girando. */
  useEffect(() => () => { if (moviendoRef.current) onMover(0, 0, 0); }, [onMover]);

  const gestos = (x: number, y: number, z: number) => ({
    onPointerDown: (e: React.PointerEvent) => { e.preventDefault(); mover(x, y, z); },
    onPointerUp: frenar,
    onPointerLeave: frenar,
    onPointerCancel: frenar,
    /* Enter y Espacio sobre el botón enfocado: mismo apretar-y-soltar. Las
       flechas las atiende el grupo, más abajo. */
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.repeat || (e.key !== "Enter" && e.key !== " ")) return;
      e.preventDefault();
      mover(x, y, z);
    },
    onKeyUp: (e: React.KeyboardEvent) => { if (e.key === "Enter" || e.key === " ") frenar(); },
  });

  const botonDireccion = (d: (typeof DIRECCIONES)[number]) => {
    return (
      <button
        key={d.clave}
        type="button"
        disabled={disabled}
        aria-label={`Mover la cámara ${d.texto}`}
        className={BOTON}
        {...gestos(d.x, d.y, 0)}
      >
        <ArrowUp className={`h-5 w-5 ${d.giro}`} aria-hidden />
      </button>
    );
  };

  return (
    <div
      role="group"
      aria-label="Mover la cámara"
      className="flex flex-wrap items-center gap-3 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] p-3"
      onKeyDown={(e) => {
        const t = TECLAS[e.key];
        if (!t || e.repeat) return;
        e.preventDefault();
        mover(t[0], t[1], t[2]);
      }}
      onKeyUp={(e) => { if (TECLAS[e.key]) frenar(); }}
      /* Si el foco se va del grupo con una tecla apretada, nadie manda el cero. */
      onBlur={frenar}
    >
      <div className="grid grid-cols-3 gap-1">
        {botonDireccion(DIRECCIONES[0])}
        {botonDireccion(DIRECCIONES[1])}
        {botonDireccion(DIRECCIONES[2])}
        {botonDireccion(DIRECCIONES[3])}
        <button
          type="button"
          disabled={disabled}
          aria-label="Dejar la cámara quieta"
          title="Suelta el mando: la cámara se queda donde está"
          className={BOTON}
          onClick={() => { moviendoRef.current = true; frenar(); }}
        >
          <Square className="h-4 w-4" aria-hidden />
        </button>
        {botonDireccion(DIRECCIONES[4])}
        {botonDireccion(DIRECCIONES[5])}
        {botonDireccion(DIRECCIONES[6])}
        {botonDireccion(DIRECCIONES[7])}
      </div>

      <div className="flex flex-col gap-1">
        <button type="button" disabled={disabled} aria-label="Acercar el zoom" className={BOTON} {...gestos(0, 0, VELOCIDAD)}>
          <ZoomIn className="h-5 w-5" aria-hidden />
        </button>
        <button type="button" disabled={disabled} aria-label="Alejar el zoom" className={BOTON} {...gestos(0, 0, -VELOCIDAD)}>
          <ZoomOut className="h-5 w-5" aria-hidden />
        </button>
      </div>

      {/* En celular la ayuda baja a su propia fila: al lado de la cruceta y el
          zoom quedaba en una columna de seis letras (medido a 400 px). */}
      <p className="basis-full flex-1 text-xs text-[var(--text-secondary)] sm:min-w-[10rem] sm:basis-auto">
        Mantén apretado para mover; al soltar, la cámara frena.
        <span className="mt-0.5 block text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
          Con el teclado: las flechas mueven y las teclas + y − hacen el zoom, mientras las tengas
          apretadas.
        </span>
      </p>
    </div>
  );
}
