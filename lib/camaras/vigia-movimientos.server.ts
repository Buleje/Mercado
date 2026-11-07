import "server-only";

/**
 * El vigía de movimientos del lado del servidor (2026-10-23). Lo puro y el
 * porqué: `vigia-movimientos.ts`.
 *
 * Por cada negocio con cámaras de Hik-Connect: vacía la cola con la MISMA
 * función que la cabecera (`movimientosRecientes`: 1 ida cada ≥20 s, guarda
 * 24 h antes de confirmar el lote, así la cabecera sigue mostrando lo que vació
 * el vigía) y de lo guardado decide qué avisar: Web Push a los dispositivos
 * suscritos a esas cámaras y un aviso en la campana del panel, uno solo sin
 * leer que se pone al día.
 *
 * - Candado con dueño por negocio (Upstash): el cron de producción y el vigía
 *   de la PC no avisan dos veces lo mismo. El estado (ids ya decididos y el
 *   turno de cada cámara) se escribe ANTES de mandar: si se cae a mitad, se
 *   pierde un aviso pero nunca se repite.
 * - Si ningún push salió, las cámaras del grupo vuelven a su turno (la próxima
 *   vuelta sí avisa), como `avisarPersonaAlCelular`.
 * - El push no lleva la foto: lleva la ruta propia de la foto, que el service
 *   worker baja con la sesión del celular (la misma ruta de la cabecera, que
 *   anota quién la vio).
 */
import { randomUUID } from "node:crypto";
import { logActivity } from "@/lib/activity-logger";
import { errorSinDatos } from "@/lib/error-sin-datos";
import { logger } from "@/lib/logger";
import { CamarasCelularesDB } from "@/lib/db/camaras-celulares.db";
import { NotificationCenterDB } from "@/lib/db/notification-center.db";
import { PlatformSettingsDB } from "@/lib/db/platform-settings.db";
import { clavesVapid, esPushMuerto, mandarPush, soloUsuariosVigentes } from "./avisar-push.server";
import { kvBorrarSiEs, kvEscribir, kvLeer } from "./kv-efimero.server";
import { fuenteDeMovimientos, movimientosRecientes } from "./movimientos-nube.server";
import {
  URL_CAMARAS,
  decidirAvisos,
  devolverTurnos,
  fijarSilencio,
  leerAjustesCelular,
  leerEstadoVigia,
  pushParaDispositivo,
  silencioDe,
  textoCampana,
  type AjustesMovimientoCelular,
  type CelularMovimiento,
  type GrupoMovimiento,
} from "./vigia-movimientos";
import { TIPO_AVISO_CAMARAS } from "@/lib/camaras/avisar-push";

/** El índice de tokens de cámaras (`CamarasDB`): de ahí salen los negocios con cámaras. */
const CLAVE_INDICE = "camaras-token-index";
const claveEstado = (t: string) => `camaras:movimientos:push:${t}`;
const claveCandado = (t: string) => `camaras:movimientos:push:candado:${t}`;
/** `interno:` = estado de trabajo, no viaja en la configuración global. */
const claveAjustes = (t: string) => `interno:camaras-movimientos-celular:${t}`;
const VIDA_ESTADO_S = 24 * 3600;
/** Peor vuelta: vaciar la cola (≤52 s, ver `CANDADO_S` de la cola) ya pasó; esto cubre mandar los push. */
const CANDADO_S = 60;
/** El servicio de push guarda sólo el último con el mismo `topic` si el celular estuvo sin señal. */
const TOPIC_MOVIMIENTO = "cam-movimiento";
/** La campana: uno sin leer, puesto al día como mucho cada 5 min. */
const CAMPANA_VENTANA_H = 5 / 60;
/** El mismo tipo que filtra la campana por rol: si cambia, cambia en un solo lugar. */
export const TIPO_CAMPANA_MOVIMIENTO = TIPO_AVISO_CAMARAS;
const ENTIDAD_CAMPANA = "movimiento-nube";
const TX = { maxWait: 10_000, timeout: 10_000 } as const;

export async function ajustesCelular(tenantId: string): Promise<AjustesMovimientoCelular> {
  if (!tenantId) throw new Error("tenantId is required");
  return leerAjustesCelular(await PlatformSettingsDB.getFresco<unknown>(claveAjustes(tenantId)));
}

