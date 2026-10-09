"use client";

/**
 * La cola de «Lee un papel»: cada papel (foto, PDF o texto pegado) pasa por el
 * OCR del navegador ($0), después por `/api/admin/comandos-ia/papel/entender`.
 * De a uno: tesseract ocupa ~50 MB y dos lecturas a la vez se pisan el
 * progreso. Al salir de la vista se suelta el motor (`liberarOcr`).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { leerTextoDeImagen, liberarOcr, type ProgresoOcr } from "@/lib/ocr/ocr-navegador";
import { csrfHeaders } from "@/lib/csrf-client";
import { logger } from "@/lib/logger";
import type { RespuestaEntender } from "@/lib/admin/comandos-ia/papel";

export type OrigenPapel = "imagen" | "pdf" | "texto";
export type EstadoPapel = "leyendo" | "entendiendo" | "listo" | "error";

export interface Papel {
  id: string;
  origen: OrigenPapel;
  nombre: string;
  archivo: File | null;
  texto: string;
  /** Confianza del OCR (0-100); null si no hubo OCR (texto pegado, PDF con texto). */
  confianzaOcr: number | null;
  estado: EstadoPapel;
  progreso: ProgresoOcr | null;
  resultado: RespuestaEntender | null;
  error: string | null;
  /** Lo que se guardó («Compra guardada»), para que la tarjeta lo muestre. */
  guardado: string | null;
}

export const AVISO_PDF_ESCANEADO = "Este PDF no trae texto: para un PDF escaneado hace falta la IA de visión.";
const AVISO_FOTO_SIN_TEXTO = "No encontré texto en la foto. Puedes guardarla igual en Documentos.";
const MAX_TEXTO = 12_000;

let secuencia = 0;
const nuevoId = () => `papel-${Date.now().toString(36)}-${(secuencia++).toString(36)}`;

/** Un papel sin texto legible: sólo se puede archivar. */
function soloDocumento(nombre: string, aviso: string): RespuestaEntender {
  return {
    tipo: "otro",
    confianza: 0,
    campos: { titulo: nombre },
    propuesta: { destino: "documento", nombreSugerido: nombre },
    costoIaUsd: 0,
    visionDisponible: false,
    aviso,
  };
}

async function entender(texto: string, nombreArchivo?: string): Promise<RespuestaEntender> {
  const res = await fetch("/api/admin/comandos-ia/papel/entender", {
    method: "POST",
    credentials: "include",
    headers: csrfHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ texto: texto.slice(0, MAX_TEXTO), nombreArchivo: nombreArchivo?.slice(0, 200) }),
  });
  const data: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const error = (data as { error?: unknown } | null)?.error;
    if (res.status === 429) throw new Error("Muchos papeles seguidos: espera un minuto y reintenta.");
    throw new Error(typeof error === "string" ? error : "No pude entender el papel.");
  }
  return data as RespuestaEntender;
}

async function textoDePdf(archivo: File): Promise<string> {
  try {
    const { extractText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(await archivo.arrayBuffer()));
    /* Página por página: `mergePages` aplasta los saltos de línea y las reglas leen por línea. */
    const { text } = await extractText(pdf, { mergePages: false });
    return (Array.isArray(text) ? text.join("\n") : text).trim();
  } catch (err) {
    logger.warn("[comandos-ia/papel] no pude sacar el texto del PDF", { err: String(err) });
    return "";
  }
}

function origenDe(archivo: File): OrigenPapel | null {
  if (archivo.type.startsWith("image/")) return "imagen";
  if (archivo.type === "application/pdf" || /\.pdf$/i.test(archivo.name)) return "pdf";
  if (archivo.type.startsWith("text/")) return "texto";
  return null;
}

