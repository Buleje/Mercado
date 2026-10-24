import "server-only";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { PlatformSettingsDB } from "@/lib/db/platform-settings.db";
import { NotificationLogsDB } from "@/lib/db/notifications.db";
import { AvisosCorreoDB, type FilaAvisosGuardada, type TiendaAvisosCorreo } from "@/lib/db/avisos-correo.db";
import {
  AVISO_CORREO_INFO,
  TIPOS_AVISO_CORREO,
  esCorreoGmail,
  type AvisosCorreoDetalle,
  type AvisosCorreoGuardado,
  type AvisosCorreoPatch,
  type AvisosCorreoResumen,
  type TipoAvisoCorreo,
} from "@/lib/avisos-correo-tipos";

/**
 * lib/avisos-correo.ts — el interruptor de los correos automáticos de cada tienda (21-10).
 *
 * Todos los correos salen por el SMTP de la plataforma (`SMTP_USER`) hacia
 * `Tenant.ownerEmail`; no hay un Gmail vinculado por tienda. Lo que la tienda «tiene
 * vinculado» es ese correo, y el superadmin puede pausarlo entero o apagar un tipo.
 *
 * Estado en PlatformSetting `avisos-correo:<tenantId>` (cuid canónico, nunca el slug).
 * Sin fila = nada pausado, nada apagado. Cada envío al dueño pregunta
 * {@link avisoCorreoActivo} justo antes de mandar; si la lectura falla, el correo SALE
 * (fail-open: un aviso perdido por un error de lectura es peor que uno de más).
 *
 * Lectura del interruptor con caché de 5 min por instancia (`getCacheandoAusencia`):
 * la instancia que guarda la invalida al instante; las demás tardan hasta 5 min.
 */

export const PREFIJO_CLAVE_AVISOS_CORREO = "avisos-correo:";

export function claveAvisosCorreo(tenantId: string): string {
  return `${PREFIJO_CLAVE_AVISOS_CORREO}${tenantId}`;
}

export function avisosCorreoPorDefecto(): AvisosCorreoGuardado {
  return { pausado: false, apagados: [] };
}

/** Tipos desconocidos en `apagados` se ignoran (un tipo retirado no debe resetear todo). */
const GuardadoSchema = z.object({
  pausado: z.boolean(),
  apagados: z.array(z.string()),
});

/** Body del PATCH del superadmin: o el general, o un tipo. */
export const AvisosCorreoPatchSchema = z.union([
  z.object({ pausado: z.boolean() }).strict(),
  z.object({ tipo: z.enum(TIPOS_AVISO_CORREO), activo: z.boolean() }).strict(),
]);

/** Qué `NotificationLog.type` deja cada envío (forestal reusa el que ya graba su cron). */
export const TIPO_REGISTRO_CORREO: Record<TipoAvisoCorreo, string> = {
  pedidos: "correo_pedidos",
  stock: "correo_stock",
  reportes: "correo_reportes",
  forestal: "ctp_plazos_email",
  cuenta: "correo_cuenta",
};

/** El valor crudo del KV → estado válido. Json que no valida = por defecto (y se avisa en el log). */
export function leerAvisosGuardados(valor: unknown, tenantId?: string): AvisosCorreoGuardado {
  if (valor === null || valor === undefined) return avisosCorreoPorDefecto();
  const parsed = GuardadoSchema.safeParse(valor);
  if (!parsed.success) {
    logger.warn("[avisos-correo] estado guardado inválido: se usa el de por defecto", {
      tenantId,
      issues: parsed.error.issues.map((i) => i.message).slice(0, 3),
    });
    return avisosCorreoPorDefecto();
  }
  const apagados = new Set(parsed.data.apagados);
  return { pausado: parsed.data.pausado, apagados: TIPOS_AVISO_CORREO.filter((t) => apagados.has(t)) };
}

/** ¿Este tipo sale con este estado? (sin mirar si hay correo). */
export function tipoDeAvisoSale(guardado: AvisosCorreoGuardado, tipo: TipoAvisoCorreo): boolean {
  return !guardado.pausado && !guardado.apagados.includes(tipo);
}

/**
 * Preguntar ANTES de mandar un correo automático al dueño. `tenantId` = cuid del Tenant.
 * Fail-open: si no se puede leer, devuelve true y lo deja en el log.
 */
export async function avisoCorreoActivo(tenantId: string, tipo: TipoAvisoCorreo): Promise<boolean> {
  if (!tenantId) return true;
  try {
    const valor = await PlatformSettingsDB.getCacheandoAusencia<unknown>(claveAvisosCorreo(tenantId));
    return tipoDeAvisoSale(leerAvisosGuardados(valor, tenantId), tipo);
  } catch (err) {
    logger.warn("[avisos-correo] no se pudo leer el interruptor: el correo sale igual", {
      tenantId,
      tipo,
      error: String(err).slice(0, 200),
    });
    return true;
  }
}

/**
 * Deja constancia del envío en NotificationLog (de ahí sale «Último envío» del superadmin).
 * Nunca tira: un registro que falla no puede tumbar el aviso.
 */
export async function registrarEnvioCorreo(
  tenantId: string,
  tipo: TipoAvisoCorreo,
  destino: string,
  ok: boolean,
  detalle: string,
): Promise<void> {
  try {
    await NotificationLogsDB.add(
      { type: TIPO_REGISTRO_CORREO[tipo], recipient: destino, status: ok ? "sent" : "failed", message: detalle.slice(0, 500) },
      tenantId,
    );
  } catch (err) {
    logger.error("[avisos-correo] no se pudo registrar el envío", { tenantId, tipo, error: String(err).slice(0, 200) });
  }
}

