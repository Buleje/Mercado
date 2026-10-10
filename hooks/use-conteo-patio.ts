"use client";

/**
 * useConteoPatio — el estado de «Contar el patio» (ADR-436, 2026-09-26).
 *
 * Trae lo que debería haber en el patio (`GET /trozas/patio`), guarda cada
 * escaneo en el equipo (localStorage, por negocio y día) y sobrevive a una
 * recarga o a quedarse sin señal: sin servidor se sigue contando contra la
 * última foto del patio, diciendo de cuándo es.
 *
 * No escribe en la base. La lógica de las tres listas vive en
 * `lib/forestal/conteo-patio.ts` (pura, con test).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { logger } from "@/lib/logger";
import { limaDateKey } from "@/lib/utils";
import { getActiveTenantSlug } from "@/lib/tenant-fetch";
import type { TrozaConsumible } from "@/lib/forestal/consumo-trozas";
import {
  aTrozaDelConteo,
  anotarDesconocido,
  anotarTroza,
  claveDelConteo,
  clavesViejas,
  leerConteoGuardado,
  nuevoConteo,
  quitarLectura,
  reemplazarFoto,
  resumirConteo,
  type ConteoPatio,
  type LecturaConteo,
  type TrozaDelConteo,
} from "@/lib/forestal/conteo-patio";
import { canchaDe, nombreDeCancha } from "@/lib/forestal/conteo-patio-pasos";

/** Quién está contando y en qué negocio: se recuerda para poder abrir sin señal. */
const CLAVE_YO = "conteo-patio:yo";

interface Yo {
  tenant: string;
  quien: string;
}

function leerLocal(clave: string): string | null {
  try {
    return localStorage.getItem(clave);
  } catch {
    return null;
  }
}

function yoGuardado(): Yo | null {
  try {
    const d = JSON.parse(leerLocal(CLAVE_YO) ?? "null") as Partial<Yo> | null;
    return d && typeof d.tenant === "string" && d.tenant
      ? { tenant: d.tenant, quien: typeof d.quien === "string" ? d.quien : "" }
      : null;
  } catch {
    return null;
  }
}

async function quienSoy(): Promise<Yo> {
  try {
    const r = await fetch("/api/auth/me", { credentials: "include", cache: "no-store" });
    if (r.ok) {
      const d = (await r.json()) as { tenantId?: string | null; name?: string | null; username?: string | null };
      if (d.tenantId) {
        const yo = { tenant: d.tenantId, quien: d.name?.trim() || d.username?.trim() || "" };
        try {
          localStorage.setItem(CLAVE_YO, JSON.stringify(yo));
        } catch {
          /* Modo privado o cuota llena: se sigue, sólo no se recuerda. */
        }
        return yo;
      }
    }
  } catch {
    /* Sin señal: se usa lo recordado. */
  }
  return yoGuardado() ?? { tenant: getActiveTenantSlug(), quien: "" };
}

/**
 * `zonaId → nombre` de las canchas del Mapa de Planta, para decir en el acta
 * dónde ir a buscar lo que falta. Falla en `{}`: sin mapa se cuenta igual.
 */
async function canchasDelMapa(): Promise<Record<string, string>> {
  try {
    const r = await fetch("/api/admin/forestal/ctp/planta", { credentials: "include" });
    if (!r.ok) return {};
    const d = (await r.json()) as { zonas?: { id: string; codigo?: string | null; nombre?: string | null }[] };
    return Object.fromEntries((d.zonas ?? []).map((z) => [z.id, nombreDeCancha(z)]));
  } catch (err) {
    logger.warn("[conteo-patio] mapa de planta no disponible", { error: String(err) });
    return {};
  }
}

/** Lo que el botón del patio necesita saber: hay un conteo de HOY sin terminar. */
export function conteoDeHoyEnCurso(): { contadas: number; total: number } | null {
  const yo = yoGuardado();
  if (!yo) return null;
  const c = leerConteoGuardado(leerLocal(claveDelConteo(yo.tenant, limaDateKey())));
  if (!c || c.terminadoEn || c.lecturas.length === 0) return null;
  const r = resumirConteo(c);
  return { contadas: r.contadas, total: r.total };
}

export type EstadoConteo = "cargando" | "listo" | "error";