/** Prender/apagar (todo el negocio) o callar 1 h (el celular de `usuario`). */
export async function cambiarAjustesCelular(
  tenantId: string,
  usuario: string,
  cambio: { prendido?: boolean; silencioHasta?: number },
  ahora = Date.now(),
): Promise<AjustesMovimientoCelular> {
  if (!tenantId) throw new Error("tenantId is required");
  const final = await PlatformSettingsDB.actualizar<unknown, AjustesMovimientoCelular>(
    claveAjustes(tenantId),
    (actual) => {
      let a = leerAjustesCelular(actual);
      if (cambio.prendido !== undefined) a = { ...a, prendido: cambio.prendido };
      if (cambio.silencioHasta !== undefined) a = fijarSilencio(a, usuario, cambio.silencioHasta, ahora);
      return { valor: a, resultado: a };
    },
    usuario,
    TX,
  );
  if (cambio.prendido !== undefined) {
    logActivity(
      "camara.movimiento_celular",
      "camara",
      JSON.stringify({ prendido: cambio.prendido }),
      undefined,
      usuario,
      undefined,
      tenantId,
    ).catch((err) =>
      logger.error("[camaras.vigia] no se pudo anotar el cambio del interruptor", { tenantId, error: String(err) }),
    );
  }
  return final;
}

/** Lo que la cabecera muestra de los avisos al celular (sin los silencios de otros). */
export async function celularParaCabecera(
  tenantId: string,
  usuario: string,
  camarasNube: readonly string[],
  ahora = Date.now(),
): Promise<CelularMovimiento> {
  const [ajustes, estado] = await Promise.all([ajustesCelular(tenantId), CamarasCelularesDB.listar(tenantId)]);
  const dispositivos = estado.dispositivos.filter((d) => camarasNube.some((id) => d.camaras?.[id])).length;
  return {
    prendido: ajustes.prendido,
    silencioHasta: silencioDe(ajustes, usuario, ahora),
    dispositivos,
    conClaves: clavesVapid() !== null,
  };
}

export interface EnvioMovimiento {
  enviados: number;
  destinos: number;
  sinClaves: boolean;
}

/** Un push por dispositivo con las cámaras del grupo que tiene prendidas. Puede tirar por la base. */
async function mandarAlCelular(
  tenantId: string,
  grupo: GrupoMovimiento,
  ajustes: AjustesMovimientoCelular,
  ahora: Date,
): Promise<EnvioMovimiento> {
  /* Lectura fresca (sin la caché de 5 min): sólo se llega acá con algo que mandar,
     y un celular quitado o que retiró la foto no debe recibir el siguiente. */
  const { dispositivos } = await CamarasCelularesDB.listarFresco(tenantId);
  const candidatos = dispositivos.flatMap((d) => {
    const carga = pushParaDispositivo(grupo, d, ahora, ajustes);
    return carga ? [{ d, carga }] : [];
  });
  if (candidatos.length === 0) return { enviados: 0, destinos: 0, sinClaves: false };
  const vapid = clavesVapid();
  if (!vapid) {
    logger.warn("[camaras.vigia] faltan las claves VAPID del servidor: el aviso al celular no sale", { tenantId });
    return { enviados: 0, destinos: 0, sinClaves: true };
  }
  const vigentes = new Set((await soloUsuariosVigentes(tenantId, candidatos.map((x) => x.d))).map((d) => d.id));
  const destinos = candidatos.filter((x) => vigentes.has(x.d.id));
  const envios = await Promise.all(destinos.map((x) => mandarPush(vapid, x.d, x.carga, TOPIC_MOVIMIENTO)));
  const enviados = envios.filter((e) => e.status !== null && e.status >= 200 && e.status < 300).length;
  const muertos = envios.filter(esPushMuerto).map((e) => e.endpoint);
  if (muertos.length) {
    await CamarasCelularesDB.olvidarEndpoints(tenantId, muertos).catch((err) =>
      logger.error("[camaras.vigia] no se pudieron olvidar los dispositivos dados de baja", {
        tenantId,
        error: String(err),
      }),
    );
  }
  logger.info("[camaras.vigia] aviso de movimiento al celular", {
    tenantId,
    camaras: grupo.camaras.map((c) => c.id),
    enviados,
    total: destinos.length,
    codigos: envios.map((e) => e.status),
  });
  return { enviados, destinos: destinos.length, sinClaves: false };
}

export type QuePaso =
  | "sin_camaras"
  | "sin_credenciales"
  | "ocupado"
  | "nada_nuevo"
  | "apagado"
  | "frenado"
  | "avisado"
  | "error";

