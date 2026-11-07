"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { marcarCodigoFisicoEnServidor } from "@/hooks/use-documents";
import { logger } from "@/lib/logger";
import {
  agruparArchivadores,
  indexarPapeles,
  juzgarLectura,
  progresoDelDestino,
  type Destino,
  type PapelDelArchivador,
  type Veredicto,
} from "@/lib/documentos/archivador-celular";
import { avisarLectura } from "./aviso-lectura";

/** Dónde está el marcado de un papel leído: `cola` (espera la tanda), `enviando`, `listo`, `deshecho`. */
export type Envio = "no" | "cola" | "enviando" | "listo" | "deshecho";

export interface Lectura {
  n: number;
  veredicto: Veredicto;
  envio: Envio;
}

/* Una tanda cada 15 s como mucho: el servidor deja 60 marcados cada 15 min por persona
   (DRIVE_BULK) y a un sticker cada 3-5 s, uno por uno se pasaba a los 5 minutos. */
const ESPERA_MS = 15_000;
const REINTENTO_MS = 30_000;
const TANDA_MAX = 25;
const LLAVE_DESTINO = "documentos:archivador-celular:destino";

const idDe = (v: Veredicto) => (v.estado === "desconocido" ? null : v.papel.id);

function leerDestinoGuardado(): Destino | null {
  try {
    const d = JSON.parse(localStorage.getItem(LLAVE_DESTINO) ?? "null") as Destino | null;
    return d && typeof d.clave === "string" && typeof d.archivador === "string" ? d : null;
  } catch {
    return null;
  }
}

