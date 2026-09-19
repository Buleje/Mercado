import "server-only";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/lib/generated/prisma/client";
import { invalidateByPrefix } from "@/lib/cache";
import { auditCtp } from "@/lib/forestal/ctp-audit";
import {
  codigoSospechoso,
  normalizarCodigoContrato,
  tipoDesdeCodigo,
  type BalanceContrato,
  type Contrato,
  type ContratoInput,
  type EstadoContrato,
  type TipoContrato,
} from "@/lib/forestal/contratos";

/**
 * ForestContratoDB — el permiso como eje del movimiento (ADR-421).
 *
 * `tenantId` 1er parámetro, escritura auditada, caché invalidada tras el write.
 *
 * ## El balance se calcula, no se guarda
 *
 * `balance()` agrega seis tablas al vuelo. Materializar el saldo obligaría a
 * mantenerlo sincronizado desde siete escrituras distintas; en este repo cada
 * columna derivada (el saldo del adelanto, los cuadres del libro) terminó
 * desincronizándose alguna vez. Una query por contrato es barata y no miente.
 */

const CACHE_PREFIX = "forest-contrato";

type ContratoRow = Prisma.ForestContratoGetPayload<Record<string, never>>;

const txt = (v: string | null | undefined): string | null => {
  const t = (v ?? "").trim();
  return t ? t : null;
};
const iso = (d: Date | null): string | null => (d ? d.toISOString() : null);
const num = (v: Prisma.Decimal | null): number | null => (v == null ? null : Number(v));

function aContrato(r: ContratoRow): Contrato {
  return {
    id: r.id,
    codigo: r.codigo,
    codigoNorm: r.codigoNorm,
    alias: r.alias,
    titularNombre: r.titularNombre,
    titularId: r.titularId,
    titularDoc: r.titularDoc,
    titularDocTipo: r.titularDocTipo,
    resolucionNumero: r.resolucionNumero,
    resolucionFecha: iso(r.resolucionFecha),
    tipo: (r.tipo as TipoContrato) ?? null,
    arffs: r.arffs,
    region: r.region,
    provincia: r.provincia,
    distrito: r.distrito,
    areaHa: num(r.areaHa),
    vigenciaDesde: iso(r.vigenciaDesde),
    vigenciaHasta: iso(r.vigenciaHasta),
    estado: (r.estado as EstadoContrato) ?? "vigente",
    planId: r.planId,
    notas: r.notas,
    isActive: r.isActive,
    createdAt: r.createdAt.toISOString(),
  };
}

/** `YYYY-MM-DD` → Date UTC. Las fechas del módulo forestal son date-only: sin
 *  esto se corren un día en Lima (el off-by-one que ya documenta el libro). */
function fechaUtc(v: string | null | undefined): Date | null {
  const t = (v ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}/.test(t)) return null;
  return new Date(`${t.slice(0, 10)}T00:00:00.000Z`);
}

export class ForestContratoDB {
  static async list(tenantId: string, opts?: { incluirInactivos?: boolean }): Promise<Contrato[]> {
    if (!tenantId) throw new Error("tenantId is required");
    const rows = await prisma.forestContrato.findMany({
      where: {
        tenantId,
        deletedAt: null,
        ...(opts?.incluirInactivos ? {} : { isActive: true }),
      },
      orderBy: [{ estado: "asc" }, { codigo: "asc" }],
    });
    return rows.map(aContrato);
  }

  static async get(tenantId: string, id: string): Promise<Contrato | null> {
    if (!tenantId) throw new Error("tenantId is required");
    const r = await prisma.forestContrato.findFirst({ where: { tenantId, id, deletedAt: null } });
    return r ? aContrato(r) : null;
  }

  /** Por el código del papel — es como llega desde una guía o un ingreso. */
  static async porCodigo(tenantId: string, codigo: string): Promise<Contrato | null> {
    if (!tenantId) throw new Error("tenantId is required");
    const codigoNorm = normalizarCodigoContrato(codigo);
    if (!codigoNorm) return null;
    const r = await prisma.forestContrato.findFirst({ where: { tenantId, codigoNorm, deletedAt: null } });
    return r ? aContrato(r) : null;
  }

