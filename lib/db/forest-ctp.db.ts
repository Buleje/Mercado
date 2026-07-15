/**
 * ForestCtpDB — Libro CTP: producción/transformación + despacho + saldos de planta (ADR-127).
 * El ingreso de materia prima vive en `WoodEntry` (ADR-124); acá producción y despacho.
 * Patrón Buleje: tenantId 1er param · cache invalidate · lineNo correlativo.
 */
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/lib/generated/prisma/client";
import { invalidateByPrefix } from "@/lib/cache";
import { auditCtp } from "@/lib/forestal/ctp-audit";
import { ForestCtpConsumoDB, CtpInvariantError, CONSUMO_VIGENTE } from "./forest-ctp-consumo.db";
import { ORIGEN_VIGENTE, ForestCtpDespachoDB } from "./forest-ctp-despacho.db";

export const CTP_SECTIONS = ["produccion", "despacho"] as const;
export type CtpSection = (typeof CTP_SECTIONS)[number];

const CACHE_PREFIX = "forest-ctp";
const dec = (v: number | string | null | undefined) =>
  v === null || v === undefined || v === "" ? null : new Prisma.Decimal(v);

/** Redondeo a 4 decimales — precisión forestal (igual que `WoodEntry.volumeM3`). */
const r4 = (n: number) => Math.round(n * 10000) / 10000;

/** Filtro de rango de fechas compartido por `list` y `saldos` (undefined = sin límite). */
function dateRange(opts: { fromDate?: Date; toDate?: Date }): Prisma.DateTimeFilter | undefined {
  if (!opts.fromDate && !opts.toDate) return undefined;
  const range: Prisma.DateTimeFilter = {};
  if (opts.fromDate) range.gte = opts.fromDate;
  if (opts.toDate) range.lte = opts.toDate;
  return range;
}

/**
 * Clave de agrupación por especie. Normaliza para que "Shihuahuaco",
 * "shihuahuaco " y "SHIHUAHUACO" (WoodEntry vs. ForestCtpEntry, tipeados a
 * mano en formularios distintos) caigan en el mismo balance.
 */
function speciesKey(raw: string | null | undefined): string {
  return (raw ?? "").trim().toLowerCase().replace(/\s+/g, " ") || "—";
}

/**
 * Clave de agrupación de un producto transformado (tipo + especie).
 *
 * SINGLE SOURCE: antes `saldos()` usaba `"tipo · especie"` y `availableSource()`
 * usaba `"tipo|especie"`, sin normalizar ninguna de las dos — o sea que
 * "Tablones|Tornillo" y "tablones|tornillo " contaban como productos distintos
 * y el stock se partía en dos. Mismo criterio que `speciesKey`.
 */
function productKey(productType: string | null | undefined, species: string | null | undefined): string {
  return `${speciesKey(productType)}|${speciesKey(species)}`;
}

/** Etiqueta legible del producto (la clave es para agrupar, esto es para mostrar). */
function productLabel(productType: string | null | undefined, species: string | null | undefined): string {
  return `${productType ?? "—"} · ${species ?? "—"}`;
}

export interface SpeciesBalance {
  especie: string;
  scientific: string | null;
  cites: boolean;
  /** m³ de madera validada/procesada que entró en el período. */
  ingresoM3: number;
  /** m³ registrados pero aún sin validar — no computan como disponible. */
  pendienteM3: number;
  /** m³ consumidos en líneas de producción. */
  consumidoM3: number;
  /** ingresoM3 − consumidoM3. Negativo = se transformó más de lo que entró. */
  saldoM3: number;
  ingresosCount: number;
}

