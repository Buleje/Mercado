import "server-only";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/lib/generated/prisma/client";
import { getOrSet, invalidateByPrefix } from "@/lib/cache";
import { logger } from "@/lib/logger";
import { auditCtp } from "@/lib/forestal/ctp-audit";
import {
  ETIQUETA_RELACION,
  RELACIONES_PARTE,
  type RelacionParte,
  type VinculoParte,
  type VinculoParteInput,
} from "@/lib/forestal/vinculos-parte";
import { ParteNoEncontradaError, esChoqueUnico, exigirParteDelTenant } from "./forest-parte-tarifa.db";

/**
 * ForestParteVinculoDB — una parte del Directorio atada a otra parte o a un
 * permiso (ADR-430).
 *
 * El vínculo no mueve plata: la deuda va siempre al cliente (decisión 4). Sirve
 * para ver, en la ficha, el saldo propio al lado del de sus vinculados
 * (`ForestCuentaDB.saldoConsolidado`), sin mezclar libretas.
 *
 * Las tres refs (`parteId`, `vinculadaParteId`, `contratoId`) van sin FK
 * (ADR-426): una FK aceptaría una fila de OTRO tenant. Lo que aísla es el
 * `findFirst({ id, tenantId })` de cada una antes de escribir.
 *
 * `listar` devuelve los dos sentidos (fase 2, 22-09): los que la parte anotó
 * (`sentido: "sale"`) y los que otra parte anotó apuntando a ella
 * (`sentido: "entra"`) — antes sólo el primero, y la ficha de la parte
 * VINCULADA nunca veía que alguien la había vinculado.
 */

const CACHE_PREFIX = "forest-parte-vinculo";
const claveCache = (tenantId: string, parteId: string) => `${CACHE_PREFIX}:${tenantId}:${parteId}`;

/** Lo que el vínculo rechaza por sus reglas (uno de dos, consigo misma). 422. */
export class VinculoParteError extends Error {
  constructor(motivo: string) {
    super(motivo);
    this.name = "VinculoParteError";
  }
}

/** El mismo vínculo ya está vivo. 409. */
export class VinculoDuplicadoError extends Error {
  constructor() {
    super("Ese vínculo ya está anotado.");
    this.name = "VinculoDuplicadoError";
  }
}

type Row = Prisma.ForestParteVinculoGetPayload<Record<string, never>>;

const dia = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
const fechaUtc = (v: string | null | undefined) => (v ? new Date(`${v}T00:00:00.000Z`) : null);
const esRelacion = (v: string): v is RelacionParte => (RELACIONES_PARTE as readonly string[]).includes(v);

function invalidar(tenantId: string): void {
  try {
    invalidateByPrefix(`${CACHE_PREFIX}:${tenantId}`);
  } catch (err) {
    logger.error("[forest-parte-vinculo] no se pudo invalidar la caché", { error: String(err), tenantId });
  }
}

/**
 * Las filas con el nombre de la parte vinculada y el código del permiso,
 * leídos del MISMO tenant — y el `sentido` respecto de `parteIdConsultado`:
 * «sale» si la fila es de ella (`r.parteId`), «entra» si apunta a ella
 * (`r.vinculadaParteId`). `parteIdConsultado` es `undefined` sólo para
 * `crear`/`quitar`, donde la fila SIEMPRE es de quien la creó (sale).
 */
async function conNombres(tenantId: string, rows: Row[], parteIdConsultado?: string): Promise<VinculoParte[]> {
  const partesIds = [
    ...new Set(rows.flatMap((r) => [r.parteId, r.vinculadaParteId]).filter((x): x is string => !!x)),
  ];
  const contratosIds = [...new Set(rows.map((r) => r.contratoId).filter((x): x is string => !!x))];
  const [partes, contratos] = await Promise.all([
    partesIds.length
      ? prisma.forestParty.findMany({ where: { tenantId, id: { in: partesIds } }, select: { id: true, nombre: true } })
      : Promise.resolve([]),
    contratosIds.length
      ? prisma.forestContrato.findMany({ where: { tenantId, id: { in: contratosIds } }, select: { id: true, codigo: true } })
      : Promise.resolve([]),
  ]);
  const nombre = new Map(partes.map((p) => [p.id, p.nombre]));
  const codigo = new Map(contratos.map((c) => [c.id, c.codigo]));
  return rows.map((r) => {
    const sentido: VinculoParte["sentido"] = parteIdConsultado && r.parteId !== parteIdConsultado ? "entra" : "sale";
    return {
      id: r.id,
      parteId: r.parteId,
      relacion: esRelacion(r.relacion) ? r.relacion : "otro",
      vinculadaParteId: r.vinculadaParteId,
      /* En "entra" la vinculada ES la parte consultada: repetir su propio
         nombre acá no dice nada (`parteNombre` ya dice quién anotó el
         vínculo). */
      vinculadaNombre: sentido === "sale" && r.vinculadaParteId ? (nombre.get(r.vinculadaParteId) ?? null) : null,
      contratoId: r.contratoId,
      contratoCodigo: r.contratoId ? (codigo.get(r.contratoId) ?? null) : null,
      desde: dia(r.desde),
      hasta: dia(r.hasta),
      notas: r.notas,
      sentido,
      parteNombre: sentido === "entra" ? (nombre.get(r.parteId) ?? null) : null,
    };
  });
}