  /**
   * El id del contrato que corresponde a un código, o `null`.
   *
   * Liviano a propósito (sólo el id): lo llaman las altas de madera, producción
   * y lotes para imputar SOLAS lo que ya trae el código escrito en el papel. Si
   * el permiso todavía no es contrato, devuelve `null` y el registro queda sin
   * imputar —que es la verdad— en vez de inventar un vínculo.
   */
  static async idPorCodigo(tenantId: string, codigo: string | null | undefined): Promise<string | null> {
    if (!tenantId) throw new Error("tenantId is required");
    const codigoNorm = normalizarCodigoContrato(codigo ?? "");
    if (!codigoNorm) return null;
    const r = await prisma.forestContrato.findFirst({
      where: { tenantId, codigoNorm, deletedAt: null },
      select: { id: true },
    });
    return r?.id ?? null;
  }

  static async crear(tenantId: string, input: ContratoInput, actor: string): Promise<Contrato> {
    if (!tenantId) throw new Error("tenantId is required");
    const codigo = (input.codigo ?? "").trim();
    if (!codigo) throw new Error("codigo is required");
    const row = await prisma.forestContrato.create({
      data: {
        tenantId,
        codigo,
        codigoNorm: normalizarCodigoContrato(codigo),
        alias: txt(input.alias),
        titularNombre: (input.titularNombre ?? "").trim() || "—",
        titularId: txt(input.titularId),
        titularDoc: txt(input.titularDoc),
        titularDocTipo: txt(input.titularDocTipo),
        resolucionNumero: txt(input.resolucionNumero),
        resolucionFecha: fechaUtc(input.resolucionFecha),
        tipo: input.tipo ?? tipoDesdeCodigo(codigo),
        arffs: txt(input.arffs),
        region: txt(input.region),
        provincia: txt(input.provincia),
        distrito: txt(input.distrito),
        areaHa: input.areaHa == null ? null : new Prisma.Decimal(input.areaHa),
        vigenciaDesde: fechaUtc(input.vigenciaDesde),
        vigenciaHasta: fechaUtc(input.vigenciaHasta),
        estado: input.estado ?? "vigente",
        planId: txt(input.planId),
        notas: txt(input.notas),
        createdBy: actor,
      },
    });
    await invalidateByPrefix(`${CACHE_PREFIX}:${tenantId}`);
    auditCtp({
      tenantId,
      action: "ctp_contrato_create",
      entity: "ForestContrato",
      entityId: row.id,
      detail: `Contrato ${row.codigo} — titular ${row.titularNombre}`,
      user: actor,
    });
    return aContrato(row);
  }

  static async actualizar(
    tenantId: string,
    id: string,
    input: Partial<ContratoInput>,
    actor: string,
  ): Promise<Contrato | null> {
    if (!tenantId) throw new Error("tenantId is required");
    const existe = await prisma.forestContrato.findFirst({ where: { tenantId, id, deletedAt: null } });
    if (!existe) return null;
    const codigo = input.codigo?.trim();
    const row = await prisma.forestContrato.update({
      where: { id },
      data: {
        ...(codigo ? { codigo, codigoNorm: normalizarCodigoContrato(codigo) } : {}),
        ...(input.alias !== undefined ? { alias: txt(input.alias) } : {}),
        ...(input.titularNombre !== undefined ? { titularNombre: input.titularNombre.trim() || "—" } : {}),
        ...(input.titularId !== undefined ? { titularId: txt(input.titularId) } : {}),
        ...(input.titularDoc !== undefined ? { titularDoc: txt(input.titularDoc) } : {}),
        ...(input.titularDocTipo !== undefined ? { titularDocTipo: txt(input.titularDocTipo) } : {}),
        ...(input.resolucionNumero !== undefined ? { resolucionNumero: txt(input.resolucionNumero) } : {}),
        ...(input.resolucionFecha !== undefined ? { resolucionFecha: fechaUtc(input.resolucionFecha) } : {}),
        ...(input.tipo !== undefined ? { tipo: input.tipo } : {}),
        ...(input.arffs !== undefined ? { arffs: txt(input.arffs) } : {}),
        ...(input.region !== undefined ? { region: txt(input.region) } : {}),
        ...(input.provincia !== undefined ? { provincia: txt(input.provincia) } : {}),
        ...(input.distrito !== undefined ? { distrito: txt(input.distrito) } : {}),
        ...(input.areaHa !== undefined
          ? { areaHa: input.areaHa == null ? null : new Prisma.Decimal(input.areaHa) }
          : {}),
        ...(input.vigenciaDesde !== undefined ? { vigenciaDesde: fechaUtc(input.vigenciaDesde) } : {}),
        ...(input.vigenciaHasta !== undefined ? { vigenciaHasta: fechaUtc(input.vigenciaHasta) } : {}),
        ...(input.estado !== undefined ? { estado: input.estado } : {}),
        ...(input.planId !== undefined ? { planId: txt(input.planId) } : {}),
        ...(input.notas !== undefined ? { notas: txt(input.notas) } : {}),
      },
    });
    await invalidateByPrefix(`${CACHE_PREFIX}:${tenantId}`);
    auditCtp({
      tenantId,
      action: "ctp_contrato_update",
      entity: "ForestContrato",
      entityId: row.id,
      detail: `Contrato ${row.codigo}`,
      user: actor,
    });
    return aContrato(row);
  }