export interface CtpEntryInput {
  section: CtpSection;
  entryDate?: Date;
  gtfIngreso?: string | null;
  materiaPrimaRef?: string | null;
  speciesCommon?: string | null;
  speciesScientific?: string | null;
  cites?: boolean;
  productType?: string | null;
  volumeInputM3?: number | string | null;
  rendimientoPct?: number | string | null;
  quantity?: number | string | null;
  unit?: string | null;
  pieces?: number | null;
  gtfNumber?: string | null;
  destino?: string | null;
  observations?: string | null;
  /** Aserrío / secado / mano de obra (ADR-134). Sin esto no hay margen. */
  costoProceso?: number | string | null;
  moneda?: string | null;
  /**
   * Qué ingresos alimentaron esta corrida y con cuántos m³ (ADR-134 D5).
   * Se escriben con `ForestCtpConsumoDB.setConsumos`, que valida I1/I2 y tenant.
   */
  consumos?: { woodEntryId: string; volumeM3: number | string }[];
  /**
   * De qué corridas salió el producto de este despacho (ADR-135).
   * Se escriben con `ForestCtpDespachoDB.setOrigenes`, que valida I4/I5,
   * tenant, orientación y que el producto/unidad coincidan.
   */
  origenes?: { produccionEntryId: string; quantity: number | string }[];
  createdBy: string;
}

export class ForestCtpDB {
  /**
   * I3 — no se puede despachar producto que no existe.
   *
   * Simétrico a I2 (que impide consumir materia prima inexistente). Sin esto el
   * módulo era asimétrico: blindaba la entrada y dejaba la salida abierta, y un
   * sobre-despacho sólo se veía en rojo en Saldos DESPUÉS de haberse registrado
   * — o sea, después de que la GTF de salida ya se emitió.
   *
   * `tx` obligatorio + lock: el stock de un producto no vive en una fila, se
   * deriva de N líneas. Se lockean las de producción que lo respaldan, así dos
   * despachos concurrentes del mismo producto se serializan en vez de leer los
   * dos el mismo stock y pasar ambos (el TOCTOU que I2 ya sufrió).
   */
  private static async assertStockDisponible(
    tx: Prisma.TransactionClient,
    tenantId: string,
    input: CtpEntryInput,
  ): Promise<void> {
    const pedido = Number(input.quantity ?? 0);
    if (pedido <= 0) return; // Sin cantidad no hay nada que validar.

    const key = productKey(input.productType, input.speciesCommon);

    // Lock de las líneas de producción del producto = el recurso disputado.
    await tx.$queryRaw`
      SELECT "id" FROM "ForestCtpEntry"
      WHERE "tenantId" = ${tenantId} AND "deletedAt" IS NULL
        AND "status" = 'registrado' AND "section" = 'produccion'
      ORDER BY "id"
      FOR UPDATE
    `;

    const lineas = await tx.forestCtpEntry.findMany({
      where: { tenantId, deletedAt: null, status: "registrado" },
      select: { section: true, productType: true, speciesCommon: true, quantity: true, unit: true },
    });

    let producido = 0;
    let despachado = 0;
    for (const l of lineas) {
      if (productKey(l.productType, l.speciesCommon) !== key) continue;
      if (l.section === "produccion") producido += Number(l.quantity ?? 0);
      if (l.section === "despacho") despachado += Number(l.quantity ?? 0);
    }
    const stock = r4(producido - despachado);

    if (r4(pedido) > stock) {
      const label = productLabel(input.productType, input.speciesCommon);
      throw new CtpInvariantError(
        stock <= 0
          ? `No hay stock de ${label} para despachar: se produjeron ${r4(producido)} y ya se despacharon ${r4(despachado)}.`
          : `Sólo quedan ${stock} de ${label} sin despachar; estás pidiendo ${r4(pedido)}.`,
        "I3_SOBRE_DESPACHO",
        { producto: label, stock, pedido: r4(pedido), producido: r4(producido), despachado: r4(despachado) },
      );
    }
  }

