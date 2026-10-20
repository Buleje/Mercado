/**
 * Lo que el aviso en pantalla de la agenda le pide al navegador: el sonido
 * elegido (`lib/agenda/sonidos.ts`) y el aviso del sistema cuando el panel está
 * escondido. Nada de esto rompe si el navegador no deja.
 */
import { logger } from "@/lib/logger";
import { tocarSonido } from "@/lib/agenda/sonidos";
import type { SonidoAviso } from "@/lib/agenda/aviso-pantalla";

const DESTINO = "/admin?tab=administracion&vista=hoy";
const ICONO = "/icons/icon-192x192.png";

/** El sonido elegido (`lib/agenda/sonidos.ts`); «ninguno» no suena. */
export function sonarAviso(sonido: SonidoAviso, volumen: number): void {
  tocarSonido(sonido, volumen);
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