function tiposQueAplican(aplicaForestal: boolean): TipoAvisoCorreo[] {
  return TIPOS_AVISO_CORREO.filter((t) => t !== "forestal" || aplicaForestal);
}

/** Resumen de una tienda (puro: sin base). Exportado para los tests. */
export function armarResumenAvisos(
  correo: string | null | undefined,
  guardado: AvisosCorreoGuardado,
  aplicaForestal: boolean,
  googleConectado: number,
): AvisosCorreoResumen {
  const limpio = correo?.trim() || null;
  const aplican = tiposQueAplican(aplicaForestal);
  const activos = !limpio || guardado.pausado ? 0 : aplican.filter((t) => !guardado.apagados.includes(t)).length;
  return { correo: limpio, esGmail: esCorreoGmail(limpio), pausado: guardado.pausado, activos, total: aplican.length, googleConectado };
}

function crudosDe(tienda: { id: string; slug: string }): string[] {
  return tienda.id === tienda.slug ? [tienda.id] : [tienda.id, tienda.slug];
}

/**
 * Resumen de N tiendas para la lista del superadmin, sin N+1: una consulta a
 * PlatformSetting, un groupBy de la Agenda de Google y las de «usa forestal».
 * Indexado por `Tenant.id`.
 */
export async function resumenAvisosCorreo(
  tiendas: { id: string; slug: string; ownerEmail: string | null }[],
): Promise<Map<string, AvisosCorreoResumen>> {
  if (tiendas.length === 0) return new Map();
  const crudos = [...new Set(tiendas.flatMap(crudosDe))];
  const [filas, google, forestal] = await Promise.all([
    AvisosCorreoDB.filas(tiendas.map((t) => claveAvisosCorreo(t.id))),
    AvisosCorreoDB.googleActivasPorTienda(crudos),
    AvisosCorreoDB.conForestal(crudos),
  ]);
  const porClave = new Map(filas.map((f) => [f.key, f.value]));
  const salida = new Map<string, AvisosCorreoResumen>();
  for (const t of tiendas) {
    const guardado = leerAvisosGuardados(porClave.get(claveAvisosCorreo(t.id)), t.id);
    const ids = crudosDe(t);
    const googleConectado = ids.reduce((s, id) => s + (google.get(id) ?? 0), 0);
    salida.set(t.id, armarResumenAvisos(t.ownerEmail, guardado, ids.some((id) => forestal.has(id)), googleConectado));
  }
  return salida;
}

/** Detalle de una tienda ya resuelta (lo que muestra el bloque del superadmin). */
export async function detalleDeTienda(tienda: TiendaAvisosCorreo): Promise<AvisosCorreoDetalle> {
  const ids = crudosDe(tienda);
  const [filas, google, forestal, smtpPropio, envios] = await Promise.all([
    AvisosCorreoDB.filas([claveAvisosCorreo(tienda.id)]),
    AvisosCorreoDB.googleDe(ids),
    AvisosCorreoDB.conForestal(ids),
    AvisosCorreoDB.smtpPropio(ids),
    AvisosCorreoDB.ultimosEnvios(ids, Object.values(TIPO_REGISTRO_CORREO)),
  ]);
  const fila: FilaAvisosGuardada | undefined = filas[0];
  const guardado = leerAvisosGuardados(fila?.value, tienda.id);
  const aplicaForestal = ids.some((id) => forestal.has(id));
  const googleActivas = google.filter((g) => g.estado === "activa").length;
  return {
    ...armarResumenAvisos(tienda.ownerEmail, guardado, aplicaForestal, googleActivas),
    tipos: TIPOS_AVISO_CORREO.map((tipo) => ({
      tipo,
      nombre: AVISO_CORREO_INFO[tipo].nombre,
      descripcion: AVISO_CORREO_INFO[tipo].descripcion,
      activo: !guardado.apagados.includes(tipo),
      aplica: tipo !== "forestal" || aplicaForestal,
      ultimoEnvio: envios.get(TIPO_REGISTRO_CORREO[tipo])?.toISOString() ?? null,
    })),
    google: google.map((g) => ({ email: g.email, estado: g.estado, ultimaSync: g.ultimaSync?.toISOString() ?? null })),
    smtpPropio,
    cambiadoPor: fila?.updatedBy ?? null,
    cambiadoEn: fila?.updatedAt ? fila.updatedAt.toISOString() : null,
  };
}

/** Detalle por tenantId (cuid o slug). null = la tienda no existe. */
export async function detalleAvisosCorreo(tenantId: string): Promise<AvisosCorreoDetalle | null> {
  const tienda = await AvisosCorreoDB.tienda(tenantId);
  return tienda ? detalleDeTienda(tienda) : null;
}

/** Aplica el cambio del superadmin bajo el candado de la clave y devuelve el estado nuevo. */
export async function guardarAvisosCorreo(
  tenantId: string,
  cambio: AvisosCorreoPatch,
  por: string,
): Promise<AvisosCorreoGuardado> {
  return PlatformSettingsDB.actualizar<unknown, AvisosCorreoGuardado>(
    claveAvisosCorreo(tenantId),
    (actual) => {
      const g = leerAvisosGuardados(actual, tenantId);
      const nuevo: AvisosCorreoGuardado =
        "pausado" in cambio
          ? { ...g, pausado: cambio.pausado }
          : {
              ...g,
              apagados: TIPOS_AVISO_CORREO.filter((t) =>
                t === cambio.tipo ? !cambio.activo : g.apagados.includes(t),
              ),
            };
      return { valor: nuevo, resultado: nuevo };
    },
    por,
  );
}
