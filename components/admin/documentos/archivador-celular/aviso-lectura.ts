"use client";

/**
 * Cómo suena y vibra cada sticker leído, para no tener que mirar la pantalla
 * mientras se guarda el papel: «bien» = un pitido corto; «ojo» (va en otro
 * lado) = dos tonos bajos y vibración doble; «mal» (no es de este negocio) =
 * un tono grave largo.
 */

type Tipo = "bien" | "ojo" | "mal";

let ctx: AudioContext | null = null;

/** En un toque («Empezar»): Android no deja sonar nada sin un gesto antes. */
export function prepararSonido(): void {
  try {
    ctx ??= new AudioContext();
    void ctx.resume().catch((err: unknown) => console.warn("[archivador] sin sonido", err));
  } catch {
    /* sin AudioContext: quedan la vibración y la pantalla */
  }
}

const TONOS: Record<Tipo, { hz: number; ms: number }[]> = {
  bien: [{ hz: 1600, ms: 90 }],
  ojo: [{ hz: 520, ms: 140 }, { hz: 420, ms: 160 }],
  mal: [{ hz: 260, ms: 320 }],
};

export function avisarLectura(tipo: Tipo): void {
  try {
    navigator.vibrate?.(tipo === "bien" ? 60 : [180, 90, 180]);
  } catch {
    /* el navegador no vibra */
  }
  if (!ctx) return;
  let t = ctx.currentTime;
  for (const { hz, ms } of TONOS[tipo]) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "square";
    osc.frequency.value = hz;
    gain.gain.value = 0.25;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + ms / 1000);
    t += ms / 1000 + 0.05;
  }
}
