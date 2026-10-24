/**
 * conteo-patio-senal.ts — lo que el celular hace con cada lectura de «Contar el
 * patio» (Brandon 2026-10-05: «cada lectura suma con vibración/sonido corto»),
 * para no tener que mirar la pantalla al sol en cada pieza.
 *
 *   · encontrada → vibración corta y un «tic» agudo;
 *   · sobra      → doble vibración y dos tonos graves: «mira esta».
 *
 * La cámara (`BarcodeScanner`) ya pita y vibra al detectar CUALQUIER código:
 * con la cámara abierta, la encontrada no suma su «tic» (sonarían dos a la
 * vez); la que sobra sí, porque su tono grave es justamente lo que la
 * distingue. iPhone no vibra desde la web (no hay `navigator.vibrate`): ahí
 * queda el sonido.
 *
 * Sólo navegador. Todo va en try/catch: sin audio o sin vibración, el conteo
 * sigue igual — la señal es una ayuda, no un requisito.
 */

import { logger } from "@/lib/logger";

type Contexto = AudioContext;

let audio: Contexto | null = null;

function contexto(): Contexto | null {
  if (typeof window === "undefined") return null;
  try {
    const Ctor =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    audio ??= new Ctor();
    /* Safari lo crea suspendido hasta un gesto: cada lectura viene de uno. */
    if (audio.state === "suspended") {
      void audio.resume().catch((err) => logger.warn("[conteo-patio] audio sin reanudar", { error: String(err) }));
    }
    return audio;
  } catch {
    return null;
  }
}

function tonos(frecuencias: readonly number[], ms: number) {
  const ctx = contexto();
  if (!ctx) return;
  try {
    const t0 = ctx.currentTime;
    frecuencias.forEach((f, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = f;
      gain.gain.value = 0.25;
      osc.connect(gain);
      gain.connect(ctx.destination);
      const inicio = t0 + (i * (ms + 50)) / 1000;
      osc.start(inicio);
      osc.stop(inicio + ms / 1000);
    });
  } catch {
    /* Sin audio: queda la vibración y el aviso en pantalla. */
  }
}

function vibrar(patron: number | number[]) {
  try {
    navigator.vibrate?.(patron);
  } catch {
    /* No soportado (iPhone, escritorio). */
  }
}

export type SenalDeLectura = "encontrada" | "sobra";

export function senalDeLectura(tipo: SenalDeLectura, opts: { camaraAbierta?: boolean } = {}) {
  if (tipo === "encontrada") {
    vibrar(60);
    if (!opts.camaraAbierta) tonos([1320], 70);
    return;
  }
  vibrar([90, 60, 90]);
  tonos([520, 360], 120);
}
