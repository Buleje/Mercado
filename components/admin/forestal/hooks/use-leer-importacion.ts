"use client";

/**
 * Leer lo que se trae al cubicador desde un archivo (Excel/CSV), una foto de la
 * planilla (IA) o un audio dictado, y bajar la plantilla. Sacado tal cual de
 * `ImportarCubicacionModal` para que el modal no pase las 300 líneas.
 */
import { useCallback, useState } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import { parsearFilasImportadas, interpretarOcrPiezas, interpretarDictadoAudio, PLANTILLA_IMPORT, type ResultadoImport } from "@/lib/forestal/cubicacion-import";
import { leerArchivoAFilas } from "@/lib/forestal/cubicacion-import-file";
import { descargarPlantillaImport } from "@/lib/forestal/cubicador-export";
import { loadConfig } from "@/lib/forestal/cubicador-config";
import type { PlanillaId } from "@/lib/forestal/planillas/tipos";

function leerComoDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result));
    fr.onerror = () => reject(new Error("No se pudo leer la imagen"));
    fr.readAsDataURL(file);
  });
}

export function useLeerImportacion({ planilla, duenos }: { planilla: PlanillaId | null; duenos: readonly string[] }) {
  const [resultado, setResultado] = useState<ResultadoImport | null>(null);
  const [nombreArchivo, setNombreArchivo] = useState("");
  const [cargando, setCargando] = useState(false);
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);
  const [fotoUrl, setFotoUrl] = useState<string | null>(null);
  const [advertenciaIA, setAdvertenciaIA] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<string | null>(null);

  const procesar = useCallback(async (file: File) => {
    setCargando(true);
    setErrorGeneral(null);
    setResultado(null);
    setNombreArchivo(file.name);
    try {
      const filas = await leerArchivoAFilas(file);
      setResultado(parsearFilasImportadas(filas));
    } catch (e) {
      setErrorGeneral(`No se pudo leer el archivo: ${e instanceof Error ? e.message : String(e)}. Prueba con un .xlsx o .csv.`);
    } finally {
      setCargando(false);
    }
  }, []);

  const procesarFoto = useCallback(async (file: File) => {
    setCargando(true);
    setErrorGeneral(null);
    setResultado(null);
    setAdvertenciaIA(null);
    setNombreArchivo(file.name);
    try {
      const dataUrl = await leerComoDataUrl(file);
      setFotoUrl(dataUrl);
      const r = await fetch("/api/admin/forestal/cubicacion-ocr/aserrada", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        credentials: "include",
        body: JSON.stringify(planilla ? { image: dataUrl, planillaId: planilla } : { image: dataUrl }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.message ?? j.error ?? `HTTP ${r.status}`);
      setResultado(interpretarOcrPiezas(j.piezas ?? []));
      if (j.advertencia) setAdvertenciaIA(String(j.advertencia));
    } catch (e) {
      setErrorGeneral(e instanceof Error ? e.message : String(e));
    } finally {
      setCargando(false);
    }
  }, [planilla]);

  const procesarAudio = useCallback(async (file: File) => {
    setCargando(true);
    setErrorGeneral(null);
    setResultado(null);
    setTranscript(null);
    setNombreArchivo(file.name);
    try {
      const fd = new FormData();
      fd.append("audio", file);
      const r = await fetch("/api/admin/forestal/cubicacion-audio", {
        method: "POST",
        headers: csrfHeaders(),
        credentials: "include",
        body: fd,
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.message ?? j.error ?? `HTTP ${r.status}`);
      setTranscript(String(j.transcript ?? ""));
      // El vocabulario de comandos ("fijo"/"especie"/"eliminá el último") es el
      // MISMO que el operario personalizó para el micrófono en vivo en Ajustes
      // — si no, el importador de audio sólo reconocería las frases DEFAULT.
      setResultado(interpretarDictadoAudio(String(j.transcript ?? ""), loadConfig().comandos, duenos));
    } catch (e) {
      setErrorGeneral(e instanceof Error ? e.message : String(e));
    } finally {
      setCargando(false);
    }
  }, [duenos]);

  const [bajando, setBajando] = useState(false);
  const descargarPlantilla = () => {
    // .xlsx real: cada columna en su celda (un CSV se abre en una sola celda con
    // el separador ";" del Excel es-PE). Sin datos: solo los encabezados.
    setBajando(true);
    descargarPlantillaImport(PLANTILLA_IMPORT.headers)
      .catch(() => setErrorGeneral("No se pudo generar la plantilla. Prueba de nuevo."))
      .finally(() => setBajando(false));
  };

  return {
    resultado, setResultado, nombreArchivo, setNombreArchivo, cargando, errorGeneral, setErrorGeneral,
    fotoUrl, setFotoUrl, advertenciaIA, setAdvertenciaIA, transcript, setTranscript,
    procesar, procesarFoto, procesarAudio, bajando, descargarPlantilla,
  };
}
