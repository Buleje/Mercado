"use client";

/**
 * useVozContinua — motor de dictado continuo (Web Speech API, es-PE).
 *
 * Nació para el cubicador forestal y hoy lo usan también el chat del asistente
 * («anotame la compra de combustible…») y el cubicador de trozas. Por eso vive
 * en `hooks/` y no dentro de un módulo.
 *
 * Es el patrón PROBADO del cubicador de aserrada, extraído para reusar:
 *   - Solo se procesan resultados FINALES (los interim alimentan el caption:
 *     committear sobre interim causaba duplicados y volteados en Chrome real).
 *   - Cada final se procesa UNA vez (`lastFinalRef`); Chrome corta la sesión
 *     tras silencios y los índices vuelven a 0 → se resetea en cada `onend` y
 *     se re-arranca solo mientras el usuario quiera escuchar.
 *   - Errores DUROS (permiso/micrófono) cortan y avisan; no-speech/network/
 *     aborted son transitorios del modo continuo y se reintentan sin ruido.
 *
 * El cubicador de aserrada aún tiene el motor propio (modos edición/lectura
 * entretejidos); migrarlo acá es deuda aceptada hasta poder verificar dictando.
 */
import { useCallback, useEffect, useRef, useState } from "react";

/* eslint-disable @typescript-eslint/no-explicit-any */
interface SpeechRecognitionLike {
  lang: string; interimResults: boolean; continuous: boolean; maxAlternatives: number;
  start: () => void; stop: () => void;
  onresult: ((e: any) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: any) => void) | null;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

const ERR_MSG: Record<string, string> = {
  "not-allowed": "Permiso de micrófono denegado. Tocá el candado 🔒 en la barra de direcciones, permití el micrófono y recargá la página.",
  "service-not-allowed": "El navegador bloqueó el micrófono. Revisá los permisos del sitio y recargá.",
  "audio-capture": "No se encontró micrófono. Conectá uno y reintentá.",
};

export interface VozContinua {
  /** false si el navegador no trae Web Speech (usar la carga manual). */
  supported: boolean;
  listening: boolean;
  /** Transcripción intermedia (caption en vivo); "" cuando no hay. */
  liveText: string;
  errMsg: string | null;
  setErrMsg: (m: string | null) => void;
  /** Prende/apaga el dictado continuo. */
  toggle: () => void;
  /** Corta el dictado (para leer en voz alta, salir de la vista, etc.). */
  detener: () => void;
}

export function useVozContinua(onFinal: (texto: string) => void): VozContinua {
  const [supported, setSupported] = useState(true);
  const [listening, setListening] = useState(false);
  const [liveText, setLiveText] = useState("");
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const wantRef = useRef(false);
  const lastFinalRef = useRef(-1);
  // El callback vive en un ref: el reconocedor se cablea UNA vez y siempre
  // llama a la versión fresca, sin re-suscribir en cada render.
  const onFinalRef = useRef(onFinal);
  onFinalRef.current = onFinal;

  useEffect(() => {
    const w = window as unknown as Record<string, unknown>;
    const SR = (w.SpeechRecognition ?? w.webkitSpeechRecognition) as (new () => SpeechRecognitionLike) | undefined;
    if (!SR) { setSupported(false); return; }
    const rec = new SR();
    rec.lang = "es-PE";
    rec.interimResults = true;
    rec.continuous = true;
    rec.maxAlternatives = 1; // la hipótesis #1 nunca reordena lo dictado

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onresult = (e: any) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (!res.isFinal) { interim += (res[0]?.transcript ?? "") + " "; continue; }
        if (i <= lastFinalRef.current) continue; // ya procesado
        lastFinalRef.current = i;
        setLiveText("");
        onFinalRef.current(res[0]?.transcript ?? "");
      }
      if (interim.trim()) setLiveText(interim.trim());
    };
    rec.onend = () => {
      if (!wantRef.current) { setListening(false); return; }
      lastFinalRef.current = -1; // la sesión nueva reinicia los índices
      try { rec.start(); } catch { wantRef.current = false; setListening(false); }
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onerror = (e: any) => {
      const code = e?.error ?? "";
      if (code in ERR_MSG) { wantRef.current = false; setListening(false); setErrMsg(ERR_MSG[code]); }
    };
    recRef.current = rec;
    return () => { wantRef.current = false; try { rec.stop(); } catch { /* ignore */ } };
  }, []);

  const detener = useCallback(() => {
    wantRef.current = false;
    setListening(false);
    setLiveText("");
    try { recRef.current?.stop(); } catch { /* ignore */ }
  }, []);

  const toggle = useCallback(() => {
    const rec = recRef.current;
    if (!rec) return;
    if (wantRef.current) { detener(); return; }
    wantRef.current = true;
    lastFinalRef.current = -1;
    setLiveText("");
    setErrMsg(null);
    try { rec.start(); setListening(true); } catch { /* ya corriendo */ }
  }, [detener]);

  return { supported, listening, liveText, errMsg, setErrMsg, toggle, detener };
}
