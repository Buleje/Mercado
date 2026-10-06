import "server-only";
import { logActivity } from "@/lib/activity-logger";
import { ActivityLogDB } from "@/lib/db/activity-log.db";
import { logger } from "@/lib/logger";
import { errorSinDatos } from "@/lib/error-sin-datos";

/**
 * Registro de «quién miró el video» de las cámaras (Ley 29733: las cámaras
 * graban personas). Va al mismo `ActivityLog` del panel, sin tabla nueva.
 *
 * Un renglón por persona y cámara cada 5 min: cambiar HD/SD o saltar de hora
 * en la grabación son pedidos nuevos pero la misma «mirada». El detalle NUNCA
 * lleva el permiso de video ni el código de verificación: sólo qué se miró.
 */
export const ACCION_MIRADA = "camara.video_nube_ver";
export const ENTIDAD_MIRADA = "camara";
export const VENTANA_MIRADA_MS = 5 * 60_000;

export type DetalleMirada = {
  rol: string;
  camara: string;
  tipo: "vivo" | "grabacion";
  calidad: "hd" | "sd";
  desde?: string;
  hasta?: string;
};

export function detalleDeMirada(d: DetalleMirada): string {
  return JSON.stringify({
    rol: d.rol,
    camara: d.camara,
    tipo: d.tipo,
    calidad: d.calidad,
    ...(d.tipo === "grabacion" && d.desde && d.hasta ? { desde: d.desde, hasta: d.hasta } : {}),
  });
}

/** Lee el detalle guardado; un renglón raro no rompe la lista. */
export function leerDetalleMirada(detail: string): Partial<DetalleMirada> {
  try {
    const o = JSON.parse(detail) as Record<string, unknown>;
    const t = (k: string) => (typeof o[k] === "string" ? (o[k] as string) : undefined);
    return {
      rol: t("rol"),
      camara: t("camara"),
      tipo: o.tipo === "grabacion" ? "grabacion" : o.tipo === "vivo" ? "vivo" : undefined,
      calidad: o.calidad === "hd" ? "hd" : o.calidad === "sd" ? "sd" : undefined,
      desde: t("desde"),
      hasta: t("hasta"),
    };
  } catch {
    return {};
  }
}

/**
 * Anota la mirada si no hay otra de esta persona y cámara en los últimos 5 min.
 * Nunca tira: si falla, el video sale igual.
 */
export async function registrarMirada(
  tenantId: string,
  quien: { usuario: string; rol: string },
  camara: { id: string; nombre: string },
  que: Omit<DetalleMirada, "rol" | "camara">,
  ahora: Date = new Date(),
): Promise<void> {
  try {
    const reciente = await ActivityLogDB.existeDesde(tenantId, {
      action: ACCION_MIRADA,
      entityId: camara.id,
      user: quien.usuario,
      desde: new Date(ahora.getTime() - VENTANA_MIRADA_MS),
    });
    if (reciente) return;
    await logActivity(
      ACCION_MIRADA,
      ENTIDAD_MIRADA,
      detalleDeMirada({ ...que, rol: quien.rol, camara: camara.nombre }),
      camara.id,
      quien.usuario,
      undefined,
      tenantId,
    );
  } catch (err) {
    logger.warn("[camaras] no se pudo anotar quién miró", {
      tenantId,
      camaraId: camara.id,
      error: errorSinDatos(err),
    });
  }
}
