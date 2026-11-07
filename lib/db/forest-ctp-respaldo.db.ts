import "server-only";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/lib/generated/prisma/client";
import { getOrSet, invalidate } from "@/lib/cache";
import { logger } from "@/lib/logger";
import { auditCtp, auditCtpEsperando } from "@/lib/forestal/ctp-audit";
import { esChoqueDeLocks } from "@/lib/forestal/choque-de-locks";
import { mesCerradoParaVaciar } from "@/lib/forestal/ctp-purga-plan";
import type { CtpCierrePeriodo } from "@/lib/forestal/ctp-cierre-types";
import { ForestCtpCierreDB } from "@/lib/db/forest-ctp-cierre.db";
import { ForestCuentaDB } from "@/lib/db/forest-cuenta.db";
import { invalidarTodo } from "@/lib/db/forest-ctp-purga.db";
import { saldosDeCorridas } from "@/lib/db/forest-ctp-saldo-corrida";
import {
  CABECERA,
  ForestCtpRespaldoFotoDB,
  MODELO,
  RespaldoError,
  claveLista,
  delegado,
  fotoDelLibro,
  leerLibro,
  resumenDe,
  type Db,
} from "@/lib/db/forest-ctp-respaldo-foto.db";
import {
  ETIQUETA_TABLA_RESPALDO,
  TABLAS_RESPALDO,
  TOPES_RESPALDO,
  type ComparacionRespaldo,
  type RespaldoResumen,
  type RespaldosListado,
  type ResultadoRecuperar,
  type TablaRespaldo,
  type TipoRespaldo,
} from "@/lib/forestal/ctp-respaldo-tipos";
import { descomprimir, hidratarValor, huellaDe, type ContenidoRespaldo, type FilaSerial, type ValorSerial } from "@/lib/forestal/ctp-respaldo-serial";
import { analizar, totalesDe, txt, type ColumnaHoy, type ContextoRespaldo } from "@/lib/forestal/ctp-respaldo-diff";
import { conteoDelPlan, planificarRecuperacion, type PlanRecuperacion } from "@/lib/forestal/ctp-respaldo-plan";

export { RespaldoError, ESTADO_HTTP_RESPALDO } from "@/lib/db/forest-ctp-respaldo-foto.db";

/**
 * lib/db/forest-ctp-respaldo.db.ts — Respaldos del Libro CTP (ADR-530).
 *
 * Lista, compara, RECUPERA lo borrado sin pisar, descarga y poda. La foto vive
 * en `forest-ctp-respaldo-foto.db.ts`; la lógica de comparar y del plan, sin
 * base, en `lib/forestal/ctp-respaldo-{diff,plan}.ts`.
 *
 * Recuperar nunca pisa ni reabre un mes: inserta con el id original lo que hoy
 * no existe y deshace bajas, todo o nada, en UNA transacción Serializable bajo
 * el candado de cierres. «Volver todo atrás» no existe a propósito.
 */

const DIA_MS = 86_400_000;
const TANDA_INSERT = 1_000;
const TOLERANCIA_SALDO = 0.001;

const hidr = { decimal: (s: string) => new Prisma.Decimal(s) };

interface ColumnasHoy {
  porTabla: Partial<Record<TablaRespaldo, ColumnaHoy[]>>;
  json: Partial<Record<TablaRespaldo, Set<string>>>;
}

