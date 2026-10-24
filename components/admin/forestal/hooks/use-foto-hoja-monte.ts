"use client";

/**
 * use-foto-hoja-monte — la foto de la guía ya impresa en el talonario (16-10).
 *
 * Una foto hace dos cosas a la vez:
 *   · se guarda en los PAPELES de la guía, casillero «GTF» (ADR-482; nada de
 *     almacenamiento nuevo) y queda atada al envío (`accion: "foto"`). Otra
 *     foto del mismo envío REEMPLAZA a la anterior: el casillero no se llena
 *     de repeticiones;
 *   · se le pide a la IA el N° preimpreso de la hoja, sólo como propuesta. Sin
 *     clave de IA (503) no pasa nada: el N° se escribe a mano.
 *
 * Cada foto nueva invalida a la anterior (`turno`): una respuesta que llega
 * tarde no pisa la de la foto que se ve.
 */

import { useCallback, useRef, useState } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import { logger } from "@/lib/logger";
import { limpiarNumeroHoja } from "@/lib/forestal/gtf-cola-monte";
import type { TrabajoImpresion } from "@/lib/forestal/gtf-salida-tipos";
import { fotoEnJpeg } from "./use-placa-foto";
import type { CambioTrabajo, Respuesta } from "./use-cola-monte";

const RUTA_DOCS = "/api/admin/forestal/guias/documentos";
const RUTA_LEER = "/api/admin/forestal/loth/gtf-cola/leer-hoja";
/** El serial preimpreso es chico: más píxeles que la placa del tocón. */
const LADO_MAX = 2000;

export interface PropuestaHoja {
  numero: string;
  confianza: number;
}

async function mensajeDe(res: Response, porDefecto: string): Promise<string> {
  const j = (await res.json().catch((err: unknown) => {
    logger.warn("[foto-hoja-monte] respuesta sin JSON", { status: res.status, error: String(err) });
    return null;
  })) as { message?: string; error?: string } | null;
  if (res.status === 413) return "La foto es muy grande: tómala de nuevo.";
  return j?.message ?? porDefecto;
}

/** Sube la foto al casillero «GTF» de la guía. Devuelve el id del documento. */
async function subirFoto(numeroGuia: string, blob: Blob, reemplaza?: string): Promise<Respuesta<string>> {
  const form = new FormData();
  form.set("gtf", numeroGuia);
  form.set("casillero", "gtf");
  form.set("file", new File([blob], `hoja-${numeroGuia}.jpg`, { type: "image/jpeg" }));
  if (reemplaza) form.set("reemplaza", reemplaza);
  try {
    const res = await fetch(RUTA_DOCS, { method: "POST", credentials: "include", headers: csrfHeaders(), body: form });
    /* La foto anterior ya no está (la quitaron de los papeles): va como nueva. */
    if (res.status === 404 && reemplaza) return subirFoto(numeroGuia, blob);
    if (!res.ok) return { ok: false, mensaje: await mensajeDe(res, "No se pudo guardar la foto.") };
    const j = (await res.json()) as { documento?: { id?: string } };
    return j.documento?.id ? { ok: true, valor: j.documento.id } : { ok: false, mensaje: "No se pudo guardar la foto." };
  } catch {
    return { ok: false, mensaje: "Sin señal: la foto no subió. Prueba de nuevo." };
  }
}

/** La propuesta de la IA, o `null` si no hay lector o no se vio el N°. Nunca tira. */
async function leerHoja(dataUrl: string): Promise<PropuestaHoja | null> {
  try {
    const res = await fetch(RUTA_LEER, {
      method: "POST",
      credentials: "include",
      headers: csrfHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ image: dataUrl }),
    });
    if (!res.ok) {
      if (res.status !== 503) logger.warn("[foto-hoja-monte] lectura sin N°", { status: res.status });
      return null;
    }
    const j = (await res.json()) as { numero?: string; confianza?: number };
    const numero = limpiarNumeroHoja(j.numero ?? "");
    return numero ? { numero, confianza: j.confianza ?? 0 } : null;
  } catch (e) {
    logger.warn("[foto-hoja-monte] lectura sin red", { error: String(e) });
    return null;
  }
}

export function useFotoHojaMonte(t: TrabajoImpresion, cambiar: (id: string, c: CambioTrabajo) => Promise<Respuesta<unknown>>) {
  const [vista, setVista] = useState<string | null>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [leyendo, setLeyendo] = useState(false);
  const [propuesta, setPropuesta] = useState<PropuestaHoja | null>(null);
  const [error, setError] = useState<string | null>(null);
  const turno = useRef(0);

  const tomar = useCallback(
    async (file: File) => {
      const n = ++turno.current;
      const vigente = () => n === turno.current;
      setError(null);
      setPropuesta(null);
      let foto: { blob: Blob; dataUrl: string };
      try {
        foto = await fotoEnJpeg(file, LADO_MAX);
      } catch (e) {
        logger.warn("[foto-hoja-monte] foto ilegible", { error: String(e) });
        if (vigente()) setError("No se pudo abrir la foto: tómala de nuevo.");
        return;
      }
      if (!vigente()) return;
      setVista(foto.dataUrl);
      setSubiendo(true);
      setLeyendo(true);
      const leer = leerHoja(foto.dataUrl).then((p) => {
        if (vigente()) {
          setPropuesta(p);
          setLeyendo(false);
        }
      });
      const subir = subirFoto(t.numeroGuia, foto.blob, t.fotoDocId).then(async (r) => {
        if (!vigente()) return;
        const c = r.ok ? await cambiar(t.id, { accion: "foto", fotoDocId: r.valor }) : r;
        if (vigente()) {
          if (!c.ok) setError(c.mensaje);
          setSubiendo(false);
        }
      });
      await Promise.all([leer, subir]);
    },
    [t.id, t.numeroGuia, t.fotoDocId, cambiar],
  );

  return { vista, subiendo, leyendo, propuesta, error, tomar };
}

export type FotoHojaMonte = ReturnType<typeof useFotoHojaMonte>;
