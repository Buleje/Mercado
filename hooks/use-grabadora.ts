"use client";

/**
 * La grabadora: MediaRecorder + medidor de nivel + reloj, con la máquina de
 * `lib/grabadora/formato` (inactivo → pidiendo → grabando ⇄ pausado → detenido).
 * El audio queda en memoria hasta que quien la usa lo guarde o lo descarte;
 * mientras tanto, cerrar la pestaña pregunta antes.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  elegirMime,
  hayAudioSinGuardar,
  transicion,
  type EstadoGrabadora,
  type EventoGrabadora,
} from "@/lib/grabadora/formato";
import { logger } from "@/lib/logger";

export interface Grabadora {
  estado: EstadoGrabadora;
  /** Milisegundos grabados (sin contar las pausas). */
  ms: number;
  /** Nivel del micrófono 0..1 (sólo mientras graba). */
  nivel: number;
  /** El audio terminado (en `detenido`). */
  audio: { blob: Blob; url: string; ms: number } | null;
  error: string | null;
  disponible: boolean;
  empezar: () => Promise<void>;
  pausar: () => void;
  reanudar: () => void;
  detener: () => void;
  descartar: () => void;
  /** Ya se guardó: suelta el audio sin preguntar. */
  listo: () => void;
}

/** Lo grabado: lo de los tramos anteriores + lo que lleva el que corre. */
function tiempo(acumulado: number, desde: number | null): number {
  return acumulado + (desde !== null ? performance.now() - desde : 0);
}

function mensajeMicrofono(err: unknown): string {
  const nombre = err instanceof DOMException ? err.name : "";
  if (nombre === "NotAllowedError" || nombre === "SecurityError") {
    return "No tenemos permiso para el micrófono. Tócalo en el candado de la barra de direcciones y dale «Permitir».";
  }
  if (nombre === "NotFoundError" || nombre === "OverconstrainedError") return "Este equipo no tiene micrófono conectado.";
  if (nombre === "NotReadableError") return "Otra aplicación está usando el micrófono. Ciérrala y prueba de nuevo.";
  return "No se pudo abrir el micrófono.";
}

