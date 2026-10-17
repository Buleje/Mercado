import "server-only";

import { logActivity } from "@/lib/activity-logger";
import { ActivityLogDB } from "@/lib/db/activity-log.db";
import { logger } from "@/lib/logger";
import { errorSinDatos } from "@/lib/error-sin-datos";

/**
 * Quién movió, armó/desarmó o hizo sonar una cámara (ADR-472). Al mismo
 * `ActivityLog` que «quién miró» (`registro-miradas.ts`), sin tabla nueva.
 *
 * Detección y alarma: un renglón por cada cambio (son pocos y pesan). Mover:
 * uno por persona y cámara cada 5 min —una sesión de joystick son decenas de
 * empujones—. El detalle NUNCA lleva el permiso, el código ni la serie.
 */

export const ACCIONES_CONTROL = {
  ptz: "camara.ptz",
  deteccion: "camara.deteccion",
  alarma: "camara.alarma",
  microfono: "camara.microfono",
} as const;

export type AccionControl = keyof typeof ACCIONES_CONTROL;

const VENTANA_PTZ_MS = 5 * 60_000;

export function detalleDeControl(d: {
  rol: string;
  camara: string;
  accion: AccionControl;
  activa?: boolean;
  duracion?: number;
}): string {
  return JSON.stringify({
    rol: d.rol,
    camara: d.camara,
    ...(d.activa !== undefined && { activa: d.activa }),
    ...(d.duracion !== undefined && { duracion: d.duracion }),
  });
}

/** Nunca tira: si falla el registro, el control ya se hizo. */
export async function registrarControl(
  tenantId: string,
  quien: { usuario: string; rol: string },
  camara: { id: string; nombre: string },
  que: { accion: AccionControl; activa?: boolean; duracion?: number },
  ahora: Date = new Date(),
): Promise<void> {
  const action = ACCIONES_CONTROL[que.accion];
  try {
    if (que.accion === "ptz") {
      const reciente = await ActivityLogDB.existeDesde(tenantId, {
        action,
        entityId: camara.id,
        user: quien.usuario,
        desde: new Date(ahora.getTime() - VENTANA_PTZ_MS),
      });
      if (reciente) return;
    }
    await logActivity(
      action,
      "camara",
      detalleDeControl({ rol: quien.rol, camara: camara.nombre, ...que }),
      camara.id,
      quien.usuario,
      undefined,
      tenantId,
    );
  } catch (err) {
    logger.warn("[camaras] no se pudo anotar el control", {
      tenantId,
      camaraId: camara.id,
      accion: action,
      error: errorSinDatos(err),
    });
  }
}
