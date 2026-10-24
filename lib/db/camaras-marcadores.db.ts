import "server-only";
import { prisma } from "@/lib/prisma";
import { PlatformSettingsDB, PREFIJO_INTERNO } from "@/lib/db/platform-settings.db";
import { WoodEntriesDB, vivaLinea } from "@/lib/db/wood-entries.db";
import { motivoNoElegible } from "@/lib/db/forest-lote-aserrio.db";
import { mixtoVivo } from "@/lib/forestal/lote-mixto";
import { sumarDias } from "@/lib/camaras/cruces";
import { logActivity } from "@/lib/activity-logger";
import { logger } from "@/lib/logger";
import {
  armarALaVista,
  DIAS_TROZAS_VISTAS,
  esIdDeTroza,
  fusionarPasada,
  idsLibresMasBajos,
  marcadorDeTroza,
  type AsignacionesMarcadores,
  type AsignacionMarcador,
  type EstadoDeTroza,
  type PasadaMarcadores,
  type RespuestaALaVista,
  type TrozasVistasDelDia,
} from "@/lib/camaras/marcadores";

/**
 * Marcadores de troza y «Trozas a la vista» (ADR-480, 2026-10-08).
 *
 * Sin tabla: dos claves `interno:` del KV (no viajan en `getAll()` ni invalidan
 * la caché del layout, lección de ADR-456):
 *   - `interno:camaras-marcadores:<t>` → `{ "<id>": {trozaId, asignadoEn, por} }`.
 *     La clave del mapa garantiza «un marcador = una troza».
 *   - `interno:camaras-trozas-vista:<t>:<día>` → lo visto ese día (últimas 48
 *     pasadas). Una clave por día: la reescritura bajo candado queda chica.
 *
 * Toda escritura va por `PlatformSettingsDB.actualizar` (candado por clave):
 * dos «asignar» a la vez no reparten el mismo id. La troza se lee SIEMPRE por
 * `tenantId` (`WoodEntriesDB.trozasDelPatio`): una de otro negocio no aparece y
 * se rechaza. Un marcador se libera solo, al leer, cuando su troza salió del
 * patio (consumida, despachada, borrada o de una guía anulada): no se toca el
 * consumo ni el despacho.
 */

export const CLAVE_MARCADORES = (tenantId: string) => `${PREFIJO_INTERNO}camaras-marcadores:${tenantId}`;
export const CLAVE_DIA_VISTO = (tenantId: string, dia: string) =>
  `${PREFIJO_INTERNO}camaras-trozas-vista:${tenantId}:${dia}`;

/** Las 4 esperas cortas del KV: una lista de 250 entradas se reescribe en ms. */
const TX_KV = { timeout: 10_000, maxWait: 5_000 } as const;

type FilaPatio = Awaited<ReturnType<typeof WoodEntriesDB.trozasDelPatio>>[number];

function asignacionesDe(raw: unknown): AsignacionesMarcadores {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: AsignacionesMarcadores = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const id = Number(k);
    if (!Number.isInteger(id) || !esIdDeTroza(id) || !v || typeof v !== "object") continue;
    const a = v as Partial<AsignacionMarcador>;
    if (typeof a.trozaId !== "string" || !a.trozaId) continue;
    out[k] = { trozaId: a.trozaId, asignadoEn: String(a.asignadoEn ?? ""), por: String(a.por ?? "") };
  }
  return out;
}

function diaDe(raw: unknown, dia: string): TrozasVistasDelDia | null {
  if (!raw || typeof raw !== "object") return null;
  const d = raw as Partial<TrozasVistasDelDia>;
  if (d.dia !== dia || !Array.isArray(d.pasadas) || !d.ids || typeof d.ids !== "object") return null;
  return { dia, pasadas: d.pasadas, ids: d.ids };
}

const texto = (v: string | null | undefined) => {
  const t = (v ?? "").trim();
  return t && t !== "—" ? t : null;
};

/**
 * Dónde está la troza hoy. «Salió» = ya no es madera del patio (corrida viva,
 * despacho vivo): su marcador queda libre. El motivo es la regla del lote
 * (`motivoNoElegible`, LM3): la misma que va a aplicar el mixto al apartar.
 */
