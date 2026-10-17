import "server-only";
import { prisma } from "@/lib/prisma";
import { PlatformSettingsDB } from "@/lib/db/platform-settings.db";
import { ForestEspeciesDB } from "@/lib/db/forest-especies.db";
import { especiesDisponibles } from "@/lib/forestal/especies-catalogo";
import {
  baseDelBorrador,
  borradorDeTarifa,
  corridaSinPt,
  desdeHaceMeses,
  type BaseDelBorrador,
} from "@/lib/forestal/tarifa-aserrio";
import { hoyEnLima } from "@/lib/forestal/semana-de-registro";
import { auditCtp } from "@/lib/forestal/ctp-audit";
import { getOrSet, invalidate } from "@/lib/cache";
import {
  TARIFARIO_VACIO,
  guardarVersion,
  normalizarTarifario,
  quitarVersion,
  revisarVersion,
  versionVigente,
  type Tarifario,
  type VersionTarifa,
  type VersionTarifaInput,
} from "@/lib/forestal/tarifa-aserrio";

/**
 * ForestTarifaAserrioDB — la tarifa del aserrío por encargo (ADR-412 §2).
 *
 * POR QUÉ KV y no un modelo Prisma (mismo criterio que el catálogo de especies,
 * ADR-410 §1): son decenas de versiones por planta, cada una con tres tablas
 * cortas. Promoverlo a tabla el día que haga falta es leer el KV e insertar.
 *
 * Las versiones no se editan en el lugar: se guarda otra con su fecha de
 * vigencia, y guardar el mismo día corrige la de ese día. Lo ya cobrado no se
 * toca nunca desde acá — la cotización quedó congelada en la corrida.
 *
 * Los writes se auditan: es el precio que después se le cobra a un tercero.
 */

const KEY_PREFIX = "ctp-tarifa-aserrio:";

const clave = (tenantId: string) => `${KEY_PREFIX}${tenantId}`;
/** Caché del tarifario YA normalizado (el KV cachea el JSON crudo). */
const claveCache = (tenantId: string) => `forest-tarifa-aserrio:${tenantId}`;

/**
 * Lo que la tarifa rechaza por sus propias reglas —una especie dos veces, tramos
 * que se pisan— y no por una falla del sistema. El route lo traduce a 422 con
 * el motivo tal cual: son mensajes escritos para quien está cargando.
 */
export class TarifaAserrioError extends Error {
  constructor(motivo: string) {
    super(motivo);
    this.name = "TarifaAserrioError";
  }
}

const soles = (n: number) => n.toFixed(4).replace(/(\.\d\d\d??)0+$/, "$1");

/** Cuánta producción mira el borrador: lo reciente es lo que se va a cobrar. */
const MESES_BORRADOR = 6;