  /**
   * Los códigos que ya están escritos en el libro y todavía no son contrato.
   *
   * No crea nada: devuelve el candidato con lo que se pudo deducir (titular más
   * frecuente, tipo, cuántas filas lo usan) para que la pantalla lo muestre y
   * Brandon confirme. Sembrar a ciegas convertiría un typo —en los datos ya hay
   * un `99-XXX/NO-EXISTE-2026-999`— en un contrato con su propio balance.
   */
  static async candidatos(tenantId: string) {
    if (!tenantId) throw new Error("tenantId is required");
    const [ingresos, produccion, lotes, yaCreados] = await Promise.all([
      prisma.woodEntry.groupBy({
        by: ["originCode"],
        where: { tenantId, deletedAt: null, contratoId: null, originCode: { not: null } },
        _count: { _all: true },
        _sum: { volumeM3: true },
      }),
      prisma.forestCtpEntry.groupBy({
        by: ["originCode"],
        where: { tenantId, deletedAt: null, contratoId: null, originCode: { not: null } },
        _count: { _all: true },
      }),
      prisma.forestLoteAserrio.groupBy({
        by: ["permiso"],
        where: { tenantId, deletedAt: null, contratoId: null, permiso: { not: null } },
        _count: { _all: true },
      }),
      prisma.forestContrato.findMany({ where: { tenantId, deletedAt: null }, select: { codigoNorm: true } }),
    ]);

    const existentes = new Set(yaCreados.map((c) => c.codigoNorm));
    const mapa = new Map<
      string,
      { codigo: string; codigoNorm: string; filas: number; m3: number; sospechoso: boolean; tipo: TipoContrato }
    >();

    const sumar = (codigoCrudo: string | null, filas: number, m3: number) => {
      const codigo = (codigoCrudo ?? "").trim();
      const codigoNorm = normalizarCodigoContrato(codigo);
      if (!codigoNorm || existentes.has(codigoNorm)) return;
      const prev = mapa.get(codigoNorm);
      if (prev) {
        prev.filas += filas;
        prev.m3 += m3;
        return;
      }
      mapa.set(codigoNorm, {
        codigo,
        codigoNorm,
        filas,
        m3,
        sospechoso: codigoSospechoso(codigo),
        tipo: tipoDesdeCodigo(codigo),
      });
    };

    for (const g of ingresos) sumar(g.originCode, g._count._all, Number(g._sum.volumeM3 ?? 0));
    for (const g of produccion) sumar(g.originCode, g._count._all, 0);
    for (const g of lotes) sumar(g.permiso, g._count._all, 0);

    // El titular que más veces aparece con ese código: es el dueño del permiso
    // en los papeles que ya se cargaron. Si no hay ninguno, el alta lo pide.
    const conTitular = await Promise.all(
      [...mapa.values()].map(async (c) => {
        const prov = await prisma.woodEntry.groupBy({
          by: ["providerName"],
          where: { tenantId, deletedAt: null, originCode: c.codigo },
          _count: { _all: true },
          orderBy: { _count: { providerName: "desc" } },
          take: 1,
        });
        return { ...c, titularSugerido: prov[0]?.providerName ?? null };
      }),
    );
    return conTitular.sort((a, b) => b.filas - a.filas);
  }

  /**
   * Ata al contrato todo lo que ya trae su código escrito.
   *
   * Sólo toca filas con `contratoId` NULL: correr esto dos veces no reasigna
   * nada, y una fila que alguien movió a mano a otro contrato no se pisa.
   */
  static async vincularPorCodigo(tenantId: string, contratoId: string, actor: string) {
    if (!tenantId) throw new Error("tenantId is required");
    const c = await prisma.forestContrato.findFirst({ where: { tenantId, id: contratoId, deletedAt: null } });
    if (!c) return null;
    // `equals` con el código CRUDO y con el normalizado: en los datos conviven
    // las dos escrituras y una sola de las dos dejaría filas afuera.
    const codigos = [...new Set([c.codigo, c.codigoNorm, c.codigo.trim()])];
    const [madera, produccion, lotes] = await prisma.$transaction([
      prisma.woodEntry.updateMany({
        where: { tenantId, contratoId: null, originCode: { in: codigos } },
        data: { contratoId },
      }),
      prisma.forestCtpEntry.updateMany({
        where: { tenantId, contratoId: null, originCode: { in: codigos } },
        data: { contratoId },
      }),
      prisma.forestLoteAserrio.updateMany({
        where: { tenantId, contratoId: null, permiso: { in: codigos } },
        data: { contratoId },
      }),
    ]);
    await invalidateByPrefix(`${CACHE_PREFIX}:${tenantId}`);
    auditCtp({
      tenantId,
      action: "ctp_contrato_vincular",
      entity: "ForestContrato",
      entityId: c.id,
      detail: `${c.codigo}: ${madera.count} ingresos, ${produccion.count} corridas, ${lotes.count} lotes`,
      user: actor,
    });
    return { madera: madera.count, produccion: produccion.count, lotes: lotes.count };
  }

