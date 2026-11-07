import "server-only";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/lib/generated/prisma/client";
import { invalidate } from "@/lib/cache";
import { logger } from "@/lib/logger";
import { auditCtp } from "@/lib/forestal/ctp-audit";
import {
  ETIQUETA_TIPO_RESPALDO,
  TABLAS_RESPALDO,
  TOPES_RESPALDO,
  type ConteosRespaldo,
  type RespaldoResumen,
  type TablaRespaldo,
  type TipoRespaldo,
} from "@/lib/forestal/ctp-respaldo-tipos";
import {
  VERSION_RESPALDO,
  comprimir,
  conteosDe,
  filasDe,
  huellaDe,
  serializarFila,
  type TablasSerial,
} from "@/lib/forestal/ctp-respaldo-serial";

/**
 * lib/db/forest-ctp-respaldo-foto.db.ts — la FOTO del Libro CTP (ADR-530).
 *
 * Lee TODAS las tablas de `TABLAS_RESPALDO` del negocio (vivas y dadas de
 * baja) en UNA transacción `RepeatableRead`: lo que se guarda es un libro
 * coherente, no quince lecturas de momentos distintos. Aparte de
 * `forest-ctp-respaldo.db.ts` para que el vaciado, el anular día y el cierre
 * puedan pedir su respaldo previo sin importar a quien los importa (sin ciclo).
 */

/** El cliente con que se lee: el global o el de una transacción abierta. */
export type Db = typeof prisma | Prisma.TransactionClient;

/** Lo mínimo que usamos de un delegado de Prisma, igual para las 15 tablas. */
export interface DelegadoGenerico {
  findMany(args: { where: Record<string, unknown>; orderBy?: Record<string, "asc" | "desc"> }): Promise<Record<string, unknown>[]>;
  createMany(args: { data: Record<string, unknown>[]; skipDuplicates?: boolean }): Promise<{ count: number }>;
  updateMany(args: { where: Record<string, unknown>; data: Record<string, unknown> }): Promise<{ count: number }>;
}

/** Tabla → delegado de Prisma y columnas que el cliente de HOY conoce. */
export const MODELO: Readonly<Record<TablaRespaldo, { delegado: string; columnas: readonly string[] }>> = {
  WoodEntry: { delegado: "woodEntry", columnas: Object.keys(Prisma.WoodEntryScalarFieldEnum) },
  ForestLoteMixto: { delegado: "forestLoteMixto", columnas: Object.keys(Prisma.ForestLoteMixtoScalarFieldEnum) },
  ForestLoteAserrio: { delegado: "forestLoteAserrio", columnas: Object.keys(Prisma.ForestLoteAserrioScalarFieldEnum) },
  ForestCtpEntry: { delegado: "forestCtpEntry", columnas: Object.keys(Prisma.ForestCtpEntryScalarFieldEnum) },
  WoodEntryTroza: { delegado: "woodEntryTroza", columnas: Object.keys(Prisma.WoodEntryTrozaScalarFieldEnum) },
  ForestCtpPaquete: { delegado: "forestCtpPaquete", columnas: Object.keys(Prisma.ForestCtpPaqueteScalarFieldEnum) },
  ForestCtpApartado: { delegado: "forestCtpApartado", columnas: Object.keys(Prisma.ForestCtpApartadoScalarFieldEnum) },
  ForestCtpConsumo: { delegado: "forestCtpConsumo", columnas: Object.keys(Prisma.ForestCtpConsumoScalarFieldEnum) },
  ForestCtpDespachoOrigen: { delegado: "forestCtpDespachoOrigen", columnas: Object.keys(Prisma.ForestCtpDespachoOrigenScalarFieldEnum) },
  ForestCtpReproceso: { delegado: "forestCtpReproceso", columnas: Object.keys(Prisma.ForestCtpReprocesoScalarFieldEnum) },
  ForestProdLote: { delegado: "forestProdLote", columnas: Object.keys(Prisma.ForestProdLoteScalarFieldEnum) },
  ForestProdLoteMiembro: { delegado: "forestProdLoteMiembro", columnas: Object.keys(Prisma.ForestProdLoteMiembroScalarFieldEnum) },
  ForestCuentaMov: { delegado: "forestCuentaMov", columnas: Object.keys(Prisma.ForestCuentaMovScalarFieldEnum) },
  CampoPersonalizadoValor: { delegado: "campoPersonalizadoValor", columnas: Object.keys(Prisma.CampoPersonalizadoValorScalarFieldEnum) },
  ForestGuiaGuardada: { delegado: "forestGuiaGuardada", columnas: Object.keys(Prisma.ForestGuiaGuardadaScalarFieldEnum) },
};

