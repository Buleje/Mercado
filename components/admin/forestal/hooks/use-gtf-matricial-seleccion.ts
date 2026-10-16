"use client";

/**
 * useSeleccionTalonario — qué campos están elegidos y lo que se hace con
 * ellos a la vez (Brandon 15-10: alinear en fila y en columna, «y otras
 * funciones»): Shift/Ctrl+clic suma, un recuadro con el mouse sobre la hoja
 * vacía elige lo que toca, «la fila» / «la columna» del primero (±2 mm), y el
 * grupo se mueve junto con el arrastre o las flechas. Al arrastrar, el imán
 * pega a la cuadrícula y las guías pegan a los bordes y centros de los demás.
 *
 * El PRIMERO elegido es la referencia: alinear e igualar toman su medida.
 * La lógica es de `gtf-matricial-edicion` (pura y con tests); acá sólo el estado.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CATALOGO } from "@/lib/forestal/gtf-matricial-disposicion";
import {
  alinear,
  aplicarMovimientos,
  cajasDeLaHoja,
  elegirAlineados,
  enRecuadro,
  guiasDeAlineacion,
  igualar,
  imantar,
  moverDesde,
  PASOS_IMAN,
  repartir,
  unionCajas,
  type CajaMm,
  type Guias,
  type ModoAlinear,
  type PasoIman,
} from "@/lib/forestal/gtf-matricial-edicion";
import type { EstadoGtfMatricial } from "./use-gtf-matricial";

const CLAVE_IMAN = "gtf-matricial-iman";
/** Cuánto hay que mover el mouse para que un clic sea un arrastre. */
const UMBRAL_PX = 3;
/** A cuántos px de pantalla se pega a una guía. */
const GUIA_PX = 6;

function leerIman(): PasoIman {
  try {
    const crudo = localStorage.getItem(CLAVE_IMAN);
    const v = Number(crudo);
    return crudo != null && (PASOS_IMAN as readonly number[]).includes(v) ? (v as PasoIman) : 0.5;
  } catch {
    return 0.5;
  }
}