/** Columnas de hoy: las que conoce el cliente, cuáles son obligatorias sin default y cuáles son Json. */
async function columnasHoy(db: Db): Promise<ColumnasHoy> {
  const filas = await db.$queryRaw<{ table_name: string; column_name: string; is_nullable: string; column_default: string | null; data_type: string }[]>`
    SELECT table_name, column_name, is_nullable, column_default, data_type
      FROM information_schema.columns
     WHERE table_schema = current_schema() AND table_name = ANY(${[...TABLAS_RESPALDO]})`;
  const out: ColumnasHoy = { porTabla: {}, json: {} };
  for (const t of TABLAS_RESPALDO) {
    const delCliente = new Set(MODELO[t].columnas);
    const deLaTabla = filas.filter((f) => f.table_name === t && delCliente.has(f.column_name));
    out.porTabla[t] = deLaTabla.map((f) => ({
      nombre: f.column_name,
      /* `updatedAt` lo llena Prisma; `id` siempre viene del respaldo. */
      obligatoria: f.is_nullable === "NO" && f.column_default == null && f.column_name !== "updatedAt" && f.column_name !== "id",
    }));
    out.json[t] = new Set(deLaTabla.filter((f) => f.data_type === "json" || f.data_type === "jsonb").map((f) => f.column_name));
  }
  return out;
}

const idsDe = (c: ContenidoRespaldo, pares: readonly (readonly [TablaRespaldo, string])[]) => [
  ...new Set(pares.flatMap(([t, col]) => (c.tablas[t] ?? []).map((f) => txt(f[col])).filter((x): x is string => !!x))),
];

/** Lo que el diff necesita de hoy fuera del libro: meses cerrados, otros módulos y columnas. */
async function contexto(db: Db, tenantId: string, c: ContenidoRespaldo, cierres: CtpCierrePeriodo[], cols: ColumnasHoy): Promise<ContextoRespaldo> {
  const proveedores = idsDe(c, [["WoodEntry", "supplierId"]]);
  const contratos = idsDe(c, [
    ["WoodEntry", "contratoId"],
    ["ForestLoteAserrio", "contratoId"],
    ["ForestCtpEntry", "contratoId"],
    ["WoodEntryTroza", "contratoId"],
    ["ForestCuentaMov", "contratoId"],
  ]);
  const partes = idsDe(c, [["ForestProdLote", "titularId"]]);
  const campos = idsDe(c, [["CampoPersonalizadoValor", "campoId"]]);
  const set = (xs: { id: string }[]) => new Set(xs.map((x) => x.id));
  const sel = { id: true } as const;
  const p = proveedores.length ? await db.supplier.findMany({ where: { tenantId, id: { in: proveedores } }, select: sel }) : [];
  const k = contratos.length ? await db.forestContrato.findMany({ where: { tenantId, id: { in: contratos } }, select: sel }) : [];
  const t = partes.length ? await db.forestParty.findMany({ where: { tenantId, id: { in: partes } }, select: sel }) : [];
  const cp = campos.length ? await db.campoPersonalizado.findMany({ where: { tenantId, id: { in: campos } }, select: sel }) : [];
  return {
    mesCerrado: (fecha) => mesCerradoParaVaciar(cierres, fecha),
    externos: { proveedores: set(p), contratos: set(k), partes: set(t), campos: set(cp) },
    columnasHoy: cols.porTabla,
    columnasRespaldo: c.columnas,
  };
}

/** Una fila del respaldo lista para `createMany`: solo columnas de hoy, tipos exactos, el tenant de la sesión. */
function paraInsertar(t: TablaRespaldo, f: FilaSerial, tenantId: string, cols: ColumnasHoy): Record<string, unknown> {
  const deHoy = new Set((cols.porTabla[t] ?? []).map((c) => c.nombre));
  const json = cols.json[t] ?? new Set<string>();
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(f)) {
    if (!deHoy.has(k)) continue;
    out[k] = v === null && json.has(k) ? Prisma.DbNull : hidratarValor(v, hidr);
  }
  out.tenantId = tenantId;
  return out;
}

async function leerRespaldo(tenantId: string, id: string) {
  const fila = await prisma.forestCtpRespaldo.findFirst({ where: { id, tenantId }, select: { ...CABECERA, datos: true } });
  if (!fila) throw new RespaldoError("NO_EXISTE", "Ese respaldo ya no existe.");
  return fila;
}

const MENSAJE_LIBRO_CAMBIO = "El libro cambió desde que lo comparaste: no se recuperó nada. Vuelve a comparar.";

