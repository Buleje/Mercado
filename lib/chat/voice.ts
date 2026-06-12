/**
 * lib/chat/voice.ts — Tanda 4 · Notas de voz en el hilo (Brandon 2026-06-11).
 *
 * El audio se sube a /api/chat/public/upload-audio y se guarda en
 * metadataJson `{ voice: { url, durationSec } }` (sin tocar el enum
 * MessageType). Ambos lados lo reproducen con waveform + velocidad 1.5×.
 * "Rápido para el dueño que está cocinando."
 */

export interface ChatVoice {
  url: string;
  durationSec: number;
}

/** Extrae la nota de voz de un metadataJson (o null). */
export function parseChatVoice(raw: string | null): ChatVoice | null {
  if (!raw) return null;
  try {
    const m = JSON.parse(raw) as { voice?: Record<string, unknown> };
    const v = m.voice;
    if (!v || typeof v.url !== "string" || !v.url) return null;
    const durationSec = Number(v.durationSec);
    return {
      url: v.url,
      durationSec: Number.isFinite(durationSec) && durationSec > 0 ? Math.min(durationSec, 600) : 0,
    };
  } catch {
    return null;
  }
}

/** "0:07", "1:23" para el player. */
export function fmtDuration(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

/**
 * Barras de waveform DETERMINÍSTICAS a partir de una semilla (el id del mensaje).
 * No es el waveform real del audio (decodificarlo es caro) — es decorativo y
 * estable (no parpadea entre renders). 28 barras, alturas 30–100%.
 */
export function waveformBars(seed: string, count = 28): number[] {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const bars: number[] = [];
  for (let i = 0; i < count; i++) {
    h = (h * 1103515245 + 12345) & 0x7fffffff;
    bars.push(30 + (h % 71)); // 30–100
  }
  return bars;
}
