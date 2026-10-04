"use client";

/**
 * El cuadro en vivo del puente de pantalla (Brandon 2026-10-03).
 *
 * La PC manda la captura de Hik-Connect cada segundo y el servidor guarda la
 * última en memoria; acá se la pide a `GET /api/admin/camaras/[id]/cuadro`
 * (la imagen con su hora en `X-Cuadro-Ts`, o 204 si en 60 s no llegó nada).
 *
 * Dos ritmos, por lo que se está mirando:
 *  · **imagen** — el visor abierto: el cuadro cada ~1 s.
 *  · **señal** — sólo la pastilla «en vivo / sin señal» de la lista: un `HEAD`
 *    cada 15 s, que trae la hora sin bajar la imagen.
 *
 * Los pedidos van encadenados (el siguiente sale cuando volvió el anterior,
 * nunca con `setInterval`) y se pausan con la pestaña de fondo: con el panel
 * abierto todo el día en la PC del aserradero, una pestaña olvidada no puede
 * seguir bajando una imagen por segundo.
 */

import { useEffect, useRef, useState, type RefObject } from "react";
import { logger } from "@/lib/logger";
import {
  camposPuente,
  edadDelCuadro,
  esperaSiguiente,
  leerTsCuadro,
  senalPorEdad,
  type SenalPuente,
} from "./puente-pc";

export interface CuadroPuente {
  /** El último cuadro como `blob:` local. `null` = todavía ninguno (o modo señal). */
  src: string | null;
  senal: SenalPuente;
  /** Qué tan viejo es el último cuadro AHORA (se mueve cada segundo). */
  edadMs: number | null;
  /** Por qué falló el último pedido, para el pie del visor. */
  detalle: string | null;
}

export type ModoPuente = "imagen" | "senal";

const RITMO: Record<ModoPuente, number> = { imagen: 1000, senal: 15_000 };

/** ¿La pestaña se está viendo? Con la pestaña de fondo no se pide nada. */
export function usePestanaVisible(): boolean {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const alCambiar = () => setVisible(!document.hidden);
    alCambiar();
    document.addEventListener("visibilitychange", alCambiar);
    return () => document.removeEventListener("visibilitychange", alCambiar);
  }, []);
  return visible;
}

export function useCuadroPuente(
  camaraId: string,
  opciones: { activo: boolean; modo: ModoPuente; ritmoMs?: number },
): CuadroPuente {
  const { activo, modo } = opciones;
  const ritmo = opciones.ritmoMs ?? RITMO[modo];
  const pestanaVisible = usePestanaVisible();
  const corriendo = activo && pestanaVisible;

  const [src, setSrc] = useState<string | null>(null);
  const [senal, setSenal] = useState<SenalPuente>("esperando");
  const [detalle, setDetalle] = useState<string | null>(null);
  /* La edad se guarda como «tenía X ms cuando llegó a las T»: así el «hace N s»
     sigue corriendo entre pedido y pedido sin volver a preguntar. */
  const [base, setBase] = useState<{ edad: number; recibido: number } | null>(null);
  const [ahora, setAhora] = useState(() => Date.now());

  const srcRef = useRef<string | null>(null);
  const tsRef = useRef<number | null>(null);
  /** El servidor no conoce `HEAD`: se pasa a `GET` y no se vuelve a probar. */
  const sinHeadRef = useRef(false);

  useEffect(() => {
    if (!corriendo) return;
    let vigente = true;
    let fallos = 0;
    let temporizador: ReturnType<typeof setTimeout> | null = null;
    let control: AbortController | null = null;
    let n = 0;

    const pedir = async () => {
      control = new AbortController();
      const metodo = modo === "senal" && !sinHeadRef.current ? "HEAD" : "GET";
      let proxima: SenalPuente = "error";
      try {
        n += 1;
        const r = await fetch(`/api/admin/camaras/${encodeURIComponent(camaraId)}/cuadro?n=${n}`, {
          method: metodo,
          credentials: "include",
          cache: "no-store",
          signal: control.signal,
        });
        if (metodo === "HEAD" && r.status === 405) {
          sinHeadRef.current = true;
          temporizador = setTimeout(() => void pedir(), 0);
          return;
        }
        if (r.status === 204) {
          proxima = "sin_senal";
          fallos = 0;
          setDetalle(null);
        } else if (r.ok) {
          const ts = leerTsCuadro(r.headers.get("X-Cuadro-Ts"));
          const edad = edadDelCuadro(ts, r.headers.get("Date"), Date.now());
          if (modo === "imagen" && metodo === "GET" && (ts === null || ts !== tsRef.current)) {
            const blob = await r.blob();
            if (!vigente) return;
            const nueva = URL.createObjectURL(blob);
            if (srcRef.current) URL.revokeObjectURL(srcRef.current);
            srcRef.current = nueva;
            setSrc(nueva);
          } else if (metodo === "GET") {
            /* El mismo cuadro de recién: no se baja de nuevo. */
            await r.body?.cancel().catch((err: unknown) =>
              logger.warn("[camaras.puente] no se pudo soltar el cuerpo", { error: String(err) }),
            );
          }
          tsRef.current = ts;
          if (edad !== null) setBase({ edad, recibido: Date.now() });
          proxima = senalPorEdad(edad);
          fallos = 0;
          setDetalle(null);
        } else {
          fallos += 1;
          setDetalle(
            r.status === 401 || r.status === 403
              ? "La sesión del panel se venció: vuelve a entrar."
              : r.status === 404
                ? "El panel todavía no sabe recibir el puente (404)."
                : `El panel respondió ${r.status}.`,
          );
        }
      } catch (e) {
        if (!vigente || (e instanceof DOMException && e.name === "AbortError")) return;
        fallos += 1;
        setDetalle("Sin conexión con el panel.");
      }
      if (!vigente) return;
      setSenal(proxima);
      temporizador = setTimeout(() => void pedir(), esperaSiguiente(proxima, fallos, ritmo));
    };

    void pedir();
    return () => {
      vigente = false;
      if (temporizador) clearTimeout(temporizador);
      control?.abort();
    };
  }, [camaraId, corriendo, modo, ritmo]);

  /* El reloj del «hace N s»: sólo corre mientras se mira. */
  useEffect(() => {
    if (!corriendo) return;
    const t = setInterval(() => setAhora(Date.now()), 1000);
    return () => clearInterval(t);
  }, [corriendo]);

  useEffect(
    () => () => {
      if (srcRef.current) URL.revokeObjectURL(srcRef.current);
      srcRef.current = null;
    },
    [],
  );

  const edadMs = base ? base.edad + Math.max(0, ahora - base.recibido) : null;
  /* Entre pedido y pedido la edad sigue creciendo: si pasó el minuto, ya es
     «sin señal» aunque el último pedido haya dicho «vivo». */
  const senalVista = senal === "vivo" ? senalPorEdad(edadMs) : senal;
  return { src, senal: senalVista, edadMs, detalle };
}