  static async create(tenantId: string, input: CtpEntryInput) {
    if (!tenantId) throw new Error("tenantId is required");
    if (!CTP_SECTIONS.includes(input.section)) throw new Error(`invalid section: ${input.section}`);
    if (!input.createdBy?.trim()) throw new Error("createdBy is required");

    // Rendimiento auto si hay input+output en m³ y no se pasó explícito
    let rendimiento = input.rendimientoPct;
    const inVol = input.volumeInputM3 != null ? Number(input.volumeInputM3) : 0;
    const outQty = input.quantity != null ? Number(input.quantity) : 0;
    if (rendimiento == null && input.section === "produccion" && inVol > 0 && outQty > 0 && input.unit === "m3") {
      rendimiento = Math.round((outQty / inVol) * 10000) / 100;
    }

    // La validación de stock y el INSERT van en UNA transacción: si se valida
    // fuera, entre el chequeo y el insert entra otro despacho y el guard no sirve.
    const entry = await prisma.$transaction(async (tx) => {
      if (input.section === "despacho") {
        await ForestCtpDB.assertStockDisponible(tx, tenantId, input);
      }

      const max = await tx.forestCtpEntry.aggregate({
        where: { tenantId, section: input.section },
        _max: { lineNo: true },
      });
      const lineNo = (max._max.lineNo ?? 0) + 1;

      return tx.forestCtpEntry.create({
        data: {
          tenantId,
          section: input.section,
          lineNo,
          entryDate: input.entryDate ?? new Date(),
          gtfIngreso: input.gtfIngreso?.trim() || null,
          materiaPrimaRef: input.materiaPrimaRef?.trim() || null,
          speciesCommon: input.speciesCommon?.trim() || null,
          speciesScientific: input.speciesScientific?.trim() || null,
          cites: input.cites ?? false,
          productType: input.productType?.trim() || null,
          volumeInputM3: dec(input.volumeInputM3),
          rendimientoPct: dec(rendimiento),
          quantity: dec(input.quantity),
          unit: input.unit?.trim() || null,
          pieces: input.pieces ?? null,
          gtfNumber: input.gtfNumber?.trim() || null,
          destino: input.destino?.trim() || null,
          observations: input.observations?.trim() || null,
          costoProceso: dec(input.costoProceso),
          moneda: input.moneda?.trim() || "PEN",
          status: "registrado",
          createdBy: input.createdBy,
        },
      });
    });

    auditCtp({
      tenantId,
      action: "ctp_linea_create",
      entity: "ForestCtpEntry",
      entityId: entry.id,
      detail: `Registró la línea #${entry.lineNo} de ${input.section} · ${entry.speciesCommon ?? "sin especie"} · ${entry.productType ?? "sin producto"}${entry.quantity != null ? ` · ${Number(entry.quantity)} ${entry.unit ?? ""}` : ""}`,
      user: input.createdBy,
    });

    // La atribución de materia prima va por su propia vía: valida I1/I2 y que
    // los ingresos sean del tenant (ADR-134 D7). Si viola una invariante tira,
    // y la línea recién creada queda sin consumos — visible como `sinAtribuirM3`,
    // que es justo lo que el operador tiene que ir a corregir.
    if (input.consumos?.length) {
      await ForestCtpConsumoDB.setConsumos(tenantId, entry.id, input.consumos, input.createdBy);
    }
    // Ídem para la salida: valida I4/I5 + orientación + producto (ADR-135).
    if (input.origenes?.length) {
      await ForestCtpDespachoDB.setOrigenes(tenantId, entry.id, input.origenes, input.createdBy);
    }

    try { invalidateByPrefix(`${CACHE_PREFIX}:${tenantId}`); } catch {}
    return entry;
  }

  static async list(
    tenantId: string,
    filters: { section?: CtpSection; search?: string; includeAnnulled?: boolean; fromDate?: Date; toDate?: Date } = {},
  ) {
    if (!tenantId) throw new Error("tenantId is required");
    const where: Prisma.ForestCtpEntryWhereInput = { tenantId, deletedAt: null };
    if (filters.section) where.section = filters.section;
    if (!filters.includeAnnulled) where.status = "registrado";
    const range = dateRange(filters);
    if (range) where.entryDate = range;
    if (filters.search) {
      where.OR = [
        { speciesCommon: { contains: filters.search, mode: "insensitive" } },
        { productType: { contains: filters.search, mode: "insensitive" } },
        { gtfNumber: { contains: filters.search, mode: "insensitive" } },
        { gtfIngreso: { contains: filters.search, mode: "insensitive" } },
      ];
    }
    const [entries, total] = await Promise.all([
      prisma.forestCtpEntry.findMany({ where, orderBy: [{ section: "asc" }, { lineNo: "asc" }], take: 500 }),
      prisma.forestCtpEntry.count({ where }),
    ]);
    return { entries, total };
  }

  static async getById(tenantId: string, id: string) {
    if (!tenantId) throw new Error("tenantId is required");
    return prisma.forestCtpEntry.findFirst({ where: { tenantId, id, deletedAt: null } });
  }