export function estadoDeFila(t: FilaPatio): EstadoDeTroza {
  const corridaViva = Boolean(t.consumidaEn && t.consumidaEn.deletedAt == null && t.consumidaEn.status !== "anulado");
  const salio = corridaViva || vivaLinea(t.despachadaEn ?? null);
  const enMixto = mixtoVivo(t.loteMixto);
  const enLote = t.loteAserrio?.status === "abierto";
  const motivo = salio
    ? "la troza ya no está en el patio"
    : enLote
      ? `está apartada en el lote ${t.loteAserrio?.code ?? ""}`.trim()
      : motivoNoElegible({
          ...t,
          consumidaEnId: corridaViva ? t.consumidaEnId : null,
          entry: t.entry ? { ...t.entry, deletedAt: null } : null,
        });
  return {
    troza: {
      id: t.id,
      codigo: texto(t.codigoPlanta) ?? texto(t.codificacion) ?? t.id.slice(-6),
      especie: texto(t.especieComun),
      volumenM3: t.volumenM3 == null ? null : Number(t.volumenM3),
      loteCode: t.loteMixto && enMixto ? t.loteMixto.code : enLote ? (t.loteAserrio?.code ?? null) : null,
    },
    estado: salio ? "salio" : enMixto ? "en_mixto" : enLote ? "en_lote" : "libre",
    motivo,
  };
}

/** Lee las trozas por id SÓLO de este negocio. Las que no vuelven = borradas o de otro negocio. */
async function estadosDe(tenantId: string, trozaIds: readonly string[]): Promise<Map<string, EstadoDeTroza>> {
  const ids = [...new Set(trozaIds)].filter(Boolean);
  const out = new Map<string, EstadoDeTroza>();
  for (let i = 0; i < ids.length; i += 500) {
    const filas = await WoodEntriesDB.trozasDelPatio(tenantId, { ids: ids.slice(i, i + 500) });
    for (const f of filas) out.set(f.id, estadoDeFila(f));
  }
  return out;
}

/** Las trozas cuyo marcador ya se puede reusar: no volvieron (borradas) o salieron del patio. */
function vencidasDe(consultadas: readonly string[], estados: ReadonlyMap<string, EstadoDeTroza>): Set<string> {
  return new Set(consultadas.filter((id) => (estados.get(id)?.estado ?? "salio") === "salio"));
}

function auditar(tenantId: string, accion: string, detalle: string, user: string): void {
  logActivity(accion, "camara", detalle, undefined, user, undefined, tenantId).catch((err) =>
    logger.error("[camaras.marcadores] no se pudo auditar", { error: String(err), tenantId, accion }),
  );
}

export interface FilaAsignacion extends AsignacionMarcador {
  marcador: number;
  codigo: string | null;
  estado: EstadoDeTroza["estado"];
}

export interface ResultadoAsignar {
  asignados: { marcador: number; trozaId: string; codigo: string; nuevo: boolean }[];
  rechazados: { trozaId: string; motivo: string }[];
}

