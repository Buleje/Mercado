"use client";

/**
 * useActaDelConteo — al terminar «Contar el patio», el acta va al libro para
 * que la vean todos (Brandon 2026-09-26). Hasta ahora vivía sólo en el
 * localStorage del celular que contó.
 *
 * Se manda el `ConteoPatio` ENTERO (`POST /patio/conteos`): el servidor
 * recalcula los totales y guarda faltantes, sobrantes y sorpresas. Por la cola
 * del patio (`escribirDelPatio`): sin señal —lo normal frente a la pila— queda
 * en la tablet y se sube sola al volver; un rechazo del servidor se muestra.
 * Si en la cola quedaba una versión anterior de la MISMA acta, la nueva la
 * reemplaza (y el servidor no deja que una más vieja pise a la nueva).
 *
 * Se manda sola cuando el conteo queda terminado. La tablet recuerda la FIRMA
 * de lo que ya mandó (`firmaDelConteo`): recargar no la duplica, y «Seguir
 * contando» + terminar otra vez la vuelve a mandar (el servidor actualiza la
 * misma acta, llave `iniciadoEn`).
 *
 * «Quedó en la tablet» no es para siempre: mientras la pantalla está abierta
 * (y al volver a abrirla) se mira la cola. Si ya no está, subió → «guardada»;
 * si la cola la rechazó, se dice por qué y se puede reintentar.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { logger } from "@/lib/logger";
import { EVENTO_CAMBIO, escribirDelPatio, estadoDelDueno, listar } from "@/lib/forestal/patio-cola";
import { firmaDelConteo } from "@/lib/forestal/conteo-patio-historial";
import type { ConteoPatio } from "@/lib/forestal/conteo-patio";

const URL_CONTEOS = "/api/admin/forestal/patio/conteos";
const CLAVE = "conteo-patio:actas";
/** Las últimas actas mandadas desde esta tablet: de sobra para una semana de conteos. */
const MAX_RECORDADAS = 20;

export type EstadoActa = "nada" | "subiendo" | "guardada" | "en-equipo" | "error";

type Recordadas = Record<string, { firma: string; estado: "guardada" | "en-equipo" }>;

function leerRecordadas(): Recordadas {
  try {
    const d = JSON.parse(window.localStorage.getItem(CLAVE) ?? "{}") as unknown;
    return d && typeof d === "object" && !Array.isArray(d) ? (d as Recordadas) : {};
  } catch {
    return {};
  }
}

function escribirRecordadas(todas: Recordadas) {
  const claves = Object.keys(todas).sort().slice(-MAX_RECORDADAS);
  window.localStorage.setItem(CLAVE, JSON.stringify(Object.fromEntries(claves.map((k) => [k, todas[k]]))));
}

function recordar(iniciadoEn: string, firma: string, estado: "guardada" | "en-equipo") {
  try {
    escribirRecordadas({ ...leerRecordadas(), [iniciadoEn]: { firma, estado } });
  } catch (err) {
    logger.warn("[conteo-patio] no se pudo recordar el acta mandada", { error: String(err) });
  }
}

/** La cola la rechazó: se olvida, para que un reintento la vuelva a mandar. */
function olvidar(iniciadoEn: string) {
  try {
    const { [iniciadoEn]: _fuera, ...resto } = leerRecordadas();
    escribirRecordadas(resto);
  } catch (err) {
    logger.warn("[conteo-patio] no se pudo olvidar el acta rechazada", { error: String(err) });
  }
}

export function useActaDelConteo(conteo: ConteoPatio | null) {
  const [estado, setEstado] = useState<EstadoActa>("nada");
  const [mensaje, setMensaje] = useState<string | null>(null);
  /** La firma que se está mandando o que ya falló: el efecto no la reintenta en bucle. */
  const intentada = useRef<string | null>(null);
  /** La firma que la pantalla muestra ahora: una respuesta de la cola de otra versión no pinta. */
  const vigente = useRef<string | null>(null);

  const subir = useCallback(async (c: ConteoPatio) => {
    const firma = firmaDelConteo(c);
    if (!firma) return;
    intentada.current = firma;
    setEstado("subiendo");
    setMensaje(null);
    try {
      const r = await escribirDelPatio({ section: "conteo", url: URL_CONTEOS, payload: { conteo: c } });
      if (r.estado === "error") {
        setEstado("error");
        setMensaje(r.mensaje ?? "El servidor no aceptó el acta.");
        return;
      }
      const final = r.estado === "ok" ? "guardada" : "en-equipo";
      recordar(c.iniciadoEn, firma, final);
      setEstado(final);
    } catch (e) {
      /* Sin IndexedDB no hay cola: no se puede prometer que suba después. */
      logger.warn("[conteo-patio] no se pudo guardar el acta", { error: String(e) });
      setEstado("error");
      setMensaje("Sin señal y esta tablet no pudo guardar el acta. Reintenta cuando vuelva la señal.");
    }
  }, []);

  /**
   * ¿El acta que quedó «en la tablet» sigue en la cola? Si ya no está, la
   * cola la subió. Sin IndexedDB no se sabe: queda como estaba.
   */
  const mirarLaCola = useCallback(async (iniciadoEn: string, firma: string) => {
    let lista;
    try {
      lista = await listar();
    } catch {
      return;
    }
    if (vigente.current !== firma) return;
    const { pendiente, rechazo } = estadoDelDueno(lista, `conteo:${iniciadoEn}`);
    if (pendiente) return;
    if (rechazo) {
      olvidar(iniciadoEn);
      intentada.current = firma;
      setEstado("error");
      setMensaje(rechazo);
      return;
    }
    recordar(iniciadoEn, firma, "guardada");
    setEstado("guardada");
  }, []);

  useEffect(() => {
    const firma = conteo ? firmaDelConteo(conteo) : null;
    vigente.current = firma;
    if (!conteo || !firma) {
      intentada.current = null;
      setEstado("nada");
      setMensaje(null);
      return;
    }
    const previa = leerRecordadas()[conteo.iniciadoEn];
    if (previa?.firma === firma) {
      setEstado(previa.estado);
      if (previa.estado === "en-equipo") void mirarLaCola(conteo.iniciadoEn, firma);
      return;
    }
    if (intentada.current === firma) return;
    void subir(conteo);
  }, [conteo, subir, mirarLaCola]);

  /* Mientras espera en la tablet, cada cambio de la cola (subió, se rechazó) se mira. */
  const iniciadoEn = conteo?.iniciadoEn ?? null;
  useEffect(() => {
    if (estado !== "en-equipo" || !iniciadoEn) return;
    const alCambiar = () => {
      const firma = vigente.current;
      if (firma) void mirarLaCola(iniciadoEn, firma);
    };
    window.addEventListener(EVENTO_CAMBIO, alCambiar);
    return () => window.removeEventListener(EVENTO_CAMBIO, alCambiar);
  }, [estado, iniciadoEn, mirarLaCola]);

  const reintentar = useCallback(() => {
    if (conteo) void subir(conteo);
  }, [conteo, subir]);

  return { estado, mensaje, reintentar };
}