export function useLeerPapel() {
  const [papeles, setPapeles] = useState<Papel[]>([]);
  const cola = useRef<Promise<void>>(Promise.resolve());

  const actualizar = useCallback((id: string, cambio: Partial<Papel>) => {
    setPapeles((ps) => ps.map((p) => (p.id === id ? { ...p, ...cambio } : p)));
  }, []);

  useEffect(() => () => {
    liberarOcr().catch((err) => logger.warn("[comandos-ia/papel] liberarOcr falló", { err: String(err) }));
  }, []);

  const procesar = useCallback(async (p: Papel) => {
    try {
      let texto = p.texto;
      let confianzaOcr: number | null = null;
      if (p.origen === "imagen" && p.archivo) {
        actualizar(p.id, { estado: "leyendo" });
        const r = await leerTextoDeImagen(p.archivo, (progreso) => actualizar(p.id, { progreso }));
        texto = r.texto.trim();
        confianzaOcr = Math.round(r.confianza);
      } else if (p.origen === "pdf" && p.archivo) {
        actualizar(p.id, { estado: "leyendo", progreso: { etapa: "Sacando el texto del PDF", progreso: 0.5 } });
        texto = await textoDePdf(p.archivo);
      }
      if (texto.replace(/\s/g, "").length < 3) {
        const aviso = p.origen === "pdf" ? AVISO_PDF_ESCANEADO : AVISO_FOTO_SIN_TEXTO;
        actualizar(p.id, { estado: "listo", texto, confianzaOcr, progreso: null, resultado: soloDocumento(p.nombre, aviso) });
        return;
      }
      actualizar(p.id, { estado: "entendiendo", texto, confianzaOcr, progreso: null });
      const resultado = await entender(texto, p.nombre);
      actualizar(p.id, { estado: "listo", resultado });
    } catch (err) {
      actualizar(p.id, { estado: "error", progreso: null, error: err instanceof Error ? err.message : "No pude leer el papel." });
    }
  }, [actualizar]);

  const encolar = useCallback((nuevos: Papel[]) => {
    if (!nuevos.length) return;
    setPapeles((ps) => [...nuevos, ...ps]);
    for (const p of nuevos) cola.current = cola.current.then(() => procesar(p));
  }, [procesar]);

  const agregarArchivos = useCallback((archivos: File[]): number => {
    const nuevos: Papel[] = [];
    for (const archivo of archivos) {
      const origen = origenDe(archivo);
      if (!origen) continue;
      nuevos.push({
        id: nuevoId(), origen, nombre: archivo.name || "Papel", archivo,
        texto: "", confianzaOcr: null, estado: "leyendo", progreso: null, resultado: null, error: null, guardado: null,
      });
    }
    /* Un .txt se lee acá mismo: no necesita OCR. */
    Promise.all(nuevos.map(async (p) => (p.origen === "texto" && p.archivo ? { ...p, texto: (await p.archivo.text()).slice(0, MAX_TEXTO) } : p)))
      .then(encolar)
      .catch((err) => logger.warn("[comandos-ia/papel] no pude leer el archivo", { err: String(err) }));
    return nuevos.length;
  }, [encolar]);

  const agregarTexto = useCallback((texto: string, nombre = "Texto pegado") => {
    const limpio = texto.trim();
    if (!limpio) return;
    encolar([{
      id: nuevoId(), origen: "texto", nombre, archivo: null, texto: limpio.slice(0, MAX_TEXTO),
      confianzaOcr: null, estado: "entendiendo", progreso: null, resultado: null, error: null, guardado: null,
    }]);
  }, [encolar]);

  const reintentar = useCallback((id: string) => {
    const p = papeles.find((x) => x.id === id);
    if (!p) return;
    actualizar(id, { estado: "leyendo", error: null });
    cola.current = cola.current.then(() => procesar(p));
  }, [papeles, actualizar, procesar]);

  /** El texto que devolvió la IA de visión reemplaza al del OCR y se vuelve a entender. */
  const releer = useCallback(async (id: string, texto: string) => {
    actualizar(id, { estado: "entendiendo", texto, error: null });
    try {
      const resultado = await entender(texto, papeles.find((x) => x.id === id)?.nombre);
      actualizar(id, { estado: "listo", resultado, confianzaOcr: null });
    } catch (err) {
      actualizar(id, { estado: "error", error: err instanceof Error ? err.message : "No pude entender el papel." });
    }
  }, [papeles, actualizar]);

  const quitar = useCallback((id: string) => setPapeles((ps) => ps.filter((p) => p.id !== id)), []);
  const marcarGuardado = useCallback((id: string, resumen: string) => actualizar(id, { guardado: resumen }), [actualizar]);

  return { papeles, agregarArchivos, agregarTexto, reintentar, releer, quitar, marcarGuardado };
}