  static async annul(tenantId: string, id: string, reason: string, user = "unknown") {
    if (!tenantId) throw new Error("tenantId is required");
    if (!reason?.trim()) throw new Error("reason is required");
    const e = await prisma.forestCtpEntry.update({
      where: { id, tenantId } satisfies Prisma.ForestCtpEntryWhereUniqueInput,
      data: { status: "anulado", annulledReason: reason.trim() },
    });
    // Anular saca la línea del balance: quién y por qué es dato de fiscalización.
    auditCtp({
      tenantId,
      action: "ctp_linea_annul",
      entity: "ForestCtpEntry",
      entityId: id,
      detail: `Anuló la línea #${e.lineNo} de ${e.section} (${e.speciesCommon ?? "sin especie"}) · motivo: ${reason.trim()}`,
      user,
    });
    try { invalidateByPrefix(`${CACHE_PREFIX}:${tenantId}`); } catch {}
    return e;
  }

  static async softDelete(tenantId: string, id: string, user = "unknown") {
    if (!tenantId) throw new Error("tenantId is required");
    const e = await prisma.forestCtpEntry.update({
      where: { id, tenantId } satisfies Prisma.ForestCtpEntryWhereUniqueInput,
      data: { deletedAt: new Date() },
    });
    auditCtp({
      tenantId,
      action: "ctp_linea_delete",
      entity: "ForestCtpEntry",
      entityId: id,
      detail: `Eliminó (soft) la línea #${e.lineNo} de ${e.section} (${e.speciesCommon ?? "sin especie"})`,
      user,
    });
    try { invalidateByPrefix(`${CACHE_PREFIX}:${tenantId}`); } catch {}
    return e;
  }