export function useSeleccionTalonario(t: EstadoGtfMatricial) {
  const [elegidos, setElegidos] = useState<string[]>([]);
  const [guias, setGuias] = useState<Guias | null>(null);
  const [recuadro, setRecuadro] = useState<CajaMm | null>(null);
  const [iman, setImanEstado] = useState<PasoIman>(0.5);
  const arrastres = useRef(0);
  const cat = CATALOGO[t.formato];
  const cajas = useMemo(() => (t.hoja ? cajasDeLaHoja(t.hoja, cat) : new Map<string, CajaMm>()), [t.hoja, cat]);

  useEffect(() => setImanEstado(leerIman()), []);
  useEffect(() => setElegidos([]), [t.formato]);

  const setIman = useCallback((v: PasoIman) => {
    setImanEstado(v);
    try {
      localStorage.setItem(CLAVE_IMAN, String(v));
    } catch {
      /* sin almacenamiento: el imán vale hasta cerrar */
    }
  }, []);

  /** Elegir uno (o sumarlo / quitarlo con `sumar`). */
  const elegir = useCallback((k: string, sumar = false) => {
    setElegidos((prev) => (sumar ? (prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k]) : [k]));
  }, []);
  const quitarSeleccion = useCallback(() => setElegidos([]), []);
  const elegirTodo = useCallback(() => setElegidos([...cajas.keys()]), [cajas]);
  const elegirFila = useCallback(() => elegidos[0] && setElegidos(elegirAlineados(cajas, elegidos[0], "fila")), [cajas, elegidos]);
  const elegirColumna = useCallback(() => elegidos[0] && setElegidos(elegirAlineados(cajas, elegidos[0], "columna")), [cajas, elegidos]);

  /* La referencia es el primero elegido QUE SE IMPRIME: uno oculto no tiene lugar en la hoja. */
  const alinearSel = useCallback(
    (modo: ModoAlinear) => t.editar((h) => aplicarMovimientos(h, alinear(cajas, elegidos.filter((k) => cajas.has(k)), modo))),
    [t, cajas, elegidos],
  );
  const repartirSel = useCallback((eje: "h" | "v") => t.editar((h) => aplicarMovimientos(h, repartir(cajas, elegidos, eje))), [t, cajas, elegidos]);
  const igualarSel = useCallback((que: "ancho" | "letra") => t.editar((h) => igualar(h, elegidos, que)), [t, elegidos]);

  /** Las flechas mueven a TODOS los elegidos (un paso de deshacer por tecla). */
  const moverConFlechas = useCallback(
    (dx: number, dy: number) => {
      const inicio = new Map(elegidos.filter((k) => cajas.has(k)).map((k) => [k, cajas.get(k) as CajaMm]));
      if (inicio.size) t.editar((h) => aplicarMovimientos(h, moverDesde(inicio, dx, dy)));
    },
    [t, cajas, elegidos],
  );

  /** Clic o arrastre sobre un campo. Shift/Ctrl suma o quita; arrastrar mueve a todos los elegidos. */
  const presionarElemento = useCallback(
    (e: React.PointerEvent, k: string, escala: number) => {
      if (e.button !== 0) return;
      e.stopPropagation();
      const sumar = e.shiftKey || e.ctrlKey || e.metaKey;
      const yaEsta = elegidos.includes(k);
      if (sumar) {
        elegir(k, true);
        if (yaEsta) return;
      } else if (!yaEsta) elegir(k);
      const grupo = sumar || yaEsta ? [...new Set([...elegidos, k])] : [k];
      const inicio = new Map(grupo.filter((x) => cajas.has(x)).map((x) => [x, cajas.get(x) as CajaMm]));
      const union = unionCajas([...inicio.values()]);
      if (!union) return;
      const otras = [...cajas].filter(([x]) => !inicio.has(x)).map(([, c]) => c);
      const x0 = e.clientX;
      const y0 = e.clientY;
      const n = ++arrastres.current;
      let movio = false;
      const mover = (ev: PointerEvent) => {
        if (!movio && Math.hypot(ev.clientX - x0, ev.clientY - y0) < UMBRAL_PX) return;
        movio = true;
        const dx = (ev.clientX - x0) / escala;
        const dy = (ev.clientY - y0) / escala;
        let ddx = imantar(union.x + dx, iman) - union.x;
        let ddy = imantar(union.y + dy, iman) - union.y;
        const g = guiasDeAlineacion({ ...union, x: union.x + ddx, y: union.y + ddy }, otras, GUIA_PX / escala);
        ddx += g.dx;
        ddy += g.dy;
        setGuias(g.guias.x.length || g.guias.y.length ? g.guias : null);
        t.editar((h) => aplicarMovimientos(h, moverDesde(inicio, ddx, ddy)), `arrastre:${n}`);
      };
      const soltar = () => {
        window.removeEventListener("pointermove", mover);
        window.removeEventListener("pointerup", soltar);
        window.removeEventListener("pointercancel", soltar);
        setGuias(null);
        /* Clic sin arrastre sobre uno de varios elegidos: queda sólo él. */
        if (!movio && !sumar && yaEsta && elegidos.length > 1) elegir(k);
      };
      window.addEventListener("pointermove", mover);
      window.addEventListener("pointerup", soltar);
      window.addEventListener("pointercancel", soltar);
    },
    [t, cajas, elegidos, elegir, iman],
  );

  /** Sobre la hoja vacía: con mouse, un recuadro elige lo que toca; un toque solo, quita la selección. */
  const presionarHoja = useCallback(
    (e: React.PointerEvent<HTMLElement>, escala: number) => {
      if (e.button !== 0) return;
      const sumar = e.shiftKey || e.ctrlKey || e.metaKey;
      if (e.pointerType === "touch") {
        if (!sumar) setElegidos([]);
        return;
      }
      const r = e.currentTarget.getBoundingClientRect();
      const aMm = (cx: number, cy: number) => ({ x: (cx - r.left) / escala, y: (cy - r.top) / escala });
      const a = aMm(e.clientX, e.clientY);
      const previos = sumar ? elegidos : [];
      let movio = false;
      const caja = (ev: PointerEvent): CajaMm => {
        const b = aMm(ev.clientX, ev.clientY);
        return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), ancho: Math.abs(b.x - a.x), alto: Math.abs(b.y - a.y) };
      };
      const mover = (ev: PointerEvent) => {
        if (!movio && Math.hypot(ev.clientX - e.clientX, ev.clientY - e.clientY) < UMBRAL_PX) return;
        movio = true;
        setRecuadro(caja(ev));
      };
      const soltar = (ev: PointerEvent) => {
        window.removeEventListener("pointermove", mover);
        window.removeEventListener("pointerup", soltar);
        window.removeEventListener("pointercancel", soltar);
        setRecuadro(null);
        if (ev.type === "pointercancel") return;
        if (!movio) {
          if (!sumar) setElegidos([]);
          return;
        }
        const tocados = enRecuadro(cajas, caja(ev));
        setElegidos([...previos, ...tocados.filter((k) => !previos.includes(k))]);
      };
      window.addEventListener("pointermove", mover);
      window.addEventListener("pointerup", soltar);
      window.addEventListener("pointercancel", soltar);
    },
    [cajas, elegidos],
  );

  /** El centro del primero elegido, en mm (para que la lupa acerque ahí). */
  const centroElegido = useCallback((): { x: number; y: number } | null => {
    const c = cajas.get(elegidos[0] ?? "");
    return c ? { x: c.x + c.ancho / 2, y: c.y + c.alto / 2 } : null;
  }, [cajas, elegidos]);

  return {
    elegidos, setElegidos, elegir, quitarSeleccion, elegirTodo, elegirFila, elegirColumna, cajas,
    alinear: alinearSel, repartir: repartirSel, igualar: igualarSel, moverConFlechas,
    presionarElemento, presionarHoja, guias, recuadro, iman, setIman, centroElegido,
  };
}

export type SeleccionTalonario = ReturnType<typeof useSeleccionTalonario>;