/**
 * El puente de UNA fila de la lista: la pastilla y el visor comparten el mismo
 * pedido, así no se contradicen («en vivo» arriba y «sin señal» abajo).
 *
 * Con el visor a la vista se pide la imagen; oculto o fuera de la pantalla,
 * sólo la señal. `cajaRef` va en la caja del visor para saber si se ve.
 */
export function usePuenteDeFila(
  camara: { id: string },
  visorOculto: boolean,
): { esPuente: boolean; cuadro: CuadroPuente; cajaRef: RefObject<HTMLDivElement | null> } {
  const esPuente = camposPuente(camara).fuente === "puente_pc";
  const cajaRef = useRef<HTMLDivElement | null>(null);
  const [enPantalla, setEnPantalla] = useState(true);

  useEffect(() => {
    const caja = cajaRef.current;
    if (!esPuente || visorOculto || !caja || typeof IntersectionObserver === "undefined") return;
    const obs = new IntersectionObserver((e) => setEnPantalla(e.some((x) => x.isIntersecting)), {
      threshold: 0.05,
    });
    obs.observe(caja);
    return () => obs.disconnect();
  }, [esPuente, visorOculto]);

  const cuadro = useCuadroPuente(camara.id, {
    activo: esPuente,
    modo: esPuente && !visorOculto && enPantalla ? "imagen" : "senal",
  });
  return { esPuente, cuadro, cajaRef };
}

/** Cada cuánto se recarga la lista con un puente andando, para traer la foto nueva y su lectura. */
const RECARGA_PUENTE_MS = 30_000;

/**
 * El servidor guarda la foto del puente cuando la imagen cambia, sin avisarle
 * a la pantalla: sin esto, la «última lectura de la IA» debajo del visor se
 * quedaba en la de cuando se abrió la pestaña. Recarga en silencio cada 30 s,
 * sólo si hay una cámara con puente y la pestaña se está viendo.
 */
export function useRecargaPuente(hayPuente: boolean, recargar: () => void): void {
  const visible = usePestanaVisible();
  const recargarRef = useRef(recargar);
  recargarRef.current = recargar;
  useEffect(() => {
    if (!hayPuente || !visible) return;
    const t = setInterval(() => recargarRef.current(), RECARGA_PUENTE_MS);
    return () => clearInterval(t);
  }, [hayPuente, visible]);
}