  /**
   * Saldos de planta del CTP, desglosados **por especie** (es lo que se
   * fiscaliza: el balance global puede dar positivo mientras una especie está
   * en negativo).
   *
   *  - materia prima por especie = Σ ingreso validado/procesado (WoodEntry)
   *                                − Σ consumido en producción
   *  - stock de productos (tipo · especie) = Σ producido − Σ despachado
   *
   * La madera `pendiente` de validar NO cuenta como materia prima disponible
   * (criterio alineado con `WoodEntriesDB.aggregateBySpecies`); se reporta
   * aparte en `pendienteM3` para que el número siga siendo visible.
   */
  static async saldos(tenantId: string, opts: { fromDate?: Date; toDate?: Date } = {}) {
    if (!tenantId) throw new Error("tenantId is required");

    const range = dateRange(opts);
    const woodWhere: Prisma.WoodEntryWhereInput = {
      tenantId,
      deletedAt: null,
      status: { in: ["validado", "procesado", "pendiente"] },
    };
    const ctpWhere: Prisma.ForestCtpEntryWhereInput = { tenantId, deletedAt: null, status: "registrado" };
    if (range) {
      woodWhere.entryDate = range;
      ctpWhere.entryDate = range;
    }

    const [ingresos, ctp] = await Promise.all([
      prisma.woodEntry.findMany({
        where: woodWhere,
        select: {
          speciesCommonName: true,
          speciesScientificName: true,
          speciesCites: true,
          volumeM3: true,
          status: true,
        },
      }),
      prisma.forestCtpEntry.findMany({
        where: ctpWhere,
        select: { section: true, productType: true, speciesCommon: true, volumeInputM3: true, quantity: true, unit: true },
      }),
    ]);

    const bySpecies = new Map<string, SpeciesBalance>();
    const bucket = (raw: string | null, scientific?: string | null, cites?: boolean) => {
      const key = speciesKey(raw);
      let b = bySpecies.get(key);
      if (!b) {
        b = {
          especie: raw?.trim() || "Sin especie",
          scientific: scientific?.trim() || null,
          cites: false,
          ingresoM3: 0,
          pendienteM3: 0,
          consumidoM3: 0,
          saldoM3: 0,
          ingresosCount: 0,
        };
        bySpecies.set(key, b);
      }
      // El nombre científico puede venir sólo en una de las dos fuentes.
      if (!b.scientific && scientific?.trim()) b.scientific = scientific.trim();
      if (cites) b.cites = true;
      return b;
    };

    let ingresoM3 = 0;
    let pendienteM3 = 0;
    let ingresosCount = 0;
    for (const e of ingresos) {
      const vol = e.volumeM3 ? Number(e.volumeM3) : 0;
      const b = bucket(e.speciesCommonName, e.speciesScientificName, e.speciesCites);
      if (e.status === "pendiente") {
        b.pendienteM3 += vol;
        pendienteM3 += vol;
        continue;
      }
      b.ingresoM3 += vol;
      b.ingresosCount += 1;
      ingresoM3 += vol;
      ingresosCount += 1;
    }

    let consumidoM3 = 0;
    // Agrupado por clave normalizada; se guarda la etiqueta de la 1ª aparición.
    const prod: Record<string, { label: string; producido: number; despachado: number }> = {};
    for (const e of ctp) {
      const key = productKey(e.productType, e.speciesCommon);
      prod[key] ??= { label: productLabel(e.productType, e.speciesCommon), producido: 0, despachado: 0 };
      if (e.section === "produccion") {
        const consumido = Number(e.volumeInputM3 ?? 0);
        consumidoM3 += consumido;
        bucket(e.speciesCommon).consumidoM3 += consumido;
        prod[key].producido += Number(e.quantity ?? 0);
      }
      if (e.section === "despacho") {
        bucket(e.speciesCommon);
        prod[key].despachado += Number(e.quantity ?? 0);
      }
    }

    const porEspecie = [...bySpecies.values()]
      .map((b) => ({
        ...b,
        ingresoM3: r4(b.ingresoM3),
        pendienteM3: r4(b.pendienteM3),
        consumidoM3: r4(b.consumidoM3),
        saldoM3: r4(b.ingresoM3 - b.consumidoM3),
      }))
      // Los sobreconsumos primero: es el hallazgo que hay que ver sin buscar.
      .sort((a, b) => {
        const aNeg = a.saldoM3 < 0 ? 1 : 0;
        const bNeg = b.saldoM3 < 0 ? 1 : 0;
        if (aNeg !== bNeg) return bNeg - aNeg;
        return b.ingresoM3 - a.ingresoM3;
      });

    return {
      materiaPrima: {
        ingresoM3: r4(ingresoM3),
        ingresosCount,
        consumidoM3: r4(consumidoM3),
        saldoM3: r4(ingresoM3 - consumidoM3),
        pendienteM3: r4(pendienteM3),
        especiesEnNegativo: porEspecie.filter((e) => e.saldoM3 < 0).length,
      },
      porEspecie,
      // `label` y no la clave: la clave va normalizada en minúsculas para
      // agrupar, pero lo que se muestra es "Tablones · Tornillo".
      productos: Object.values(prod).map((v) => ({
        producto: v.label,
        producido: r4(v.producido),
        despachado: r4(v.despachado),
        stock: r4(v.producido - v.despachado),
      })),
    };
  }