/** P2002 (único repetido): el plan ya miró los únicos que conoce; otro que no previó no es «el libro cambió». */
const esUnicoRepetido = (e: unknown) => (e as { code?: unknown } | null)?.code === "P2002";

function noEntra(t: TablaRespaldo, cuantas?: number): RespaldoError {
  const que = ETIQUETA_TABLA_RESPALDO[t].toLowerCase();
  return new RespaldoError(
    "NO_SE_PUEDE",
    `No se recuperó nada: ${cuantas ? `${cuantas} ${cuantas === 1 ? "fila" : "filas"} de ${que}` : `una fila de ${que}`} chocan con algo que hoy ya está en el libro (un código o una pareja que no se puede repetir). Recupera sin ese grupo o avisa a soporte.`,
  );
}

/** Corre una escritura de la tabla `t` y traduce el único repetido a NO_SE_PUEDE. */
async function enTabla<R>(t: TablaRespaldo, fn: () => Promise<R>): Promise<R> {
  try {
    return await fn();
  } catch (e) {
    if (esUnicoRepetido(e)) {
      logger.warn("[forest-ctp-respaldo] único repetido al recuperar", { tabla: t, error: String(e) });
      throw noEntra(t);
    }
    throw e;
  }
}

/** Ejecuta el plan dentro de la transacción. Cualquier fila que no entre como se planeó deshace todo. */
async function ejecutarPlan(tx: Prisma.TransactionClient, tenantId: string, plan: PlanRecuperacion, cols: ColumnasHoy): Promise<void> {
  /* T1: el candado va sobre las TROZAS, con ORDER BY id (dos tablets no se abrazan). */
  const trozas = [...new Set(plan.rehooks.map((r) => r.trozaId))].sort();
  if (trozas.length > 0) {
    await tx.$queryRaw`SELECT id FROM "WoodEntryTroza" WHERE "tenantId" = ${tenantId} AND id = ANY(${trozas}) ORDER BY id FOR UPDATE`;
  }
  for (const t of TABLAS_RESPALDO) {
    const filas = plan.inserts[t] ?? [];
    for (let i = 0; i < filas.length; i += TANDA_INSERT) {
      const data = filas.slice(i, i + TANDA_INSERT).map((f) => paraInsertar(t, f, tenantId, cols));
      const r = await enTabla(t, () => delegado(tx, t).createMany({ data, skipDuplicates: true }));
      /* La huella ya probó que el libro es el comparado: si entran menos, las
         saltó un único que el plan no previó (y repetir daría lo mismo). */
      if (r.count !== data.length) throw noEntra(t, data.length - r.count);
    }
  }
  for (const r of plan.restores) {
    const deHoy = new Set((cols.porTabla[r.tabla] ?? []).map((c) => c.nombre));
    const data: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(r.datos)) if (deHoy.has(k)) data[k] = hidratarValor(v, hidr);
    const deBaja = r.tabla === "ForestCtpEntry" ? { OR: [{ deletedAt: { not: null } }, { status: "anulado" }] } : { deletedAt: { not: null } };
    const n = await enTabla(r.tabla, () => delegado(tx, r.tabla).updateMany({ where: { tenantId, id: r.id, ...deBaja }, data }));
    if (n.count !== 1) throw new RespaldoError("LIBRO_CAMBIO", MENSAJE_LIBRO_CAMBIO);
  }
  for (const rh of plan.rehooks) {
    const fecha = rh.campo === "consumidaEnId" ? "fechaConsumo" : "fechaDespacho";
    const otro = rh.campo === "consumidaEnId" ? "despachadaEnId" : "consumidaEnId";
    const n = await tx.woodEntryTroza.updateMany({
      where: { tenantId, id: rh.trozaId, [rh.campo]: rh.actual, [otro]: rh.otroActual },
      data: { [rh.campo]: rh.entryId, [fecha]: hidratarValor(rh.fecha as ValorSerial, hidr) as Date | null },
    });
    if (n.count !== 1) throw new RespaldoError("LIBRO_CAMBIO", MENSAJE_LIBRO_CAMBIO);
  }
  /* Ninguna corrida puede quedar con más salido que producido. */
  const saldos = await saldosDeCorridas(tx, tenantId, plan.corridasASaldar);
  for (const s of saldos.values()) {
    const real = s.producido - s.despachado - s.reprocesado;
    if (real < -TOLERANCIA_SALDO) {
      throw new RespaldoError(
        "NO_SE_PUEDE",
        `No se recuperó nada: la corrida${s.lineNo != null ? ` N.° ${s.lineNo}` : ""} quedaría con más salida (${(s.despachado + s.reprocesado).toFixed(2)}) que producción (${s.producido.toFixed(2)}). Desmarca la salida o el reproceso que la usa.`,
      );
    }
  }
}

