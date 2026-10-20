/**
 * Lo que el aviso en pantalla de la agenda le pide al navegador: un sonido
 * corto (sin archivo: dos notas de WebAudio) y el aviso del sistema cuando el
 * panel está escondido. Nada de esto rompe si el navegador no deja.
 */
import { logger } from "@/lib/logger";

const DESTINO = "/admin?tab=administracion&vista=hoy";
const ICONO = "/icons/icon-192x192.png";

/** Dos notas suaves (la–mi) de un tercio de segundo. */
export function sonarAviso(): void {
  try {
    const ctx = new window.AudioContext();
    [660, 880].forEach((hz, i) => {
      const t = ctx.currentTime + i * 0.18;
      const nota = ctx.createOscillator();
      const volumen = ctx.createGain();
      nota.type = "sine";
      nota.frequency.value = hz;
      volumen.gain.setValueAtTime(0.0001, t);
      volumen.gain.exponentialRampToValueAtTime(0.12, t + 0.02);
      volumen.gain.exponentialRampToValueAtTime(0.0001, t + 0.32);
      nota.connect(volumen).connect(ctx.destination);
      nota.start(t);
      nota.stop(t + 0.35);
    });
    setTimeout(() => void ctx.close(), 1000);
  } catch (err) {
    logger.warn("[agenda] el aviso no pudo sonar", { error: String(err) });
  }
}

export const puedeNotificar = (): boolean => typeof Notification !== "undefined" && Notification.permission === "granted";

/**
 * El aviso del sistema (Windows, Mac, Android). En Android Chrome `new
 * Notification` no existe: va por el service worker de avisos (`/sw-avisos.js`),
 * que al tocarlo abre Hoy.
 */
export function notificarAviso(titulo: string, cuerpo: string, alTocar: () => void): void {
  if (!puedeNotificar()) return;
  const opciones: NotificationOptions = { body: cuerpo, icon: ICONO, tag: "agenda-aviso", data: { url: DESTINO } };
  try {
    const n = new Notification(titulo, opciones);
    n.onclick = () => {
      window.focus();
      n.close();
      alTocar();
    };
  } catch {
    void navigator.serviceWorker
      ?.getRegistration("/sw-avisos/")
      .then((reg) => reg?.showNotification(titulo, opciones))
      .catch((err: unknown) => logger.warn("[agenda] el aviso del sistema no salió", { error: String(err) }));
  }
}