export interface ResultadoVigia {
  tenantId: string;
  resultado: QuePaso;
  /** Movimientos nuevos decididos en esta vuelta. */
  nuevos: number;
  /** Cámaras en el aviso. */
  camaras: number;
  enviados: number;
  destinos: number;
  campana: boolean;
  /** Hik-Connect no contestó esta vez (lo guardado igual se revisa). */
  aviso: string | null;
}

const base = (tenantId: string, resultado: QuePaso, aviso: string | null = null): ResultadoVigia => ({
  tenantId,
  resultado,
  nuevos: 0,
  camaras: 0,
  enviados: 0,
  destinos: 0,
  campana: false,
  aviso,
});

/** Una vuelta del vigía para un negocio. Puede tirar por la base: `vigilarTodos` lo cierra. */
export async function vigilarNegocio(tenantId: string, ahora = Date.now()): Promise<ResultadoVigia> {
  if (!tenantId) throw new Error("tenantId is required");
  const fuente = await fuenteDeMovimientos(tenantId);
  if (!fuente.ok) return base(tenantId, fuente.motivo ? "sin_credenciales" : "sin_camaras", fuente.motivo);

  const recientes = await movimientosRecientes(tenantId, fuente.cred, fuente.camaras, ahora);
  const dueno = randomUUID();
  if (!(await kvEscribir(claveCandado(tenantId), dueno, CANDADO_S, { soloSiNueva: true })))
    return base(tenantId, "ocupado", recientes.aviso);
  try {
    const antes = leerEstadoVigia(await kvLeer<unknown>(claveEstado(tenantId)));
    const activas = new Set(fuente.lista.filter((c) => c.activa).map((c) => c.id));
    const d = decidirAvisos(antes, recientes.movimientos, ahora, activas);
    if (d.nuevos === 0) return base(tenantId, "nada_nuevo", recientes.aviso);

    const ajustes = await ajustesCelular(tenantId);
    /* Primero se anota lo decidido; después se manda (ver la cabecera). */
    await kvEscribir(claveEstado(tenantId), d.estado, VIDA_ESTADO_S);
    const r: ResultadoVigia = { ...base(tenantId, "frenado", recientes.aviso), nuevos: d.nuevos };
    if (!ajustes.prendido) return { ...r, resultado: "apagado" };
    if (!d.grupo) return r;

    const grupo = d.grupo;
    const { title, body } = textoCampana(grupo);
    const campana = await NotificationCenterDB.createOrReuse({
      tenantId,
      type: TIPO_CAMPANA_MOVIMIENTO,
      severity: "LOW",
      title,
      body,
      actionUrl: URL_CAMARAS,
      actionLabel: "Ver cámaras",
      entityId: ENTIDAD_CAMPANA,
      dedupWindowHours: CAMPANA_VENTANA_H,
    }).catch((err: unknown) => {
      logger.error("[camaras.vigia] el aviso de la campana no se guardó", { tenantId, error: errorSinDatos(err) });
      return null;
    });

    const envio = await mandarAlCelular(tenantId, grupo, ajustes, new Date(ahora));
    if (envio.destinos > 0 && envio.enviados === 0) {
      await kvEscribir(claveEstado(tenantId), devolverTurnos(d.estado, antes, grupo), VIDA_ESTADO_S);
    }
    return {
      ...r,
      resultado: "avisado",
      camaras: grupo.camaras.length,
      enviados: envio.enviados,
      destinos: envio.destinos,
      campana: campana?.created ?? false,
    };
  } finally {
    await kvBorrarSiEs(claveCandado(tenantId), dueno);
  }
}

/** Los negocios con cámaras (el índice de tokens), sin repetir. */
async function negociosConCamaras(): Promise<string[]> {
  const indice = (await PlatformSettingsDB.getFresco<Record<string, { tenantId?: string }>>(CLAVE_INDICE)) ?? {};
  return [...new Set(Object.values(indice).map((d) => d?.tenantId).filter((t): t is string => !!t))];
}

/** Una vuelta para todos los negocios, en paralelo: uno que falla no frena a los demás. */
export async function vigilarTodos(ahora = Date.now()): Promise<ResultadoVigia[]> {
  const tenants = await negociosConCamaras();
  return Promise.all(
    tenants.map((tenantId) =>
      vigilarNegocio(tenantId, ahora).catch((err: unknown) => {
        logger.error("[camaras.vigia] falló un negocio", { tenantId, error: errorSinDatos(err) });
        return base(tenantId, "error");
      }),
    ),
  );
}