export const ForestTarifaAserrioDB = {
  /**
   * Un borrador de tarifa armado con la producción de los últimos 6 meses.
   * NO guarda nada: los precios vienen en 0 y los pone el dueño del aserradero.
   *
   * Sólo las corridas que se pueden cobrar (`corridaSinPt`): el precio es por
   * PT, y una corrida en kg o en unidades sin paquetes no tiene PT que tarifar.
   */
  async borrador(tenantId: string): Promise<{ borrador: VersionTarifaInput; base: BaseDelBorrador }> {
    if (!tenantId) throw new Error("tenantId is required");
    const hoy = hoyEnLima();
    /* El día de Lima a 00:00Z, como se guarda `entryDate`. Con la hora de
       ahora el día límite quedaba afuera, y restarle meses a un 31 desbordaba
       (31-ago − 6 meses daba 3-mar). */
    const desde = new Date(`${desdeHaceMeses(hoy, MESES_BORRADOR)}T00:00:00.000Z`);
    const [filas, catalogo] = await Promise.all([
      prisma.forestCtpEntry.findMany({
        where: {
          tenantId,
          section: "produccion",
          status: "registrado",
          deletedAt: null,
          quantity: { not: null },
          entryDate: { gte: desde },
        },
        orderBy: { entryDate: "desc" },
        take: 2000,
        select: {
          id: true,
          lineNo: true,
          entryDate: true,
          speciesCommon: true,
          productType: true,
          quantity: true,
          unit: true,
          paquetes: {
            where: { deletedAt: null },
            select: { codigo: true, productType: true, volumenM3: true, espesorCm: true, anchoCm: true, largoM: true },
          },
        },
      }),
      ForestEspeciesDB.get(tenantId),
    ]);
    const num = (v: unknown) => (v == null ? null : Number(v));
    const cobrables = filas.filter((f) => !corridaSinPt(f.unit, f.paquetes.length > 0));
    const corridas = cobrables.map((f) => ({
      id: f.id,
      lineNo: f.lineNo,
      speciesCommon: f.speciesCommon,
      productType: f.productType,
      quantity: num(f.quantity),
      unit: f.unit,
      /* Leída igual que en el cobro (`vigente` hace `toISOString`): si la
         vigencia saliera de otro huso, la corrida más vieja quedaría un día
         antes de la tarifa que armó. */
      fecha: f.entryDate.toISOString().slice(0, 10),
    }));
    const paquetes = cobrables.flatMap((f) =>
      f.paquetes.map((p) => ({
        ctpEntryId: f.id,
        codigo: p.codigo,
        productType: p.productType,
        volumenM3: Number(p.volumenM3),
        espesorCm: num(p.espesorCm),
        anchoCm: num(p.anchoCm),
        largoM: num(p.largoM),
      })),
    );
    const nombres = new Map(especiesDisponibles(catalogo).map((e) => [e.clave, e.nombre]));
    return {
      borrador: borradorDeTarifa(corridas, paquetes, { hoy, nombres }),
      base: baseDelBorrador(corridas, paquetes, nombres),
    };
  },

  /** El tarifario del tenant. Nunca `null`: sin nada guardado no hay versiones. */
  async leer(tenantId: string): Promise<Tarifario> {
    if (!tenantId) throw new Error("tenantId is required");
    return getOrSet(claveCache(tenantId), 300, async () => {
      const raw = await PlatformSettingsDB.get<unknown>(clave(tenantId));
      return raw ? normalizarTarifario(raw) : TARIFARIO_VACIO;
    });
  },

  /** La versión que regía ese día; `null` si el día es anterior a toda tarifa. */
  async vigente(tenantId: string, fecha: string | Date | null | undefined): Promise<VersionTarifa | null> {
    const dia = fecha instanceof Date ? fecha.toISOString() : fecha;
    return versionVigente(await this.leer(tenantId), dia);
  },

  /**
   * Guarda una versión (nueva, o la misma `id` corregida). Devuelve el
   * tarifario ya guardado.
   *
   * @throws TarifaAserrioError si la versión daría dos precios para la misma
   *   pieza o ninguno para nada (`revisarVersion`).
   */
  async guardar(tenantId: string, input: VersionTarifaInput, user = "unknown"): Promise<Tarifario> {
    if (!tenantId) throw new Error("tenantId is required");
    const r = revisarVersion(input);
    if (!r.ok) throw new TarifaAserrioError(r.motivo);

    const actual = await this.leer(tenantId);
    const version: VersionTarifa = {
      id: input.id?.trim() || crypto.randomUUID(),
      ...r.version,
      creadoPor: user,
      creadoEn: new Date().toISOString(),
    };
    const editada = actual.versiones.find((v) => v.id === version.id);
    /* Guardar sobre un día que ya tenía tarifa la reemplaza (`guardarVersion`).
       Se dice en el rastro: la de antes desaparece del tarifario. */
    const pisada = actual.versiones.find((v) => v.id !== version.id && v.vigenteDesde === version.vigenteDesde);

    const siguiente = guardarVersion(actual, version);
    await PlatformSettingsDB.set(clave(tenantId), siguiente, user);
    invalidate(claveCache(tenantId));

    auditCtp({
      tenantId,
      action: "ctp_tarifa_aserrio_guardar",
      entity: "ForestTarifaAserrio",
      entityId: version.id,
      detail:
        `${editada ? "Corrigió" : "Guardó"} la tarifa de aserrío vigente desde ${version.vigenteDesde}: ` +
        `S/ ${soles(version.basePt)} por PT general · ${version.especies.length} especie(s) con precio propio · ` +
        `${version.tipos.length} ajuste(s) por tipo · ${version.largos.length} tramo(s) de largo` +
        (editada && editada.vigenteDesde !== version.vigenteDesde ? ` (antes regía desde ${editada.vigenteDesde})` : "") +
        (pisada ? ` (reemplazó la que ya regía ese día)` : ""),
      user,
    });
    return siguiente;
  },

  /** Saca una versión. `null` si no existía (el route responde 404). */
  async quitar(tenantId: string, id: string, user = "unknown"): Promise<Tarifario | null> {
    if (!tenantId) throw new Error("tenantId is required");
    const actual = await this.leer(tenantId);
    const version = actual.versiones.find((v) => v.id === id);
    if (!version) return null;

    const siguiente = quitarVersion(actual, id);
    await PlatformSettingsDB.set(clave(tenantId), siguiente, user);
    invalidate(claveCache(tenantId));

    auditCtp({
      tenantId,
      action: "ctp_tarifa_aserrio_quitar",
      entity: "ForestTarifaAserrio",
      entityId: id,
      detail:
        `Quitó la tarifa de aserrío vigente desde ${version.vigenteDesde} ` +
        `(S/ ${soles(version.basePt)} por PT general). Lo ya cobrado con ella no cambia.`,
      user,
    });
    return siguiente;
  },
};