export const ForestParteVinculoDB = {
  /**
   * Los vínculos vivos de una parte: los que ELLA anotó («Juan trabaja para
   * X», `sentido: "sale"`) Y los que OTRA parte anotó apuntando a ella
   * («X dijo que Juan trabaja para él», `sentido: "entra"`) — antes sólo se
   * devolvían los primeros, y la ficha de la parte vinculada no veía el
   * vínculo. Los que entran nunca son con un permiso (`ForestContrato` no
   * tiene ficha que los liste). En el orden en que se anotaron. 60 s de
   * caché; crear y quitar la invalidan.
   *
   * @throws ParteNoEncontradaError si la parte no es de este tenant.
   */
  async listar(tenantId: string, parteId: string): Promise<VinculoParte[]> {
    await exigirParteDelTenant(tenantId, parteId);
    return getOrSet(claveCache(tenantId, parteId), 60, async () => {
      const [salen, entran] = await Promise.all([
        prisma.forestParteVinculo.findMany({
          where: { tenantId, parteId, deletedAt: null },
          orderBy: { createdAt: "asc" },
          take: 200,
        }),
        prisma.forestParteVinculo.findMany({
          where: { tenantId, vinculadaParteId: parteId, deletedAt: null },
          orderBy: { createdAt: "asc" },
          take: 200,
        }),
      ]);
      return conNombres(tenantId, [...salen, ...entran], parteId);
    });
  },

  /**
   * Anota un vínculo. Las tres refs se validan DEL MISMO tenant.
   *
   * @throws VinculoParteError si no es exactamente uno de (parte, permiso) o es consigo misma.
   * @throws ParteNoEncontradaError si la parte, la vinculada o el permiso no son de este tenant.
   * @throws VinculoDuplicadoError si ya hay uno vivo igual.
   */
  async crear(tenantId: string, input: VinculoParteInput, user = "unknown"): Promise<VinculoParte> {
    if (!tenantId) throw new Error("tenantId is required");
    const vinculadaParteId = input.vinculadaParteId?.trim() || null;
    const contratoId = input.contratoId?.trim() || null;
    /* La base tiene el mismo CHECK; se repite acá para responder con palabras
       en vez de con un error de Postgres. */
    if (!!vinculadaParteId === !!contratoId) {
      throw new VinculoParteError("Vincula con UNA parte del Directorio o con UN permiso, no con los dos ni con ninguno.");
    }
    if (vinculadaParteId === input.parteId) throw new VinculoParteError("Una parte no se vincula consigo misma.");

    const [parte, vinculada, contrato] = await Promise.all([
      prisma.forestParty.findFirst({ where: { id: input.parteId, tenantId, deletedAt: null }, select: { id: true, nombre: true } }),
      vinculadaParteId
        ? prisma.forestParty.findFirst({ where: { id: vinculadaParteId, tenantId, deletedAt: null }, select: { id: true, nombre: true } })
        : Promise.resolve(null),
      contratoId
        ? prisma.forestContrato.findFirst({ where: { id: contratoId, tenantId, deletedAt: null }, select: { id: true, codigo: true } })
        : Promise.resolve(null),
    ]);
    if (!parte) throw new ParteNoEncontradaError();
    if (vinculadaParteId && !vinculada) throw new ParteNoEncontradaError("La parte a vincular no está en el Directorio.");
    if (contratoId && !contrato) throw new ParteNoEncontradaError("Ese permiso no existe.");

    const ya = await prisma.forestParteVinculo.findFirst({
      where: { tenantId, parteId: parte.id, relacion: input.relacion, vinculadaParteId, contratoId, deletedAt: null },
      select: { id: true },
    });
    if (ya) throw new VinculoDuplicadoError();

    let row: Row;
    try {
      row = await prisma.forestParteVinculo.create({
        data: {
          tenantId,
          parteId: parte.id,
          relacion: input.relacion,
          vinculadaParteId,
          contratoId,
          desde: fechaUtc(input.desde),
          hasta: fechaUtc(input.hasta),
          notas: input.notas?.trim() || null,
          createdBy: user || "unknown",
        },
      });
    } catch (err) {
      /* Dos toques a la vez: el único parcial frenó al segundo. */
      if (esChoqueUnico(err)) throw new VinculoDuplicadoError();
      throw err;
    }
    invalidar(tenantId);

    const con = vinculada ? vinculada.nombre : `el permiso ${contrato?.codigo ?? contratoId}`;
    auditCtp({
      tenantId,
      action: "ctp_vinculo_parte_crear",
      entity: "ForestParteVinculo",
      entityId: row.id,
      detail: `Vinculó a ${parte.nombre}: ${ETIQUETA_RELACION[input.relacion].toLowerCase()} ${con}`,
      user,
    });
    const [vinculo] = await conNombres(tenantId, [row], row.parteId);
    return vinculo;
  },

  /** Baja lógica. `false` si no existía en este tenant (404). */
  async quitar(tenantId: string, id: string, user = "unknown"): Promise<boolean> {
    if (!tenantId) throw new Error("tenantId is required");
    const row = await prisma.forestParteVinculo.findFirst({ where: { id, tenantId, deletedAt: null } });
    if (!row) return false;
    const { count } = await prisma.forestParteVinculo.updateMany({
      where: { id, tenantId, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    if (count === 0) return false;
    invalidar(tenantId);
    const [v] = await conNombres(tenantId, [row], row.parteId);
    const parte = await prisma.forestParty.findFirst({ where: { id: row.parteId, tenantId }, select: { nombre: true } });
    auditCtp({
      tenantId,
      action: "ctp_vinculo_parte_quitar",
      entity: "ForestParteVinculo",
      entityId: id,
      detail:
        `Quitó el vínculo de ${parte?.nombre ?? row.parteId}: ${ETIQUETA_RELACION[v.relacion].toLowerCase()} ` +
        (v.vinculadaNombre ?? (v.contratoCodigo ? `el permiso ${v.contratoCodigo}` : "—")),
      user,
    });
    return true;
  },
};
