"use client";

/**
 * use-ancho-panel — un panel lateral que se agarra del borde y se estira, como
 * el explorador de Windows.
 *
 * El ancho fijo siempre le queda mal a alguien: con nombres largos de carpeta
 * hace falta más, y en una pantalla chica el documento pide todo el espacio.
 * Acá el usuario decide, y su decisión se recuerda (localStorage) para la
 * próxima vez que abra la ficha.
 *
 * Detalles que hacen que se sienta nativo:
 *  · el cursor cambia a `col-resize` en TODA la pantalla mientras arrastrás
 *    (si no, al salirte del divisor el cursor parpadea);
 *  · el texto no se selecciona durante el arrastre;
 *  · doble clic en el divisor vuelve al ancho de fábrica;
 *  · el divisor es foco de teclado: flechas mueven de a 16 px (48 con Shift),
 *    Inicio restablece y Enter colapsa/expande — accesible sin mouse.
 */

import { useCallback, useEffect, useRef, useState } from "react";

interface Opciones {
  /** Clave de localStorage (una por panel). */
  clave: string;
  /** Ancho de fábrica, al que vuelve el doble clic. */
  inicial: number;
  min: number;
  max: number;
}

export interface PropsDivisor {
  role: "separator";
  tabIndex: 0;
  "aria-orientation": "vertical";
  "aria-label": string;
  "aria-valuenow": number;
  "aria-valuemin": number;
  "aria-valuemax": number;
  onPointerDown: (e: React.PointerEvent<HTMLElement>) => void;
  onDoubleClick: () => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLElement>) => void;
}

export interface AnchoPanel {
  ancho: number;
  arrastrando: boolean;
  colapsado: boolean;
  alternarColapso: () => void;
  propsDivisor: PropsDivisor;
}

const limitar = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

export function useAnchoPanel({ clave, inicial, min, max }: Opciones): AnchoPanel {
  const [ancho, setAncho] = useState(inicial);
  const [colapsado, setColapsado] = useState(false);
  const [arrastrando, setArrastrando] = useState(false);
  // El ancho vive en un ref además del estado: el listener de pointermove se
  // registra una sola vez y necesita leer el valor actual sin re-suscribirse.
  const anchoRef = useRef(inicial);
  const inicioRef = useRef({ x: 0, ancho: inicial });

  /** Lo guardado gana recién después de montar (no en el estado inicial), para
   *  no romper la hidratación: el servidor no tiene localStorage. */
  useEffect(() => {
    try {
      const guardado = localStorage.getItem(clave);
      if (guardado) {
        const { ancho: a, colapsado: c } = JSON.parse(guardado) as { ancho?: number; colapsado?: boolean };
        if (typeof a === "number" && Number.isFinite(a)) {
          const v = limitar(a, min, max);
          anchoRef.current = v;
          setAncho(v);
        }
        if (typeof c === "boolean") setColapsado(c);
      }
    } catch {
      /* localStorage bloqueado o JSON viejo: se usa el ancho de fábrica */
    }
  }, [clave, min, max]);

  const guardar = useCallback(
    (a: number, c: boolean) => {
      try {
        localStorage.setItem(clave, JSON.stringify({ ancho: a, colapsado: c }));
      } catch {
        /* modo incógnito / cuota llena: el ancho vale para esta sesión */
      }
    },
    [clave],
  );

  const aplicar = useCallback(
    (nuevo: number) => {
      const v = limitar(Math.round(nuevo), min, max);
      anchoRef.current = v;
      setAncho(v);
      return v;
    },
    [min, max],
  );

  const alternarColapso = useCallback(() => {
    setColapsado((c) => {
      guardar(anchoRef.current, !c);
      return !c;
    });
  }, [guardar]);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      if (e.button !== 0) return;
      e.preventDefault();
      inicioRef.current = { x: e.clientX, ancho: anchoRef.current };
      setArrastrando(true);
    },
    [],
  );

  /** El arrastre se escucha en la ventana: el puntero se va del divisor
   *  enseguida y si escucháramos sólo en él, el panel se quedaría trabado. */
  useEffect(() => {
    if (!arrastrando) return;
    const mover = (e: PointerEvent) => aplicar(inicioRef.current.ancho + (e.clientX - inicioRef.current.x));
    const soltar = () => {
      setArrastrando(false);
      guardar(anchoRef.current, false);
    };
    window.addEventListener("pointermove", mover);
    window.addEventListener("pointerup", soltar);
    window.addEventListener("pointercancel", soltar);
    // Cursor y selección a nivel documento: sin esto el cursor cambia sólo
    // sobre el divisor y al arrastrar rápido se selecciona media pantalla.
    const cursorPrevio = document.body.style.cursor;
    const seleccionPrevia = document.body.style.userSelect;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    return () => {
      window.removeEventListener("pointermove", mover);
      window.removeEventListener("pointerup", soltar);
      window.removeEventListener("pointercancel", soltar);
      document.body.style.cursor = cursorPrevio;
      document.body.style.userSelect = seleccionPrevia;
    };
  }, [arrastrando, aplicar, guardar]);

  const restablecer = useCallback(() => {
    guardar(aplicar(inicial), false);
    setColapsado(false);
  }, [aplicar, guardar, inicial]);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLElement>) => {
      const paso = e.shiftKey ? 48 : 16;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        guardar(aplicar(anchoRef.current - paso), colapsado);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        guardar(aplicar(anchoRef.current + paso), colapsado);
      } else if (e.key === "Home") {
        e.preventDefault();
        restablecer();
      } else if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        alternarColapso();
      }
    },
    [aplicar, guardar, colapsado, restablecer, alternarColapso],
  );

  return {
    ancho,
    arrastrando,
    colapsado,
    alternarColapso,
    propsDivisor: {
      role: "separator",
      tabIndex: 0,
      "aria-orientation": "vertical",
      "aria-label": "Ajustar el ancho del panel de carpetas",
      "aria-valuenow": ancho,
      "aria-valuemin": min,
      "aria-valuemax": max,
      onPointerDown,
      onDoubleClick: restablecer,
      onKeyDown,
    },
  };
}