export const CamarasMarcadoresDB = {
  /** Las asignaciones vigentes (lo vencido sale como «salio») y cuántos ids de troza quedan libres. */
  async asignaciones(tenantId: string): Promise<{ asignaciones: FilaAsignacion[]; libres: number }> {
    if (!tenantId) throw new Error("tenantId is required");
    const a = asignacionesDe(await PlatformSettingsDB.getFresco<unknown>(CLAVE_MARCADORES(tenantId)));
    const consultadas = Object.values(a).map((x) => x.trozaId);
    const estados = await estadosDe(tenantId, consultadas);
    const vencidas = vencidasDe(consultadas, estados);
    const filas: FilaAsignacion[] = Object.entries(a)
      .map(([k, x]) => ({
        ...x,
        marcador: Number(k),
        codigo: estados.get(x.trozaId)?.troza.codigo ?? null,
        estado: estados.get(x.trozaId)?.estado ?? ("salio" as const),
      }))
      .sort((p, q) => p.marcador - q.marcador);
    return { asignaciones: filas, libres: idsLibresMasBajos(a, vencidas, 1_000).length };
  },

  /**
   * Un marcador por troza: la que ya tenía uno lo conserva (reimprimir no gasta
   * ids); las demás reciben los libres más bajos. Rechaza la troza que no es de
   * este negocio o que ya salió del patio.
   */
  async asignar(tenantId: string, trozaIds: readonly string[], user: string): Promise<ResultadoAsignar> {
    if (!tenantId) throw new Error("tenantId is required");
    const pedidas = [...new Set(trozaIds)];
    const previas = asignacionesDe(await PlatformSettingsDB.getFresco<unknown>(CLAVE_MARCADORES(tenantId)));
    const consultadas = [...new Set([...pedidas, ...Object.values(previas).map((x) => x.trozaId)])];
    const estados = await estadosDe(tenantId, consultadas);
    const rechazados: ResultadoAsignar["rechazados"] = [];
    const validas: string[] = [];
    for (const id of pedidas) {
      const e = estados.get(id);
      if (!e) rechazados.push({ trozaId: id, motivo: "No está en el patio de este negocio (guía anulada o troza ajena)." });
      else if (e.estado === "salio") rechazados.push({ trozaId: id, motivo: `${e.troza.codigo}: ya salió del patio.` });
      else validas.push(id);
    }
    const r = await PlatformSettingsDB.actualizar<unknown, ResultadoAsignar>(
      CLAVE_MARCADORES(tenantId),
      (raw) => {
        const a = asignacionesDe(raw);
        /* Sólo vence lo que se consultó: una troza que otro asignó recién (no está en `estados`) se respeta. */
        const vencidas = vencidasDe(
          consultadas.filter((id) => !validas.includes(id)),
          estados,
        );
        const sinMarcador = validas.filter((id) => marcadorDeTroza(a, id) === null);
        const libres = idsLibresMasBajos(a, vencidas, sinMarcador.length);
        const asignados: ResultadoAsignar["asignados"] = [];
        const ahora = new Date().toISOString();
        for (const id of validas) {
          const ya = marcadorDeTroza(a, id);
          if (ya !== null) {
            asignados.push({ marcador: ya, trozaId: id, codigo: estados.get(id)!.troza.codigo, nuevo: false });
            continue;
          }
          const libre = libres.shift();
          if (libre === undefined) {
            rechazados.push({ trozaId: id, motivo: "No quedan marcadores libres (0-199): libera los de trozas que ya no usas." });
            continue;
          }
          a[String(libre)] = { trozaId: id, asignadoEn: ahora, por: user };
          asignados.push({ marcador: libre, trozaId: id, codigo: estados.get(id)!.troza.codigo, nuevo: true });
        }
        const nuevos = asignados.filter((x) => x.nuevo).length;
        return { valor: nuevos > 0 ? a : undefined, resultado: { asignados, rechazados } };
      },
      user,
      TX_KV,
    );
    const nuevos = r.asignados.filter((x) => x.nuevo);
    if (nuevos.length)
      auditar(
        tenantId,
        "camara.marcadores_asignar",
        `Asignó ${nuevos.length} ${nuevos.length === 1 ? "marcador" : "marcadores"}: ${nuevos.map((x) => `${x.marcador}→${x.codigo}`).join(", ").slice(0, 400)}`,
        user,
      );
    return r;
  },

  /** Un marcador plastificado puesto a mano: se rechaza si lo tiene otra troza que sigue en el patio. */
  async vincular(tenantId: string, marcador: number, trozaId: string, user: string): Promise<ResultadoAsignar> {
    if (!tenantId) throw new Error("tenantId is required");
    const previas = asignacionesDe(await PlatformSettingsDB.getFresco<unknown>(CLAVE_MARCADORES(tenantId)));
    const otra = previas[String(marcador)]?.trozaId;
    const estados = await estadosDe(tenantId, otra && otra !== trozaId ? [trozaId, otra] : [trozaId]);
    const e = estados.get(trozaId);
    if (!e) return { asignados: [], rechazados: [{ trozaId, motivo: "No está en el patio de este negocio (guía anulada o troza ajena)." }] };
    if (e.estado === "salio")
      return { asignados: [], rechazados: [{ trozaId, motivo: `${e.troza.codigo}: ya salió del patio.` }] };
    const r = await PlatformSettingsDB.actualizar<unknown, ResultadoAsignar>(
      CLAVE_MARCADORES(tenantId),
      (raw) => {
        const a = asignacionesDe(raw);
        const actual = a[String(marcador)];
        if (actual && actual.trozaId !== trozaId) {
          const suya = estados.get(actual.trozaId);
          /* Sin leerla (otro la asignó recién) o todavía en el patio: no se pisa. */
          if (!suya || suya.estado !== "salio")
            return {
              resultado: {
                asignados: [],
                rechazados: [{ trozaId, motivo: `El marcador ${marcador} ya es de ${suya?.troza.codigo ?? "otra troza"}: libéralo primero.` }],
              },
            };
        }
        const previo = marcadorDeTroza(a, trozaId);
        if (previo !== null) delete a[String(previo)];
        /* Volver a vincular el mismo par no cambia desde cuándo es suyo (lo usa «Trozas a la vista»). */
        const desde = actual?.trozaId === trozaId ? actual.asignadoEn : new Date().toISOString();
        a[String(marcador)] = { trozaId, asignadoEn: desde, por: user };
        return { valor: a, resultado: { asignados: [{ marcador, trozaId, codigo: e.troza.codigo, nuevo: true }], rechazados: [] } };
      },
      user,
      TX_KV,
    );
    if (r.asignados.length) auditar(tenantId, "camara.marcadores_vincular", `Vinculó el marcador ${marcador} a ${e.troza.codigo}`, user);
    return r;
  },

  async liberar(tenantId: string, marcadores: readonly number[], user: string): Promise<{ liberados: number[] }> {
    if (!tenantId) throw new Error("tenantId is required");
    const r = await PlatformSettingsDB.actualizar<unknown, { liberados: number[] }>(
      CLAVE_MARCADORES(tenantId),
      (raw) => {
        const a = asignacionesDe(raw);
        const liberados = [...new Set(marcadores)].filter((m) => a[String(m)]);
        for (const m of liberados) delete a[String(m)];
        return { valor: liberados.length ? a : undefined, resultado: { liberados } };
      },
      user,
      TX_KV,
    );
    if (r.liberados.length) auditar(tenantId, "camara.marcadores_liberar", `Liberó los marcadores ${r.liberados.join(", ")}`, user);
    return r;
  },

  /** Suma una pasada al día de Lima (`dia`). Devuelve cuántos ids de troza se vieron. */
  async anotarPasada(tenantId: string, dia: string, pasada: PasadaMarcadores, user: string): Promise<{ vistos: number }> {
    if (!tenantId) throw new Error("tenantId is required");
    await PlatformSettingsDB.actualizar<unknown, null>(
      CLAVE_DIA_VISTO(tenantId, dia),
      (raw) => ({ valor: fusionarPasada(diaDe(raw, dia), dia, pasada), resultado: null }),
      user,
      TX_KV,
    );
    return { vistos: pasada.ids.filter(esIdDeTroza).length };
  },

  /** «Trozas a la vista» de un día (o de una pasada), con la troza de cada marcador. */
  async aLaVista(
    tenantId: string,
    q: { dia: string; pasada?: string; m?: readonly number[] },
  ): Promise<RespuestaALaVista> {
    if (!tenantId) throw new Error("tenantId is required");
    const [rawDia, rawA] = await Promise.all([
      PlatformSettingsDB.getFresco<unknown>(CLAVE_DIA_VISTO(tenantId, q.dia)),
      PlatformSettingsDB.getFresco<unknown>(CLAVE_MARCADORES(tenantId)),
    ]);
    const dia = diaDe(rawDia, q.dia);
    const a = asignacionesDe(rawA);
    const vistos = Object.keys(dia?.ids ?? {});
    const trozaIds = vistos.map((k) => a[k]?.trozaId).filter((x): x is string => Boolean(x));
    const estados = await estadosDe(tenantId, trozaIds);
    return armarALaVista(dia, q.dia, a, estados, { pasada: q.pasada, m: q.m });
  },

  /**
   * Borra los días vistos de más de `DIAS_TROZAS_VISTAS` en UNA consulta: las
   * claves terminan en AAAA-MM-DD, así que «más viejo» = menor como texto.
   * Se leen siempre con `getFresco` (sin caché): no hay nada que invalidar.
   */
  async purgarDias(tenantId: string, hoy: string): Promise<number> {
    if (!tenantId) throw new Error("tenantId is required");
    const prefijo = CLAVE_DIA_VISTO(tenantId, "");
    const r = await prisma.platformSetting.deleteMany({
    // eslint-disable-next-line no-restricted-syntax -- PlatformSetting no tiene columna tenantId: el aislamiento va en el prefijo de la clave
      where: { key: { startsWith: prefijo, lt: CLAVE_DIA_VISTO(tenantId, sumarDias(hoy, -DIAS_TROZAS_VISTAS)) } },
    });
    return r.count;
  },
};
