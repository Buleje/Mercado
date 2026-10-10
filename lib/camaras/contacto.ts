/**
 * «Último aviso recibido» por cámara (2026-10-05): ¿la cámara quedó conectada?
 *
 * `ultimaCapturaEn` no alcanza para eso: la mueve también una foto subida a
 * mano o un cuadro del puente de la PC, y no la mueve el aviso SIN foto (el
 * latido, el «Probar» del menú de la cámara). Lo que responde la pregunta es
 * la última vez que la CÁMARA tocó la puerta, con o sin foto. Ese dato se
 * anota aparte (`contacto.server.ts`); para lo anterior a esa anotación, la
 * última foto del historial que no subió una persona ni el puente.
 */

import type { Captura, EventoCamara } from "@/lib/camaras/camaras";

/** Qué trajo la cámara: foto, alerta sin foto (evento, botón «Probar») o el latido. */
export type TipoContacto = "foto" | "alerta" | "latido";

export interface ContactoCamara {
  at: string;
  tipo: TipoContacto;
}

/** Eventos que NO vienen de la cámara: los sube una persona o el puente de la PC. */
const NO_SON_DE_LA_CAMARA: ReadonlySet<EventoCamara> = new Set(["manual", "programada"]);

/** El último aviso de la cámara: lo anotado o la última foto suya del historial, lo más nuevo. */
export function ultimoAvisoDe(
  camaraId: string,
  capturas: readonly Pick<Captura, "camaraId" | "evento" | "at">[],
  anotado: ContactoCamara | null | undefined,
): ContactoCamara | null {
  let mejor: ContactoCamara | null = anotado ?? null;
  for (const c of capturas) {
    if (c.camaraId !== camaraId || NO_SON_DE_LA_CAMARA.has(c.evento)) continue;
    if (!mejor || Date.parse(c.at) > Date.parse(mejor.at)) mejor = { at: c.at, tipo: "foto" };
  }
  return mejor;
}

/** Latido o alerta sin foto: ¿es el latido de «sigo viva»? */
export function esLatido(alerta: { tipoEvento: string | null; estado: string | null }): boolean {
  return (
    (alerta.estado ?? "").toLowerCase() === "inactive" ||
    (alerta.tipoEvento ?? "").toLowerCase() === "videoloss"
  );
}