export function useConteoPatio() {
  const [conteo, setConteo] = useState<ConteoPatio | null>(null);
  const [estado, setEstado] = useState<EstadoConteo>("cargando");
  const [error, setError] = useState<string | null>(null);
  /** Lo esperado no se pudo actualizar: se cuenta contra la foto guardada. */
  const [avisoFoto, setAvisoFoto] = useState<string | null>(null);
  const [avisoGuardado, setAvisoGuardado] = useState<string | null>(null);
  const [negocio, setNegocio] = useState<string | null>(null);
  const claveRef = useRef<string | null>(null);
  const yoRef = useRef<Yo | null>(null);
  /** La foto del patio más nueva, para «Empezar otro conteo» sin volver a pedirla. */
  const fotoRef = useRef<{ trozas: TrozaDelConteo[]; truncado: boolean } | null>(null);

  /** Sólo la última carga pinta (en dev el efecto corre dos veces; y «Reintentar»). */
  const cargaRef = useRef(0);

  const cargar = useCallback(async () => {
    const n = ++cargaRef.current;
    const vigente = () => n === cargaRef.current;
    setEstado((e) => (e === "listo" ? e : "cargando"));
    setError(null);
    setAvisoFoto(null);
    const yo = await quienSoy();
    yoRef.current = yo;
    const hoy = limaDateKey();
    const clave = claveDelConteo(yo.tenant, hoy);
    claveRef.current = clave;
    const guardado = leerConteoGuardado(leerLocal(clave));

    fetch("/api/admin/membrete", { credentials: "include" })
      .then((r) => (r.ok ? (r.json() as Promise<{ nombre?: string | null }>) : null))
      .then((d) => setNegocio(d?.nombre?.trim() || null))
      .catch((err) => logger.warn("[conteo-patio] membrete no disponible", { error: String(err) }));

    /* En paralelo con el patio: sólo pone nombre a la cancha, no lo frena. */
    const canchasP = canchasDelMapa();
    try {
      const r = await fetch("/api/admin/forestal/trozas/patio", { credentials: "include" });
      if (!r.ok) throw new Error(`El servidor respondió ${r.status}`);
      const d = (await r.json()) as { trozas?: (TrozaConsumible & { zonaId?: string | null })[]; truncado?: boolean };
      const canchas = await canchasP;
      const trozas = (d.trozas ?? []).map((t) => ({ ...aTrozaDelConteo(t), cancha: canchaDe(t, canchas) }));
      const truncado = d.truncado === true;
      fotoRef.current = { trozas, truncado };
      if (!vigente()) return;
      const ahora = new Date().toISOString();
      /* Sobre el estado ACTUAL, no sobre lo leído al empezar: si ya se escaneó
         algo mientras llegaba el patio, eso no se pisa. */
      setConteo((actual) => {
        const previo = actual ?? guardado;
        if (!previo) return nuevoConteo({ fecha: hoy, quien: yo.quien, trozas, ahora, truncado });
        return previo.terminadoEn ? previo : reemplazarFoto(previo, trozas, ahora, truncado);
      });
      setEstado("listo");
    } catch (e) {
      if (!vigente()) return;
      if (guardado) {
        setConteo((actual) => actual ?? guardado);
        setAvisoFoto(
          e instanceof TypeError
            ? "Sin señal: cuentas contra lo que había en el patio al empezar."
            : `No se pudo actualizar lo esperado (${e instanceof Error ? e.message : String(e)}).`,
        );
        setEstado("listo");
      } else {
        setError(
          e instanceof TypeError
            ? "Sin señal. Conéctate una vez para traer lo que hay en el patio; después puedes contar sin señal."
            : `No se pudo traer el patio: ${e instanceof Error ? e.message : String(e)}.`,
        );
        setEstado("error");
      }
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  /* Cada cambio se guarda en el equipo. Un conteo sin nada escaneado no se
     guarda: abrir la pantalla y volver no deja un «conteo en curso» vacío. */
  useEffect(() => {
    const clave = claveRef.current;
    if (!conteo || !clave) return;
    try {
      if (conteo.lecturas.length === 0 && !conteo.terminadoEn) localStorage.removeItem(clave);
      else localStorage.setItem(clave, JSON.stringify(conteo));
      setAvisoGuardado(null);
    } catch (err) {
      logger.warn("[conteo-patio] no se pudo guardar en el equipo", { error: String(err) });
      setAvisoGuardado("No se pudo guardar en este equipo: si recargas, se pierde lo contado.");
    }
  }, [conteo]);

  const ahora = () => new Date().toISOString();

  const anotar = useCallback((t: TrozaDelConteo) => {
    setConteo((c) => (c ? anotarTroza(c, t, ahora()) : c));
  }, []);

  const anotarCodigo = useCallback((codigo: string) => {
    setConteo((c) => (c ? anotarDesconocido(c, codigo, ahora()) : c));
  }, []);

  const quitar = useCallback((l: Pick<LecturaConteo, "trozaId" | "codigo">) => {
    setConteo((c) => (c ? quitarLectura(c, l) : c));
  }, []);

  /** Devuelve el conteo terminado para armar el acta en el MISMO clic. */
  const terminar = useCallback((): ConteoPatio | null => {
    if (!conteo) return null;
    const fin = { ...conteo, terminadoEn: conteo.terminadoEn ?? ahora() };
    setConteo(fin);
    return fin;
  }, [conteo]);

  const seguirContando = useCallback(() => {
    setConteo((c) => (c ? { ...c, terminadoEn: null } : c));
  }, []);

  /** Deja el conteo de hoy y empieza uno en blanco con la foto más nueva. */
  const empezarOtro = useCallback(() => {
    const yo = yoRef.current;
    if (!yo || !conteo) return;
    const foto = fotoRef.current ?? { trozas: conteo.trozas, truncado: conteo.truncado };
    const hoy = limaDateKey();
    try {
      const claves = Object.keys(localStorage);
      for (const k of clavesViejas(claves, yo.tenant, hoy)) localStorage.removeItem(k);
    } catch {
      /* Limpiar días viejos es cortesía: si falla, no pasa nada. */
    }
    claveRef.current = claveDelConteo(yo.tenant, hoy);
    setConteo(nuevoConteo({ fecha: hoy, quien: yo.quien, trozas: foto.trozas, ahora: ahora(), truncado: foto.truncado }));
  }, [conteo]);

  return {
    conteo,
    estado,
    error,
    avisoFoto,
    avisoGuardado,
    negocio,
    reintentar: cargar,
    anotar,
    anotarCodigo,
    quitar,
    terminar,
    seguirContando,
    empezarOtro,
  };
}