  /**
   * El balance del contrato: seis agregaciones, cero columnas derivadas.
   *
   * `rango` acota por fecha cuando la pantalla lo pide; sin él, es la vida
   * entera del permiso — que es como se mira un contrato.
   */
  static async balance(
    tenantId: string,
    contratoId: string,
    rango?: { desde?: Date; hasta?: Date },
  ): Promise<BalanceContrato> {
    if (!tenantId) throw new Error("tenantId is required");
    const enRango = (campo: string) =>
      rango?.desde || rango?.hasta
        ? { [campo]: { ...(rango.desde ? { gte: rango.desde } : {}), ...(rango.hasta ? { lte: rango.hasta } : {}) } }
        : {};

    const [madera, maderaSinPrecio, produccion, gastos, fletes, adelantos, cargos, abonos] = await Promise.all([
      prisma.woodEntry.aggregate({
        where: { tenantId, contratoId, deletedAt: null, status: { notIn: ["rechazado", "anulado"] }, ...enRango("entryDate") },
        _count: { _all: true },
        _sum: { volumeM3: true, costoTotal: true },
      }),
      prisma.woodEntry.count({
        where: { tenantId, contratoId, deletedAt: null, status: { notIn: ["rechazado", "anulado"] }, costoTotal: null, ...enRango("entryDate") },
      }),
      prisma.forestCtpEntry.aggregate({
        where: { tenantId, contratoId, deletedAt: null, status: { not: "anulado" }, ...enRango("entryDate") },
        _count: { _all: true },
        // `quantity` viene en la unidad de la línea; el m³ sale de las que la
        // declaran en m³ — mezclar pt y kg en una suma daría un número que no
        // significa nada.
        _sum: { quantity: true },
      }),
      prisma.expense.aggregate({
        where: { tenantId, contratoId, ...enRango("date") },
        _count: { _all: true },
        _sum: { amount: true },
      }),
      prisma.forestFlete.aggregate({
        where: { tenantId, contratoId, deletedAt: null, ...enRango("fecha") },
        _count: { _all: true },
        _sum: { monto: true },
      }),
      prisma.adelanto.aggregate({
        where: { tenantId, contratoId, ...enRango("fechaAdelanto") },
        _count: { _all: true },
        _sum: { montoAdelantado: true, saldoPendiente: true },
      }),
      prisma.forestCuentaMov.aggregate({
        where: { tenantId, contratoId, deletedAt: null, tipo: "cargo", ...enRango("fecha") },
        _count: { _all: true },
        _sum: { monto: true },
      }),
      prisma.forestCuentaMov.aggregate({
        where: { tenantId, contratoId, deletedAt: null, tipo: "abono", ...enRango("fecha") },
        _count: { _all: true },
        _sum: { monto: true },
      }),
    ]);

    const n = (v: Prisma.Decimal | null | undefined) => Number(v ?? 0);
    return {
      contratoId,
      madera: {
        documentos: madera._count._all,
        monto: n(madera._sum.costoTotal),
        m3: n(madera._sum.volumeM3),
        sinValorizar: maderaSinPrecio,
      },
      produccion: { documentos: produccion._count._all, monto: 0, m3: n(produccion._sum.quantity) },
      gastos: { documentos: gastos._count._all, monto: n(gastos._sum.amount) },
      fletes: { documentos: fletes._count._all, monto: n(fletes._sum.monto) },
      adelantos: { documentos: adelantos._count._all, monto: n(adelantos._sum.montoAdelantado) },
      adelantosSaldo: n(adelantos._sum.saldoPendiente),
      cuentaCargos: { documentos: cargos._count._all, monto: n(cargos._sum.monto) },
      cuentaAbonos: { documentos: abonos._count._all, monto: n(abonos._sum.monto) },
    };
  }
}