export function useGrabadora(): Grabadora {
  const [estado, setEstado] = useState<EstadoGrabadora>("inactivo");
  const [ms, setMs] = useState(0);
  const [nivel, setNivel] = useState(0);
  const [audio, setAudio] = useState<Grabadora["audio"]>(null);
  const [error, setError] = useState<string | null>(null);

  const estadoRef = useRef<EstadoGrabadora>("inactivo");
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const ctx = useRef<AudioContext | null>(null);
  const trozos = useRef<Blob[]>([]);
  /* Reloj: lo acumulado en tramos anteriores + desde cuándo corre el actual. */
  const acumulado = useRef(0);
  const desde = useRef<number | null>(null);
  const urlRef = useRef<string | null>(null);
  const frame = useRef<number | null>(null);
  const reloj = useRef<ReturnType<typeof setInterval> | null>(null);

  /* En el servidor no hay micrófono: se mide al montar para no romper la hidratación. */
  const [disponible, setDisponible] = useState(true);
  useEffect(() => {
    setDisponible(typeof MediaRecorder !== "undefined" && !!navigator.mediaDevices?.getUserMedia);
  }, []);

  /** Aplica el evento si vale desde el estado actual; devuelve si se aplicó. */
  const ir = useCallback((evento: EventoGrabadora): boolean => {
    const sig = transicion(estadoRef.current, evento);
    if (!sig) return false;
    estadoRef.current = sig;
    setEstado(sig);
    return true;
  }, []);

  const soltarHardware = useCallback(() => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    if (reloj.current !== null) clearInterval(reloj.current);
    frame.current = null;
    reloj.current = null;
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    ctx.current?.close().catch((err: unknown) => logger.warn("[grabadora] cerrar medidor", { err: String(err) }));
    ctx.current = null;
    setNivel(0);
  }, []);

  const soltarAudio = useCallback(() => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = null;
    setAudio(null);
  }, []);

  const medir = useCallback((analizador: AnalyserNode) => {
    const datos = new Uint8Array(analizador.fftSize);
    let ultimo = 0;
    const paso = (t: number) => {
      frame.current = requestAnimationFrame(paso);
      if (t - ultimo < 80) return; // ~12 por segundo alcanza para el ojo
      ultimo = t;
      if (estadoRef.current !== "grabando") return setNivel(0);
      analizador.getByteTimeDomainData(datos);
      let suma = 0;
      for (const v of datos) suma += ((v - 128) / 128) ** 2;
      setNivel(Math.min(1, Math.sqrt(suma / datos.length) * 3));
    };
    frame.current = requestAnimationFrame(paso);
  }, []);

  const empezar = useCallback(async () => {
    if (!disponible || !ir("pedir")) return;
    setError(null);
    soltarAudio();
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      if (estadoRef.current !== "pidiendo") {
        s.getTracks().forEach((t) => t.stop()); // se descartó mientras pedía
        return;
      }
      stream.current = s;
      const mime = elegirMime((m) => MediaRecorder.isTypeSupported(m));
      const rec = new MediaRecorder(s, mime ? { mimeType: mime } : undefined);
      trozos.current = [];
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) trozos.current.push(e.data);
      };
      rec.onstop = () => {
        const total = tiempo(acumulado.current, desde.current);
        desde.current = null;
        acumulado.current = total;
        setMs(total);
        soltarHardware();
        if (estadoRef.current !== "detenido") return; // descartada
        const blob = new Blob(trozos.current, { type: rec.mimeType || mime || "audio/webm" });
        trozos.current = [];
        const url = URL.createObjectURL(blob);
        urlRef.current = url;
        setAudio({ blob, url, ms: total });
      };
      recorder.current = rec;
      // Medidor: un analizador colgado del mismo micrófono (no suena ni graba).
      try {
        const ac = new AudioContext();
        const analizador = ac.createAnalyser();
        analizador.fftSize = 1024;
        ac.createMediaStreamSource(s).connect(analizador);
        ctx.current = ac;
        medir(analizador);
      } catch {
        /* sin medidor se graba igual */
      }
      acumulado.current = 0;
      desde.current = performance.now();
      setMs(0);
      rec.start(1000); // trozos de 1 s: si algo se corta, no se pierde todo
      reloj.current = setInterval(() => setMs(tiempo(acumulado.current, desde.current)), 250);
      ir("permitido");
    } catch (err) {
      soltarHardware();
      setError(mensajeMicrofono(err));
      ir("negado");
    }
  }, [disponible, ir, medir, soltarAudio, soltarHardware]);

  const pausar = useCallback(() => {
    if (recorder.current?.state !== "recording" || !ir("pausar")) return;
    recorder.current.pause();
    acumulado.current = tiempo(acumulado.current, desde.current);
    desde.current = null;
    setMs(acumulado.current);
  }, [ir]);

  const reanudar = useCallback(() => {
    if (recorder.current?.state !== "paused" || !ir("reanudar")) return;
    recorder.current.resume();
    desde.current = performance.now();
  }, [ir]);

  const detener = useCallback(() => {
    const rec = recorder.current;
    if (!rec || rec.state === "inactive" || !ir("detener")) return;
    rec.stop(); // el blob se arma en `onstop`
  }, [ir]);

  const descartar = useCallback(() => {
    if (!ir("descartar")) return;
    const rec = recorder.current;
    recorder.current = null;
    if (rec && rec.state !== "inactive") rec.stop();
    else soltarHardware();
    trozos.current = [];
    acumulado.current = 0;
    desde.current = null;
    setMs(0);
    soltarAudio();
  }, [ir, soltarAudio, soltarHardware]);

  const listo = useCallback(() => {
    if (!ir("guardado")) return;
    recorder.current = null;
    acumulado.current = 0;
    setMs(0);
    soltarAudio();
  }, [ir, soltarAudio]);

  // Cerrar o recargar con audio sin guardar: el navegador pregunta.
  useEffect(() => {
    if (!hayAudioSinGuardar(estado)) return;
    const aviso = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", aviso);
    return () => window.removeEventListener("beforeunload", aviso);
  }, [estado]);

  // Al desmontar: soltar el micrófono (si no, la luz roja sigue prendida).
  useEffect(
    () => () => {
      const rec = recorder.current;
      estadoRef.current = "inactivo";
      if (rec && rec.state !== "inactive") rec.stop();
      soltarHardware();
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    },
    [soltarHardware],
  );

  return { estado, ms, nivel, audio, error, disponible, empezar, pausar, reanudar, detener, descartar, listo };
}
