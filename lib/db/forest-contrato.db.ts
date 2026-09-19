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
    /* Sin tipo guardado se deduce del código: el papel ya lo dice y mostrar
       «—» junto a un código que empieza con REG-PLT es un hueco inventado.
       Los contratos sembrados antes del catálogo de tipos reales (PER-FMC,
       concesiones CON-…) quedaron sin él. */
    tipo: (r.tipo as TipoContrato) ?? tipoDesdeCodigo(r.codigo),
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
   * El balance de TODOS los contratos de un tirón, para la tabla.
   *
   * Seis agregaciones agrupadas por contrato, no seis por cada contrato: con
   * una llamada a `balance()` por fila, seis contratos eran treinta y seis
   * consultas y la tabla cargaba en cascada.
   *
   * Las ventas necesitan el reparto por proporción (un despacho puede mezclar
   * permisos), que no se expresa con un `groupBy`: va en SQL parametrizado, con
   * `$1` para el tenant — nunca interpolado.
   */
  static async balances(tenantId: string): Promise<Map<string, BalanceContrato>> {
    if (!tenantId) throw new Error("tenantId is required");
    const vivos = { tenantId, contratoId: { not: null } } as const;
    const [madera, sinPrecio, produccion, gastos, fletes, adelantos, cuenta, ventasFilas] = await Promise.all([
      prisma.woodEntry.groupBy({
        by: ["contratoId"],
        where: { ...vivos, deletedAt: null, status: { notIn: ["rechazado", "anulado"] } },
        _count: { _all: true },
        _sum: { volumeM3: true, costoTotal: true },
      }),
      prisma.woodEntry.groupBy({
        by: ["contratoId"],
        where: { ...vivos, deletedAt: null, status: { notIn: ["rechazado", "anulado"] }, costoTotal: null },
        _count: { _all: true },
      }),
      prisma.forestCtpEntry.groupBy({
        by: ["contratoId"],
        where: { ...vivos, deletedAt: null, status: { not: "anulado" }, section: "produccion" },
        _count: { _all: true },
        _sum: { quantity: true },
      }),
      prisma.expense.groupBy({ by: ["contratoId"], where: vivos, _count: { _all: true }, _sum: { amount: true } }),
      prisma.forestFlete.groupBy({
        by: ["contratoId"],
        where: { ...vivos, deletedAt: null },
        _count: { _all: true },
        _sum: { monto: true },
      }),
      prisma.adelanto.groupBy({
        by: ["contratoId"],
        where: vivos,
        _count: { _all: true },
        _sum: { montoAdelantado: true, saldoPendiente: true },
      }),
      prisma.forestCuentaMov.groupBy({
        by: ["contratoId", "tipo"],
        where: { ...vivos, deletedAt: null },
        _count: { _all: true },
        _sum: { monto: true },
      }),
      prisma.$queryRaw<{ contratoId: string; monto: number | null; documentos: bigint; sin_precio: bigint }[]>`
        SELECT p."contratoId"                                            AS "contratoId",
               sum(d."valorVenta" * least(o.parte, 1))                   AS monto,
               count(DISTINCT d.id)                                      AS documentos,
               count(DISTINCT d.id) FILTER (WHERE d."valorVenta" IS NULL) AS sin_precio
          FROM (
            SELECT og."despachoEntryId", og."produccionEntryId",
                   sum(og.quantity)                            AS cantidad,
                   sum(og.quantity) / NULLIF(max(de.quantity), 0) AS parte
              FROM "ForestCtpDespachoOrigen" og
              JOIN "ForestCtpEntry" de ON de.id = og."despachoEntryId"
             WHERE og."tenantId" = ${tenantId}
             GROUP BY og."despachoEntryId", og."produccionEntryId"
          ) o
          JOIN "ForestCtpEntry" p ON p.id = o."produccionEntryId"
          JOIN "ForestCtpEntry" d ON d.id = o."despachoEntryId"
         WHERE p."tenantId" = ${tenantId} AND p."contratoId" IS NOT NULL
           AND d."deletedAt" IS NULL AND d.status <> 'anulado'
         GROUP BY p."contratoId"`,
    ]);

    const n = (v: Prisma.Decimal | null | undefined) => Number(v ?? 0);
    const salida = new Map<string, BalanceContrato>();
    const de = (id: string): BalanceContrato =>
      salida.get(id) ??
      salida
        .set(id, {
          contratoId: id,
          madera: { documentos: 0, monto: 0, m3: 0, sinValorizar: 0 },
          produccion: { documentos: 0, monto: 0, m3: 0 },
          ventas: { documentos: 0, monto: 0, sinValorizar: 0 },
          gastos: { documentos: 0, monto: 0 },
          fletes: { documentos: 0, monto: 0 },
          adelantos: { documentos: 0, monto: 0 },
          adelantosSaldo: 0,
          cuentaCargos: { documentos: 0, monto: 0 },
          cuentaAbonos: { documentos: 0, monto: 0 },
        })
        .get(id)!;

    for (const g of madera) {
      if (!g.contratoId) continue;
      const b = de(g.contratoId);
      b.madera = { documentos: g._count._all, monto: n(g._sum.costoTotal), m3: n(g._sum.volumeM3), sinValorizar: 0 };
    }
    for (const g of sinPrecio) if (g.contratoId) de(g.contratoId).madera.sinValorizar = g._count._all;
    for (const g of produccion)
      if (g.contratoId) de(g.contratoId).produccion = { documentos: g._count._all, monto: 0, m3: n(g._sum.quantity) };
    for (const g of gastos)
      if (g.contratoId) de(g.contratoId).gastos = { documentos: g._count._all, monto: n(g._sum.amount) };
    for (const g of fletes)
      if (g.contratoId) de(g.contratoId).fletes = { documentos: g._count._all, monto: n(g._sum.monto) };
    for (const g of adelantos) {
      if (!g.contratoId) continue;
      const b = de(g.contratoId);
      b.adelantos = { documentos: g._count._all, monto: n(g._sum.montoAdelantado) };
      b.adelantosSaldo = n(g._sum.saldoPendiente);
    }
    for (const g of cuenta) {
      if (!g.contratoId) continue;
      const b = de(g.contratoId);
      const bloque = { documentos: g._count._all, monto: n(g._sum.monto) };
      if (g.tipo === "cargo") b.cuentaCargos = bloque;
      else if (g.tipo === "abono") b.cuentaAbonos = bloque;
    }
    for (const v of ventasFilas) {
      if (!v.contratoId) continue;
      de(v.contratoId).ventas = {
        documentos: Number(v.documentos ?? 0),
        monto: Math.round(Number(v.monto ?? 0) * 100) / 100,
        sinValorizar: Number(v.sin_precio ?? 0),
      };
    }
    return salida;
  }

  /**
   * Lo vendido que le toca a este contrato.
   *
   * Un despacho no es «de un contrato»: es de la madera que consumió, y esa
   * madera puede venir de dos permisos. Por eso el `valorVenta` se reparte por
   * la PROPORCIÓN de cantidad que salió de producciones de este contrato —
   * sumarlo entero inventaría para uno la ganancia que pagó el otro.
   *
   * Un despacho sin `valorVenta` no aporta plata pero SÍ se cuenta en
   * `sinValorizar`: es la diferencia entre «no vendí» y «vendí y no cargué el
   * precio», que es justo lo que hace que un balance mienta sin avisar.
   */
  static async ventasAtribuidas(
    tenantId: string,
    contratoId: string,
    rango?: { desde?: Date; hasta?: Date },
  ): Promise<{ documentos: number; monto: number; sinValorizar: number }> {
    if (!tenantId) throw new Error("tenantId is required");
    /* Los tramos despacho←producción cuya producción es de este contrato. */
    const origenes = await prisma.forestCtpDespachoOrigen.findMany({
      where: { tenantId, produccion: { contratoId, deletedAt: null } },
      select: {
        quantity: true,
        despacho: {
          select: { id: true, valorVenta: true, quantity: true, deletedAt: true, status: true, entryDate: true },
        },
      },
    });

    const porDespacho = new Map<string, { delContrato: number; total: number; valor: number | null }>();
    for (const o of origenes) {
      const d = o.despacho;
      if (!d || d.deletedAt || d.status === "anulado") continue;
      if (rango?.desde && d.entryDate < rango.desde) continue;
      if (rango?.hasta && d.entryDate > rango.hasta) continue;
      const prev = porDespacho.get(d.id) ?? {
        delContrato: 0,
        total: Number(d.quantity ?? 0),
        valor: d.valorVenta == null ? null : Number(d.valorVenta),
      };
      prev.delContrato += Number(o.quantity ?? 0);
      porDespacho.set(d.id, prev);
    }

    let monto = 0;
    let sinValorizar = 0;
    for (const d of porDespacho.values()) {
      if (d.valor == null) {
        sinValorizar += 1;
        continue;
      }
      /* Sin cantidad total no hay proporción que calcular: se toma entero, que
         es lo que pasa cuando el despacho salió de un solo origen. */
      const parte = d.total > 0 ? Math.min(d.delContrato / d.total, 1) : 1;
      monto += d.valor * parte;
    }
    return { documentos: porDespacho.size, monto: Math.round(monto * 100) / 100, sinValorizar };
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
    const ventas = await ForestContratoDB.ventasAtribuidas(tenantId, contratoId, rango);
    return {
      contratoId,
      madera: {
        documentos: madera._count._all,
        monto: n(madera._sum.costoTotal),
        m3: n(madera._sum.volumeM3),
        sinValorizar: maderaSinPrecio,
      },
      produccion: { documentos: produccion._count._all, monto: 0, m3: n(produccion._sum.quantity) },
      ventas,
      gastos: { documentos: gastos._count._all, monto: n(gastos._sum.amount) },
      fletes: { documentos: fletes._count._all, monto: n(fletes._sum.monto) },
      adelantos: { documentos: adelantos._count._all, monto: n(adelantos._sum.montoAdelantado) },
      adelantosSaldo: n(adelantos._sum.saldoPendiente),
      cuentaCargos: { documentos: cargos._count._all, monto: n(cargos._sum.monto) },
      cuentaAbonos: { documentos: abonos._count._all, monto: n(abonos._sum.monto) },
    };
  }
}