export const delegado = (db: Db, t: TablaRespaldo): DelegadoGenerico =>
  (db as unknown as Record<string, DelegadoGenerico>)[MODELO[t].delegado];

/** Tope de ids por sentencia (Postgres acepta 32 767 parámetros). */
const TANDA = 5_000;

/** Errores del respaldo con su HTTP: la ruta los traduce tal cual. */
export type CodigoRespaldo = "NO_EXISTE" | "TOPE_MANUALES" | "LIBRO_CAMBIO" | "NO_SE_PUEDE" | "RESPALDO_PREVIO" | "SOLO_MANUALES" | "SIN_AUDITORIA";
export const ESTADO_HTTP_RESPALDO: Readonly<Record<CodigoRespaldo, number>> = {
  NO_EXISTE: 404,
  TOPE_MANUALES: 409,
  LIBRO_CAMBIO: 409,
  NO_SE_PUEDE: 422,
  RESPALDO_PREVIO: 503,
  SOLO_MANUALES: 409,
  SIN_AUDITORIA: 503,
};
export class RespaldoError extends Error {
  constructor(
    readonly code: CodigoRespaldo,
    message: string,
  ) {
    super(message);
    this.name = "RespaldoError";
  }
}

/**
 * Las filas del libro con `db` (dentro de la transacción de la foto o de
 * recuperar). Los cargos de la cuenta corriente, solo los del aserrío (con
 * corrida); los campos propios, solo los de registros del libro.
 */
export async function leerLibro(db: Db, tenantId: string): Promise<TablasSerial> {
  if (!tenantId) throw new Error("tenantId is required");
  const crudas: Partial<Record<TablaRespaldo, Record<string, unknown>[]>> = {};
  for (const t of TABLAS_RESPALDO) {
    if (t === "CampoPersonalizadoValor") continue;
    const where = t === "ForestCuentaMov" ? { tenantId, ctpEntryId: { not: null } } : { tenantId };
    crudas[t] = await delegado(db, t).findMany({ where, orderBy: { id: "asc" } });
  }
  const ids = [
    ...new Set(
      (["WoodEntry", "WoodEntryTroza", "ForestCtpEntry", "ForestCtpPaquete", "ForestLoteAserrio", "ForestLoteMixto", "ForestProdLote"] as const).flatMap(
        (t) => (crudas[t] ?? []).map((f) => String(f.id)),
      ),
    ),
  ];
  const campos: Record<string, unknown>[] = [];
  for (let i = 0; i < ids.length; i += TANDA) {
    campos.push(
      ...(await delegado(db, "CampoPersonalizadoValor").findMany({
        where: { tenantId, registroId: { in: ids.slice(i, i + TANDA) } },
        orderBy: { id: "asc" },
      })),
    );
  }
  crudas.CampoPersonalizadoValor = campos;
  const out: TablasSerial = {};
  for (const t of TABLAS_RESPALDO) out[t] = (crudas[t] ?? []).map(serializarFila);
  return out;
}

/** La foto coherente del libro entero: una transacción `RepeatableRead`, solo lecturas. */
export async function fotoDelLibro(tenantId: string): Promise<TablasSerial> {
  return prisma.$transaction((tx) => leerLibro(tx, tenantId), {
    isolationLevel: "RepeatableRead",
    timeout: 60_000,
    maxWait: 10_000,
  });
}

/** Columnas de cada tabla según el cliente de hoy (versión del formato). */
export function columnasDelCliente(): Partial<Record<TablaRespaldo, string[]>> {
  const out: Partial<Record<TablaRespaldo, string[]>> = {};
  for (const t of TABLAS_RESPALDO) out[t] = [...MODELO[t].columnas];
  return out;
}

export const claveLista = (tenantId: string) => `forest-ctp-respaldo:${tenantId}`;

export const CABECERA = {
  id: true,
  tipo: true,
  nota: true,
  conteos: true,
  bytes: true,
  createdBy: true,
  createdAt: true,
} as const;

export function resumenDe(r: {
  id: string;
  tipo: string;
  nota: string | null;
  conteos: unknown;
  bytes: number;
  createdBy: string;
  createdAt: Date;
}): RespaldoResumen {
  const conteos = (r.conteos && typeof r.conteos === "object" ? r.conteos : {}) as ConteosRespaldo;
  return {
    id: r.id,
    tipo: r.tipo as TipoRespaldo,
    nota: r.nota,
    conteos,
    filas: filasDe(conteos),
    bytes: r.bytes,
    createdBy: r.createdBy,
    createdAt: r.createdAt.toISOString(),
  };
}