  /**
   * Ítems seleccionables (data-driven):
   *  - produccion → ingresos de materia prima (WoodEntry) con saldo sin consumir
   *  - despacho   → productos producidos con stock > 0 (producido − despachado)
   *
   * ADR-134: devuelve `id` y `disponible`.
   *  · `id` — antes se omitía del `select`, así que el picker de guías no tenía
   *    qué guardar y la línea quedaba atada por TEXTO. Sin `id` no hay puente N:M.
   *  · `disponible` = volumeM3 − Σ consumos de otras líneas. Es el número que
   *    la invariante I2 va a exigir igual: mejor mostrarlo que hacer fallar el
   *    guardado después de que el operador cargó todo.
   *
   * Sólo ofrece ingresos `validado`/`procesado`: `saldos()` no cuenta la madera
   * `pendiente` como materia prima disponible, así que producir desde un ingreso
   * sin validar dejaría el saldo de esa especie en negativo — una alarma falsa
   * fabricada por el picker. Validar primero, producir después.
   *
   * @param excludeCtpEntryId al EDITAR una línea, lo que esa línea ya consume no
   *        cuenta contra el disponible (si no, sus propios ingresos aparecerían
   *        agotados). Mismo criterio que usa I2 en `setConsumos`.
   */
  static async availableSource(
    tenantId: string,
    section: CtpSection,
    opts: { excludeCtpEntryId?: string } = {},
  ) {
    if (!tenantId) throw new Error("tenantId is required");
    if (section === "produccion") {
      const ing = await prisma.woodEntry.findMany({
        where: { tenantId, deletedAt: null, status: { in: ["validado", "procesado"] } },
        orderBy: { entryDate: "desc" },
        take: 300,
        select: {
          id: true, gtfNumber: true, entryDate: true,
          speciesCommonName: true, speciesScientificName: true, speciesCites: true,
          volumeM3: true, costoTotal: true, moneda: true,
        },
      });
      if (ing.length === 0) return [];

      const consumido = await prisma.forestCtpConsumo.groupBy({
        by: ["woodEntryId"],
        where: {
          tenantId,
          woodEntryId: { in: ing.map((w) => w.id) },
          ...(opts.excludeCtpEntryId ? { ctpEntryId: { not: opts.excludeCtpEntryId } } : {}),
          ...CONSUMO_VIGENTE, // mismo criterio que I2 y que saldos(): sin líneas muertas
        },
        _sum: { volumeM3: true },
      });
      const usado = new Map(consumido.map((c) => [c.woodEntryId, Number(c._sum.volumeM3 ?? 0)]));

      return ing
        .map((w) => {
          const total = w.volumeM3 ? Number(w.volumeM3) : 0;
          const disponible = r4(total - (usado.get(w.id) ?? 0));
          return {
            kind: "ingreso" as const,
            id: w.id,
            code: w.gtfNumber,
            entryDate: w.entryDate,
            species: w.speciesCommonName,
            scientific: w.speciesScientificName,
            cites: w.speciesCites,
            vol: total,
            disponible,
            /** S/ por m³ — null si la factura todavía no llegó (ADR-134 D6). */
            costoUnitario:
              w.costoTotal != null && total > 0 ? Math.round((Number(w.costoTotal) / total) * 100) / 100 : null,
            moneda: w.moneda ?? "PEN",
          };
        })
        // Ya consumido del todo = no es "available".
        .filter((w) => w.disponible > 0);
    }
    if (section === "despacho") {
      // ADR-135: devuelve CORRIDAS, no productos agregados.
      //
      // Antes agregaba por `productKey` y no devolvía ids — el mismo bug que
      // ADR-134 arregló del lado de producción: sin el id de la corrida no hay
      // puente que construir, y el despacho no puede decir de DÓNDE salió.
      // Elegir corridas (y no "un producto en stock") es además lo que espeja a
      // producción, que elige guías y no "una especie disponible".
      const corridas = await prisma.forestCtpEntry.findMany({
        where: { tenantId, deletedAt: null, status: "registrado", section: "produccion" },
        orderBy: { entryDate: "desc" },
        take: 300,
        select: {
          id: true, lineNo: true, entryDate: true, productType: true,
          speciesCommon: true, speciesScientific: true, cites: true, quantity: true, unit: true,
        },
      });
      if (corridas.length === 0) return [];

      const salido = await prisma.forestCtpDespachoOrigen.groupBy({
        by: ["produccionEntryId"],
        where: {
          tenantId,
          produccionEntryId: { in: corridas.map((c) => c.id) },
          ...(opts.excludeCtpEntryId ? { despachoEntryId: { not: opts.excludeCtpEntryId } } : {}),
          ...ORIGEN_VIGENTE, // un despacho anulado no sigue reservando la corrida
        },
        _sum: { quantity: true },
      });
      const usado = new Map(salido.map((s) => [s.produccionEntryId, Number(s._sum.quantity ?? 0)]));

      return corridas
        .map((c) => {
          const producido = c.quantity ? Number(c.quantity) : 0;
          return {
            kind: "corrida" as const,
            id: c.id,
            /** Lo que se muestra como identificador de la corrida. */
            code: `Corrida #${c.lineNo}`,
            lineNo: c.lineNo,
            entryDate: c.entryDate,
            productType: c.productType,
            species: c.speciesCommon,
            scientific: c.speciesScientific,
            cites: c.cites,
            unit: c.unit,
            producido,
            /** Lo que I5 va a exigir igual: mejor mostrarlo que fallar al guardar. */
            disponible: r4(producido - (usado.get(c.id) ?? 0)),
          };
        })
        .filter((c) => c.disponible > 0);
    }
    return [];
  }
}
