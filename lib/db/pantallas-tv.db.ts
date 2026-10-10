import "server-only";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { PlatformSettingsDB } from "@/lib/db/platform-settings.db";
import { logActivity } from "@/lib/activity-logger";
import { logger } from "@/lib/logger";
import type { PantallaTv } from "@/lib/camaras/pantallas-tv";

/**
 * Las pantallas (televisores) vinculadas de cada negocio — Modo TV (ADR-473).
 *
 * Una lista por negocio en `platform_settings` (el mismo «KV» de las cámaras),
 * bajo `interno:tv:pantallas:<tenantId>`: el prefijo `interno:` la deja fuera
 * de `getAll()`. Escritura con `actualizar` (lock por clave): dos vinculaciones
 * a la vez no se pisan.
 *
 * El TV pide un segmento de video cada 2 s y cada pedido pasa por la guardia,
 * que necesita la pantalla. Leer la base en cada uno sería un SELECT por
 * segundo por TV; por eso `buscarParaTv` usa un caché de proceso de
 * `MICROCACHE_MS`. Revocar limpia el caché de ESTA instancia al instante; en
 * otra instancia, el TV deja de ver a lo sumo `MICROCACHE_MS` después. Sólo se
 * cachean las que ESTÁN: si no aparece, se relee la base (security 07-10).
 */

export const MAX_PANTALLAS_TV = 10;
export const MICROCACHE_MS = 10_000;
const CLAVE = (tenantId: string) => `interno:tv:pantallas:${tenantId}`;
const TX_KV = { maxWait: 10_000, timeout: 10_000 } as const;

const pantallaSchema = z.object({
  id: z.string().min(1),
  nombre: z.string(),
  camaras: z.array(z.string()).nullable(),
  creadaPor: z.string(),
  creadaEn: z.string(),
  expiraEn: z.string(),
  ultimaVez: z.string().nullable(),
});

/** Lo guardado, sin los renglones rotos. Nunca tira. */
function listaDe(raw: unknown): PantallaTv[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((x) => {
    const p = pantallaSchema.safeParse(x);
    return p.success ? [p.data] : [];
  });
}

const vigente = (p: PantallaTv, ahora: number) => new Date(p.expiraEn).getTime() > ahora;

const cache = new Map<string, { lista: PantallaTv[]; en: number }>();
const olvidar = (tenantId: string) => cache.delete(tenantId);

function auditar(tenantId: string, accion: string, detalle: string, user: string, id: string) {
  logActivity(accion, "camara", detalle, id, user, undefined, tenantId).catch((err) =>
    logger.error("[pantallas-tv] no se pudo auditar", { error: String(err), tenantId, accion }),
  );
}

export type ResultadoCrearPantalla = { ok: true; pantalla: PantallaTv } | { ok: false; motivo: string };

export const PantallasTvDB = {
  /** Las vigentes, leídas de la base (sin caché): lo que ve el dueño en el panel. */
  async listar(tenantId: string, ahora = Date.now()): Promise<PantallaTv[]> {
    if (!tenantId) throw new Error("tenantId is required");
    const lista = listaDe(await PlatformSettingsDB.getFresco<unknown>(CLAVE(tenantId)));
    return lista.filter((p) => vigente(p, ahora));
  },

  /** La pantalla del TV si sigue vigente; `null` si la revocaron o venció. */
  async buscarParaTv(tenantId: string, id: string, ahora = Date.now()): Promise<PantallaTv | null> {
    if (!tenantId) throw new Error("tenantId is required");
    const guardado = cache.get(tenantId);
    const fresca = guardado && ahora - guardado.en < MICROCACHE_MS;
    let p = fresca ? guardado.lista.find((x) => x.id === id) : undefined;
    /* El caché no guarda AUSENCIAS: una pantalla recién vinculada desde otra
       instancia no está en la lista cacheada acá, así que se relee la base. */
    if (!p) {
      const lista = listaDe(await PlatformSettingsDB.getFresco<unknown>(CLAVE(tenantId)));
      cache.set(tenantId, { lista, en: ahora });
      p = lista.find((x) => x.id === id);
    }
    return p && vigente(p, ahora) ? p : null;
  },

  async crear(
    tenantId: string,
    datos: { nombre: string; camaras: string[] | null; horas: number },
    user: string,
    ahora = Date.now(),
  ): Promise<ResultadoCrearPantalla> {
    if (!tenantId) throw new Error("tenantId is required");
    const pantalla: PantallaTv = {
      id: `tv_${randomBytes(9).toString("base64url")}`,
      nombre: datos.nombre,
      camaras: datos.camaras,
      creadaPor: user,
      creadaEn: new Date(ahora).toISOString(),
      expiraEn: new Date(ahora + datos.horas * 3_600_000).toISOString(),
      ultimaVez: null,
    };
    const r = await PlatformSettingsDB.actualizar<unknown, ResultadoCrearPantalla>(
      CLAVE(tenantId),
      (raw) => {
        /* Las vencidas se barren en cada escritura: no ocupan cupo. */
        const vigentes = listaDe(raw).filter((p) => vigente(p, ahora));
        if (vigentes.length >= MAX_PANTALLAS_TV) {
          return {
            resultado: {
              ok: false,
              motivo: `Ya hay ${MAX_PANTALLAS_TV} pantallas conectadas. Desconecta una antes de agregar otra.`,
            },
          };
        }
        return { valor: [...vigentes, pantalla], resultado: { ok: true, pantalla } };
      },
      user,
      TX_KV,
    );
    olvidar(tenantId);
    if (r.ok) {
      const que = datos.camaras === null ? "todas las cámaras" : `${datos.camaras.length} cámara(s)`;
      auditar(tenantId, "camara.tv_vincular", `Pantalla «${pantalla.nombre}»: ${que} por ${datos.horas} h`, user, pantalla.id);
    }
    return r;
  },

  /** Desconecta (borra) una pantalla. `false` si no estaba. */
  async revocar(tenantId: string, id: string, user: string): Promise<boolean> {
    if (!tenantId) throw new Error("tenantId is required");
    const quitada = await PlatformSettingsDB.actualizar<unknown, PantallaTv | null>(
      CLAVE(tenantId),
      (raw) => {
        const lista = listaDe(raw);
        const p = lista.find((x) => x.id === id) ?? null;
        if (!p) return { resultado: null };
        return { valor: lista.filter((x) => x.id !== id), resultado: p };
      },
      user,
      TX_KV,
    );
    olvidar(tenantId);
    if (quitada) auditar(tenantId, "camara.tv_desconectar", `Pantalla «${quitada.nombre}» desconectada`, user, id);
    return quitada !== null;
  },

  /** Anota el último pedido del TV. Quien llama decide cada cuánto (la guardia: 1/min). */
  async tocar(tenantId: string, id: string, ahora = Date.now()): Promise<void> {
    if (!tenantId) throw new Error("tenantId is required");
    const iso = new Date(ahora).toISOString();
    await PlatformSettingsDB.actualizar<unknown, null>(
      CLAVE(tenantId),
      (raw) => {
        const lista = listaDe(raw);
        if (!lista.some((x) => x.id === id)) return { resultado: null };
        return { valor: lista.map((x) => (x.id === id ? { ...x, ultimaVez: iso } : x)), resultado: null };
      },
      "tv",
      TX_KV,
    );
    const c = cache.get(tenantId);
    if (c) c.lista = c.lista.map((x) => (x.id === id ? { ...x, ultimaVez: iso } : x));
  },

  /** Sólo tests. */
  __olvidarTodo(): void {
    cache.clear();
  },
};