export const ForestCtpRespaldoDB = {
  crear: ForestCtpRespaldoFotoDB.crear,
  crearPrevio: ForestCtpRespaldoFotoDB.crearPrevio,

  /** Lista sin `datos` (no descomprime nada). Caché `forest-ctp-respaldo:<tenantId>`. */
  async listar(tenantId: string): Promise<RespaldosListado> {
    if (!tenantId) throw new Error("tenantId is required");
    const respaldos = await getOrSet<RespaldoResumen[]>(claveLista(tenantId), 300, async () =>
      (
        await prisma.forestCtpRespaldo.findMany({ where: { tenantId }, orderBy: { createdAt: "desc" }, select: CABECERA })
      ).map(resumenDe),
    );
    return { respaldos, manualesUsados: respaldos.filter((r) => r.tipo === "manual").length, topes: TOPES_RESPALDO };
  },

  /** Qué cambió desde la foto, agrupado; `huellaHoy` se devuelve como `esperado` al recuperar. */
  async comparar(tenantId: string, id: string): Promise<ComparacionRespaldo> {
    if (!tenantId) throw new Error("tenantId is required");
    const fila = await leerRespaldo(tenantId, id);
    const contenido = descomprimir(fila.datos);
    const hoy = await fotoDelLibro(tenantId);
    const [cierres, cols] = await Promise.all([ForestCtpCierreDB.listEn(tenantId, prisma), columnasHoy(prisma)]);
    const ctx = await contexto(prisma, tenantId, contenido, cierres, cols);
    const a = analizar(contenido.tablas, hoy, ctx);
    return { respaldo: resumenDe(fila), huellaHoy: huellaDe(hoy), totales: totalesDe(a.diff), grupos: a.grupos };
  },

  /**
   * Trae de vuelta lo marcado. `esperado` = `huellaHoy` de la comparación que
   * vio el operador: si el libro cambió, 409 LIBRO_CAMBIO y no se toca nada.
   */
  async recuperar(
    tenantId: string,
    id: string,
    seleccion: readonly string[] | "todo_lo_borrado",
    user: string,
    esperado: string,
  ): Promise<ResultadoRecuperar> {
    if (!tenantId) throw new Error("tenantId is required");
    const usuario = user?.trim() || "unknown";
    const fila = await leerRespaldo(tenantId, id);
    const contenido = descomprimir(fila.datos);
    /* Fuera de la transacción: que la fila de cierres exista para que su FOR SHARE bloquee algo. */
    await ForestCtpCierreDB.asegurarFila(tenantId);
    let plan: PlanRecuperacion;
    try {
      plan = await prisma.$transaction(
        async (tx) => {
          const cierres = await ForestCtpCierreDB.listBajoCandado(tenantId, tx);
          if (cierres == null) {
            throw new RespaldoError("LIBRO_CAMBIO", "Se está cerrando o reabriendo un mes en este momento: no se recuperó nada. Vuelve a intentarlo en unos segundos.");
          }
          const hoy = await leerLibro(tx, tenantId);
          if (huellaDe(hoy) !== esperado) throw new RespaldoError("LIBRO_CAMBIO", MENSAJE_LIBRO_CAMBIO);
          const cols = await columnasHoy(tx);
          const ctx = await contexto(tx, tenantId, contenido, cierres, cols);
          const p = planificarRecuperacion(contenido.tablas, hoy, ctx, seleccion);
          if (p.cancelar) throw new RespaldoError("NO_SE_PUEDE", p.cancelar);
          await ejecutarPlan(tx, tenantId, p, cols);
          return p;
        },
        { isolationLevel: "Serializable", timeout: 60_000, maxWait: 10_000 },
      );
    } catch (e) {
      if (esChoqueDeLocks(e)) {
        logger.warn("[forest-ctp-respaldo] otra transacción se cruzó con recuperar: no se tocó nada", { error: String(e), tenantId });
        throw new RespaldoError("LIBRO_CAMBIO", "Otra persona movía el libro al mismo tiempo: no se recuperó nada. Vuelve a comparar.");
      }
      throw e;
    }

    const recuperadas = conteoDelPlan(plan);
    const total = Object.values(recuperadas).reduce((s, n) => s + (n ?? 0), 0);
    if (total > 0 || plan.rehooks.length > 0) {
      invalidarTodo(tenantId);
      if (recuperadas.ForestCuentaMov) ForestCuentaDB.invalidar(tenantId);
      const detalle = Object.entries(recuperadas)
        .map(([t, n]) => `${n} ${ETIQUETA_TABLA_RESPALDO[t as TablaRespaldo].toLowerCase()}`)
        .join(", ");
      try {
        await auditCtpEsperando({
          tenantId,
          action: "ctp_respaldo_recuperar",
          entity: "ForestCtpRespaldo",
          entityId: id,
          detail:
            `RECUPERÓ DEL RESPALDO del ${fila.createdAt.toISOString().slice(0, 16).replace("T", " ")} UTC: ${detalle || "sin filas nuevas"}` +
            `${plan.rehooks.length ? `; ${plan.rehooks.length} troza(s) vuelven a su corrida` : ""}` +
            `${plan.saltadas.length ? `; ${plan.saltadas.length} grupo(s) no se pudieron traer` : ""}.`,
          user: usuario,
        });
      } catch (e) {
        logger.error("[forest-ctp-respaldo] se recuperó pero el asiento de auditoría no quedó escrito", { error: String(e), tenantId });
      }
    }
    return { recuperadas, total, saltadas: plan.saltadas, avisos: plan.avisos };
  },

  /** El archivo `.json.gz` tal cual está guardado. Queda asentado quién lo bajó (Ley 29733). */
  async descargar(tenantId: string, id: string, user: string): Promise<{ datos: Uint8Array; nombre: string }> {
    if (!tenantId) throw new Error("tenantId is required");
    const fila = await leerRespaldo(tenantId, id);
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { slug: true } });
    const slug = (tenant?.slug ?? "negocio").toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 60);
    /* Fecha y hora de Lima (UTC−5, sin horario de verano). */
    const lima = new Date(fila.createdAt.getTime() - 5 * 3_600_000).toISOString();
    const nombre = `libro-ctp-${slug}-${lima.slice(0, 10)}-${lima.slice(11, 13)}${lima.slice(14, 16)}.json.gz`;
    /* Ley 29733: el libro entero sale de la tienda; sin el asiento no sale. */
    try {
      await auditCtpEsperando({
        tenantId,
        action: "ctp_respaldo_descargar",
        entity: "ForestCtpRespaldo",
        entityId: id,
        detail: `DESCARGÓ el respaldo del libro CTP ${nombre} (${fila.bytes} bytes).`,
        user: user?.trim() || "unknown",
      });
    } catch (e) {
      logger.error("[forest-ctp-respaldo] no se pudo asentar la descarga: no se entrega el archivo", { error: String(e), tenantId });
      throw new RespaldoError("SIN_AUDITORIA", "No se pudo anotar quién descarga el respaldo: no se entregó. Vuelve a intentarlo en un momento.");
    }
    return { datos: fila.datos, nombre };
  },

  /** Borra un respaldo guardado a mano (los automáticos los poda el sistema). */
  async eliminar(tenantId: string, id: string, user: string): Promise<void> {
    if (!tenantId) throw new Error("tenantId is required");
    const fila = await prisma.forestCtpRespaldo.findFirst({ where: { id, tenantId }, select: { tipo: true, createdAt: true } });
    if (!fila) throw new RespaldoError("NO_EXISTE", "Ese respaldo ya no existe.");
    if (fila.tipo !== "manual") throw new RespaldoError("SOLO_MANUALES", "Los respaldos automáticos se borran solos con el tiempo: solo se borran a mano los guardados a mano.");
    const n = await prisma.forestCtpRespaldo.deleteMany({ where: { id, tenantId, tipo: "manual" } });
    invalidate(claveLista(tenantId));
    if (n.count > 0) {
      auditCtp({
        tenantId,
        action: "ctp_respaldo_borrar",
        entity: "ForestCtpRespaldo",
        entityId: id,
        detail: `BORRÓ el respaldo guardado a mano del ${fila.createdAt.toISOString().slice(0, 16).replace("T", " ")} UTC.`,
        user: user?.trim() || "unknown",
      });
    }
  },

  /** Poda: 30 diarios · «antes de» 90 días (siempre quedan los 10 últimos) · manuales nunca. */
  async podar(tenantId: string, ahora: Date = new Date()): Promise<number> {
    if (!tenantId) throw new Error("tenantId is required");
    const todos = await prisma.forestCtpRespaldo.findMany({
      where: { tenantId, tipo: { not: "manual" } },
      orderBy: { createdAt: "desc" },
      select: { id: true, tipo: true, createdAt: true },
    });
    const limite = ahora.getTime() - TOPES_RESPALDO.diasAntesDe * DIA_MS;
    const borrar = [
      ...todos.filter((r) => r.tipo === "diario").slice(TOPES_RESPALDO.diarios),
      ...todos
        .filter((r) => r.tipo.startsWith("antes_"))
        .slice(TOPES_RESPALDO.minimoAntesDe)
        .filter((r) => r.createdAt.getTime() < limite),
    ].map((r) => r.id);
    if (borrar.length === 0) return 0;
    const n = await prisma.forestCtpRespaldo.deleteMany({ where: { tenantId, id: { in: borrar }, tipo: { not: "manual" } } });
    invalidate(claveLista(tenantId));
    return n.count;
  },

  /** Negocios con algo en el libro CTP (el cron no recorre los demás: tráfico de Supabase). */
  async tenantsConLibro(): Promise<string[]> {
    /* groupBy = GROUP BY en SQL (el `distinct` de Prisma trae todas las filas y filtra en memoria). */
    const [a, b] = await Promise.all([
      prisma.forestCtpEntry.groupBy({ by: ["tenantId"] }),
      prisma.woodEntry.groupBy({ by: ["tenantId"] }),
    ]);
    return [...new Set([...a, ...b].map((x) => x.tenantId))].sort();
  },

  /** El respaldo de la noche (si el libro cambió) + la poda. Nunca tira: devuelve qué pasó. */
  async diario(tenantId: string): Promise<{ guardado: boolean; podados: number; error?: string }> {
    try {
      const r = await ForestCtpRespaldoFotoDB.crear(tenantId, "diario" satisfies TipoRespaldo, "cron");
      const podados = await ForestCtpRespaldoDB.podar(tenantId);
      return { guardado: r != null, podados };
    } catch (e) {
      logger.error("[forest-ctp-respaldo] el respaldo de la noche falló", { error: String(e), tenantId });
      return { guardado: false, podados: 0, error: String(e).slice(0, 200) };
    }
  },
};