export function useModoArchivador() {
  const [papeles, setPapeles] = useState<PapelDelArchivador[] | null>(null);
  const [error, setError] = useState(false);
  const [destino, setDestinoEstado] = useState<Destino | null>(null);
  const [ultimoDestino] = useState(leerDestinoGuardado);
  const [lecturas, setLecturas] = useState<Lectura[]>([]);
  const [fallo, setFallo] = useState(false);
  const colaRef = useRef(new Set<string>());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const enCursoRef = useRef<Promise<void> | null>(null);
  const seqRef = useRef(0);
  const ultimaRef = useRef<string | null>(null);
  /** Cuántos marcados llegaron al servidor: al cerrar, el Archivo se recarga si hubo alguno. */
  const cambiosRef = useRef(0);

  const cargar = useCallback(() => {
    setError(false);
    fetch("/api/admin/documents/archivador", { credentials: "include", cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return (await r.json()) as { papeles: PapelDelArchivador[] };
      })
      .then((d) => setPapeles(d.papeles))
      .catch((err: unknown) => {
        logger.warn("[archivador] no pude traer los papeles", { error: String(err) });
        setError(true);
      });
  }, []);
  useEffect(() => cargar(), [cargar]);

  const indice = useMemo(() => indexarPapeles(papeles ?? []), [papeles]);
  const archivadores = useMemo(() => agruparArchivadores(papeles ?? []), [papeles]);
  const progreso = useMemo(() => (destino && papeles ? progresoDelDestino(papeles, destino) : null), [papeles, destino]);

  const ponerRegistrado = useCallback((ids: ReadonlySet<string>, valor: boolean) => {
    setPapeles((ps) => ps?.map((p) => (ids.has(p.id) ? { ...p, registrado: valor } : p)) ?? ps);
  }, []);
  const ponerEnvio = useCallback((ids: ReadonlySet<string>, envio: Envio, si: readonly Envio[]) => {
    setLecturas((ls) => ls.map((l) => {
      const id = idDe(l.veredicto);
      return id && ids.has(id) && si.includes(l.envio) ? { ...l, envio } : l;
    }));
  }, []);

  const enviarRef = useRef<() => Promise<void>>(async () => {});
  /* Cerrada la ventana no se reintenta más: el aviso ya dijo «vuelve a escanearlos» y el cupo
     del marcado (DRIVE_BULK) se comparte con el resto del Archivo. */
  const vivoRef = useRef(true);
  const deshaciendoRef = useRef(new Set<string>());
  const programar = useCallback((ms: number) => {
    if (timerRef.current || !vivoRef.current) return;
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      void enviarRef.current();
    }, ms);
  }, []);

  /** Manda lo que está en cola, de a una tanda por vez. Si falla, vuelve a la cola y reintenta en 30 s. */
  const enviar = useCallback(async () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (enCursoRef.current) await enCursoRef.current;
    const ids = [...colaRef.current];
    if (ids.length === 0) return;
    colaRef.current.clear();
    const lote = new Set(ids);
    ponerEnvio(lote, "enviando", ["cola"]);
    const p = marcarCodigoFisicoEnServidor(ids, true)
      .then(() => {
        cambiosRef.current += ids.length;
        setFallo(false);
        ponerEnvio(lote, "listo", ["enviando"]);
      })
      .catch((err: unknown) => {
        logger.warn("[archivador] no se pudo anotar la tanda", { error: String(err), n: ids.length });
        for (const id of ids) colaRef.current.add(id);
        ponerEnvio(lote, "cola", ["enviando"]);
        setFallo(true);
        programar(REINTENTO_MS);
      })
      .finally(() => {
        enCursoRef.current = null;
      });
    enCursoRef.current = p;
    await p;
  }, [ponerEnvio, programar]);
  useEffect(() => {
    enviarRef.current = enviar;
  }, [enviar]);

  const encolar = useCallback((id: string) => {
    colaRef.current.add(id);
    if (colaRef.current.size >= TANDA_MAX) void enviarRef.current();
    else programar(ESPERA_MS);
  }, [programar]);

  /* Lo que queda en cola no se pierde si el celular se bloquea o se cierra la ventana. */
  useEffect(() => {
    const alOcultar = () => {
      if (document.visibilityState === "hidden") void enviarRef.current();
    };
    document.addEventListener("visibilitychange", alOcultar);
    vivoRef.current = true;
    return () => {
      document.removeEventListener("visibilitychange", alOcultar);
      vivoRef.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = null;
      void enviarRef.current();
    };
  }, []);

  /** `manual` = lo escribió una persona: se atiende aunque repita la lectura anterior. */
  const procesar = useCallback((texto: string, manual = false) => {
    if (!destino || !papeles) return;
    const v = juzgarLectura(texto, indice, destino);
    /* La cámara sigue viendo el mismo sticker mientras se guarda el papel: no se anota dos veces. */
    const llave = idDe(v) ?? `?${v.estado === "desconocido" ? v.texto : ""}`;
    if (llave === ultimaRef.current && !manual) return;
    ultimaRef.current = llave;
    let envio: Envio = "no";
    if (v.estado === "guardar") {
      ponerRegistrado(new Set([v.papel.id]), true);
      encolar(v.papel.id);
      envio = "cola";
    }
    seqRef.current += 1;
    const n = seqRef.current;
    setLecturas((ls) => [{ n, veredicto: v, envio }, ...ls].slice(0, 300));
    avisarLectura(v.estado === "guardar" || v.estado === "ya-estaba" ? "bien" : v.estado === "desconocido" ? "mal" : "ojo");
  }, [destino, papeles, indice, ponerRegistrado, encolar]);

  /** «Registrar igual» un papel que va en otro lado (queda con el lugar de su carpeta). */
  const registrarIgual = useCallback((n: number) => {
    const l = lecturas.find((x) => x.n === n);
    const id = l ? idDe(l.veredicto) : null;
    if (!l || !id || l.envio !== "no" || l.veredicto.estado === "desconocido" || l.veredicto.papel.registrado) return;
    ponerRegistrado(new Set([id]), true);
    encolar(id);
    setLecturas((ls) => ls.map((x) => (x.n === n ? { ...x, envio: "cola" } : x)));
  }, [lecturas, ponerRegistrado, encolar]);

  /** Deshacer un marcado (el sticker era del papel de al lado): si no salió todavía, sale de la cola. */
  const deshacer = useCallback(async (n: number) => {
    const l = lecturas.find((x) => x.n === n);
    const id = l ? idDe(l.veredicto) : null;
    /* Dos toques seguidos: el segundo no vuelve a pedirle nada al servidor. */
    if (!l || !id || l.envio === "no" || l.envio === "deshecho" || deshaciendoRef.current.has(id)) return;
    deshaciendoRef.current.add(id);
    try {
      if (enCursoRef.current) await enCursoRef.current;
      if (!colaRef.current.delete(id)) {
        await marcarCodigoFisicoEnServidor([id], false);
        cambiosRef.current += 1;
      }
    } finally {
      deshaciendoRef.current.delete(id);
    }
    ponerRegistrado(new Set([id]), false);
    ultimaRef.current = null;
    setLecturas((ls) => ls.map((x) => (x.n === n ? { ...x, envio: "deshecho" } : x)));
  }, [lecturas, ponerRegistrado]);

  const setDestino = useCallback((d: Destino | null) => {
    setDestinoEstado(d);
    ultimaRef.current = null;
    if (!d) return;
    try {
      localStorage.setItem(LLAVE_DESTINO, JSON.stringify(d));
    } catch {
      /* sin almacenamiento: sólo no se recuerda la próxima vez */
    }
  }, []);

  /** Al terminar: manda lo que quedó. `pendientes` > 0 = no hubo conexión. */
  const terminar = useCallback(async () => {
    await enviar();
    return { pendientes: colaRef.current.size, cambios: cambiosRef.current };
  }, [enviar]);

  const porGuardar = lecturas.filter((l) => l.envio === "cola" || l.envio === "enviando").length;

  return {
    papeles, error, cargar, archivadores, destino, setDestino, ultimoDestino, progreso,
    lecturas, procesar, registrarIgual, deshacer, terminar, porGuardar, fallo,
  };
}

export type ModoArchivador = ReturnType<typeof useModoArchivador>;