export const ForestCtpRespaldoFotoDB = {
  /**
   * Guarda la foto. Un `diario` igual al último respaldo (misma huella), o de
   * un libro vacío sin respaldos previos, no se guarda: devuelve null. Los
   * manuales tienen tope (`TOPES_RESPALDO.manuales`) y nunca se podan solos.
   */
  async crear(tenantId: string, tipo: TipoRespaldo, user: string, nota?: string | null): Promise<RespaldoResumen | null> {
    if (!tenantId) throw new Error("tenantId is required");
    const usuario = user?.trim() || "unknown";
    const exigirTope = async (db: Db) => {
      const n = await db.forestCtpRespaldo.count({ where: { tenantId, tipo: "manual" } });
      if (n >= TOPES_RESPALDO.manuales) {
        throw new RespaldoError(
          "TOPE_MANUALES",
          `Ya hay ${n} respaldos guardados a mano (el tope es ${TOPES_RESPALDO.manuales}): borra uno viejo para guardar otro.`,
        );
      }
    };
    /* Antes de leer el libro entero (no gastar la foto si ya está lleno); se
       vuelve a contar bajo candado justo antes de crear. */
    if (tipo === "manual") await exigirTope(prisma);
    const tablas = await fotoDelLibro(tenantId);
    const huella = huellaDe(tablas);
    const conteos = conteosDe(tablas);
    if (tipo === "diario") {
      const ultimo = await prisma.forestCtpRespaldo.findFirst({
        where: { tenantId },
        orderBy: { createdAt: "desc" },
        select: { huella: true },
      });
      if (ultimo?.huella === huella || (!ultimo && filasDe(conteos) === 0)) return null;
    }
    const datos = comprimir({ version: VERSION_RESPALDO, columnas: columnasDelCliente(), tablas });
    const data = {
      tenantId,
      tipo,
      nota: nota?.trim() || null,
      conteos: conteos as unknown as Prisma.InputJsonValue,
      huella,
      version: VERSION_RESPALDO,
      bytes: datos.length,
      datos: new Uint8Array(datos),
      createdBy: usuario,
    } satisfies Prisma.ForestCtpRespaldoUncheckedCreateInput;
    /* Tope de manuales: contar y crear bajo el mismo candado por negocio, si no
       dos clics a la vez leen 19 y quedan 21. */
    const fila =
      tipo === "manual"
        ? await prisma.$transaction(async (tx) => {
            await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`ctp-respaldo-manual:${tenantId}`}))`;
            await exigirTope(tx);
            return tx.forestCtpRespaldo.create({ data, select: CABECERA });
          })
        : await prisma.forestCtpRespaldo.create({ data, select: CABECERA });
    invalidate(claveLista(tenantId));
    const resumen = resumenDe(fila);
    auditCtp({
      tenantId,
      action: "ctp_respaldo_crear",
      entity: "ForestCtpRespaldo",
      entityId: fila.id,
      detail: `RESPALDO DEL LIBRO CTP «${ETIQUETA_TIPO_RESPALDO[tipo]}»: ${resumen.filas} filas, ${Math.round(datos.length / 1024)} kB${resumen.nota ? ` · ${resumen.nota}` : ""}.`,
      user: usuario,
    });
    return resumen;
  },

  /**
   * El respaldo que se toma solo ANTES de vaciar, anular un día o cerrar el
   * mes. Si falla, la acción NO corre: tira `RespaldoError("RESPALDO_PREVIO")`
   * con un mensaje para el operador.
   */
  async crearPrevio(tenantId: string, tipo: Extract<TipoRespaldo, `antes_${string}`>, user: string): Promise<RespaldoResumen | null> {
    try {
      return await ForestCtpRespaldoFotoDB.crear(tenantId, tipo, user);
    } catch (e) {
      logger.error("[forest-ctp-respaldo] falló el respaldo previo: la acción no corre", { error: String(e), tenantId, tipo });
      throw new RespaldoError(
        "RESPALDO_PREVIO",
        `No se pudo guardar el respaldo del libro antes de ${ETIQUETA_TIPO_RESPALDO[tipo].replace(/^Antes de /, "")}: no se hizo nada. Vuelve a intentarlo en un momento.`,
      );
    }
  },
};
