/**
 * ForestCtpDB — Libro CTP: producción/transformación + despacho + saldos de planta (ADR-127).
 * El ingreso de materia prima vive en `WoodEntry` (ADR-124); acá producción y despacho.
 * Patrón Buleje: tenantId 1er param · cache invalidate · lineNo correlativo.
 */
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/lib/generated/prisma/client";
import { invalidateByPrefix } from "@/lib/cache";
import { auditCtp } from "@/lib/forestal/ctp-audit";
import { ForestCtpConsumoDB, CtpInvariantError, CONSUMO_VIGENTE, CTP_TX_OPTS } from "./forest-ctp-consumo.db";
import { ORIGEN_VIGENTE, ForestCtpDespachoDB } from "./forest-ctp-despacho.db";
import { ForestCtpCierreDB } from "./forest-ctp-cierre.db";
import { saldosDeCorridas } from "./forest-ctp-saldo-corrida";
/* Las trozas de una corrida se leen SIEMPRE por acá (ADR-326 §6: las tres
   lecturas dicen lo mismo). `wood-entries.db` no importa este archivo, así que
   la dependencia va en un solo sentido. */
import { WoodEntriesDB } from "./wood-entries.db";
import { agruparMovimiento, pasoParaBarras, type MovimientoDelLibro } from "@/lib/forestal/movimiento-libro";
import { RENDIMIENTO_TOPE_PCT, topeDeclarableM3 } from "@/lib/forestal/produccion-paquetes";
import { claveEspecie } from "@/lib/forestal/loth-constants";

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
 *
 * FIX 2026-08-22: delega en `claveEspecie` (misma fuente que LOTH) — la
 * versión anterior no quitaba tildes, así que "Ishpingo" (WoodEntry) e
 * "Ishpíngo" (ForestCtpEntry, mismo caso que el comentario de arriba
 * describe) caían en DOS baldes separados. Con `especiesEnNegativo` restando
 * hasta 25 puntos del score de cumplimiento, un typo de tilde entre las dos
 * tablas podía inventar un "saldo negativo" falso — el ingreso de uno se
 * contaba aparte del consumo del otro.
 */
function speciesKey(raw: string | null | undefined): string {
  return claveEspecie(raw) || "—";
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
  /**
   * m³ que salieron SIN ASERRAR (ADR-363): madera vendida en rollo. Dejó el
   * patio igual que la consumida, pero no pasó por ninguna corrida — por eso es
   * una columna propia y no se suma a `consumidoM3`, que significa "se aserró".
   */
  despachadoDirectoM3: number;
  /** ingresoM3 − consumidoM3 − despachadoDirectoM3. Negativo = salió más de lo que entró. */
  saldoM3: number;
  ingresosCount: number;
}

/**
 * Conciliación de período (ADR-139 rollforward): existencia de APERTURA + movimientos del
 * período = existencia FINAL. Sin apertura, un saldo mensual ignora el stock
 * heredado y no cuadra ante un fiscalizador. La apertura sale del cierre anterior
 * (frozen) o se calcula acumulada hasta el inicio del período.
 */
export interface ConciliacionPeriodo {
  /** De dónde salió la apertura: "cierre" (snapshot congelado), "calculada" (acumulada), "sin_apertura" (período histórico). */
  fuenteApertura: "cierre" | "calculada" | "sin_apertura";
  /** Etiqueta del cierre que dio la apertura, si aplica ("marzo de 2026"). */
  aperturaLabel: string | null;
  materiaPrima: { especie: string; cites: boolean; apertura: number; ingreso: number; consumido: number; final: number; negativa: boolean }[];
  productos: { producto: string; apertura: number; producido: number; despachado: number; final: number; negativo: boolean }[];
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
  /** (3) Tipo de documento con el que sale el producto: GTF | GRR (ADR-311). */
  docType?: string | null;
  /** Línea de producción de la corrida: LP | LRE (Cuadro Resumen 3). */
  lineaProduccion?: string | null;
  /** (9) "Código del producto" de la Sección 4 del formato oficial. */
  codigoProducto?: string | null;
  presentacion?: string | null;
  destino?: string | null;
  /** Sello de la verificación de la GTF de salida contra SERFOR (ADR-312). */
  serforNumeroRegistro?: string | null;
  serforVerificadoEn?: Date | null;
  observations?: string | null;
  /** Aserrío / secado / mano de obra (ADR-134). Sin esto no hay margen. */
  costoProceso?: number | string | null;
  /**
   * En cuánto se vendió lo que sale (sólo despacho). Hasta ahora se cargaba
   * únicamente después, con `set_venta` desde el panel de Rentabilidad: quien
   * registraba la salida tenía el precio delante y no había dónde ponerlo, y
   * volver a buscarlo despacho por despacho es lo que dejaba el 100% sin valor.
   * Sigue siendo opcional — a veces la venta se cierra después del camión.
   */
  valorVenta?: number | string | null;
  moneda?: string | null;
  /**
   * La línea es una salida de TROZAS SIN ASERRAR (ADR-363).
   *
   * No se persiste: sólo apaga el chequeo de stock por producto (I3), que no
   * aplica cuando lo que sale es materia prima. El stock de esa línea son las
   * piezas, y lo valida T2 (`assertTrozasDespachables`) antes de crearla.
   */
  desdeTrozas?: boolean;
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

/**
 * Clave estable de una corrida para el dedup de importación (ADR-138 etapa 2):
 * fecha date-only + producto + especie + cantidad(4 dec). La usan la DB class y
 * el endpoint de import — misma fórmula a ambos lados o el dedup no matchea.
 */
/**
 * La clave VIEJA, sin paquete ni lote.
 *
 * Existe sólo por compatibilidad: las corridas que se importaron antes de que la
 * clave incluyera el paquete no tienen con qué distinguirse. Si al re-importar
 * el mismo libro se las midiera con la clave nueva, no matchearían y la
 * producción entraría DOS VECES — declarar de más es exactamente lo que el
 * libro no puede hacer.
 */
export function produccionKeyBase(entryDate: Date | string, productType: string | null, speciesCommon: string | null, quantity: unknown): string {
  const d = entryDate instanceof Date ? entryDate.toISOString().slice(0, 10) : String(entryDate ?? "").slice(0, 10);
  const q = quantity == null || quantity === "" ? "" : Number(quantity).toFixed(4);
  return [d, (productType ?? "").trim().toLowerCase(), (speciesCommon ?? "").trim().toLowerCase(), q].join("|");
}

export function produccionKey(
  entryDate: Date | string,
  productType: string | null,
  speciesCommon: string | null,
  quantity: unknown,
  /**
   * El código del PAQUETE y el LOTE, cuando el archivo los trae.
   *
   * Sin ellos, dos paquetes distintos de la misma especie, el mismo producto y
   * el mismo volumen —lo NORMAL en un inventario de aserrada: los paquetes se
   * arman iguales— tenían la misma clave y el importador descartaba el segundo
   * como «duplicado en el archivo». Se perdía madera que existe en el depósito.
   */
  codigoProducto?: string | null,
  materiaPrimaRef?: string | null,
): string {
  const d = entryDate instanceof Date ? entryDate.toISOString().slice(0, 10) : String(entryDate ?? "").slice(0, 10);
  const q = quantity == null || quantity === "" ? "" : Number(quantity).toFixed(4);
  const norm = (v: string | null | undefined) => (v ?? "").trim().toLowerCase();
  return [d, norm(productType), norm(speciesCommon), q, norm(codigoProducto), norm(materiaPrimaRef)].join("|");
}

/**
 * Clave de un despacho para el dedup de importación (ADR-138 etapa 2b): por su
 * GTF de salida si la tiene (identificador natural), o composite fecha+producto+
 * especie+cantidad+destino si aún no se emitió GTF. Misma fórmula en DB y endpoint.
 */
export function despachoKey(gtfNumber: string | null, entryDate: Date | string, productType: string | null, speciesCommon: string | null, quantity: unknown, destino: string | null): string {
  const g = (gtfNumber ?? "").trim();
  if (g) return `gtf:${g.toLowerCase()}`;
  const d = entryDate instanceof Date ? entryDate.toISOString().slice(0, 10) : String(entryDate ?? "").slice(0, 10);
  const q = quantity == null || quantity === "" ? "" : Number(quantity).toFixed(4);
  return [d, (productType ?? "").trim().toLowerCase(), (speciesCommon ?? "").trim().toLowerCase(), q, (destino ?? "").trim().toLowerCase()].join("|");
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
      select: { id: true, section: true, productType: true, speciesCommon: true, quantity: true, unit: true },
    });

    let producido = 0;
    let despachado = 0;
    const idsDelProducto: string[] = [];
    for (const l of lineas) {
      if (productKey(l.productType, l.speciesCommon) !== key) continue;
      if (l.section === "produccion") {
        producido += Number(l.quantity ?? 0);
        idsDelProducto.push(l.id);
      }
      if (l.section === "despacho") despachado += Number(l.quantity ?? 0);
    }

    // Lo que se fue a REPROCESO también salió del stock (ADR-316): esa tabla se
    // convirtió en tablillas y ya no está para despachar. I5 descuenta el
    // reproceso corrida por corrida; acá hace falta el agregado del producto,
    // porque I3 mira el total y no las atribuciones.
    let reprocesado = 0;
    if (idsDelProducto.length > 0) {
      const rep = await tx.forestCtpReproceso.aggregate({
        // Las DOS condiciones: anular una línea pone `status = "anulado"` y no
        // hace soft-delete. Un reproceso anulado devolvió su madera al stock.
        where: {
          tenantId,
          origenEntryId: { in: idsDelProducto },
          destino: { deletedAt: null, status: "registrado" },
        },
        _sum: { quantity: true },
      });
      reprocesado = Number(rep._sum.quantity ?? 0);
    }

    const stock = r4(producido - despachado - reprocesado);

    if (r4(pedido) > stock) {
      const label = productLabel(input.productType, input.speciesCommon);
      const salidas =
        `ya se despacharon ${r4(despachado)}` + (reprocesado > 0 ? ` y ${r4(reprocesado)} se reprocesaron` : "");
      throw new CtpInvariantError(
        stock <= 0
          ? `No hay stock de ${label} para despachar: se produjeron ${r4(producido)} y ${salidas}.`
          : `Sólo quedan ${stock} de ${label} sin despachar; estás pidiendo ${r4(pedido)}.`,
        "I3_SOBRE_DESPACHO",
        { producto: label, stock, pedido: r4(pedido), producido: r4(producido), despachado: r4(despachado), reprocesado: r4(reprocesado) },
      );
    }
  }

  static async create(tenantId: string, input: CtpEntryInput) {
    if (!tenantId) throw new Error("tenantId is required");
    if (!CTP_SECTIONS.includes(input.section)) throw new Error(`invalid section: ${input.section}`);
    if (!input.createdBy?.trim()) throw new Error("createdBy is required");

    // Cierre de período (ADR-139): no se registra una línea con fecha dentro de
    // un mes ya cerrado — sería alterar un acta inmutable.
    const cerradoCreate = await ForestCtpCierreDB.closedPeriodOf(tenantId, input.entryDate ?? new Date());
    if (cerradoCreate) {
      throw new CtpInvariantError(
        `El período ${cerradoCreate.label} está cerrado: no se puede registrar una línea con fecha de un mes cerrado.`,
        "PERIODO_CERRADO",
        { periodKey: cerradoCreate.periodKey },
      );
    }

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
      /* Una salida de trozas SIN ASERRAR no se mide contra `producido −
         despachado` (ADR-363): su stock son las PIEZAS, y T2 ya validó que cada
         una esté libre. Medirla con I3 daría stock 0 —nadie produjo madera en
         rollo— y rechazaría una venta legítima. */
      if (input.section === "despacho" && !input.desdeTrozas) {
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
          docType: input.docType?.trim() || null,
          lineaProduccion: input.section === "produccion" ? (input.lineaProduccion?.trim() || "LP") : null,
          codigoProducto: input.codigoProducto?.trim() || null,
          presentacion: input.presentacion?.trim().toUpperCase() || null,
          destino: input.destino?.trim() || null,
          serforNumeroRegistro: input.serforNumeroRegistro?.trim() || null,
          serforVerificadoEn: input.serforVerificadoEn ?? null,
          observations: input.observations?.trim() || null,
          costoProceso: dec(input.costoProceso),
          // Sólo la salida tiene precio de venta: en una corrida de producción
          // no se vende nada todavía.
          valorVenta: input.section === "despacho" ? dec(input.valorVenta) : null,
          moneda: input.moneda?.trim() || "PEN",
          status: "registrado",
          createdBy: input.createdBy,
        },
      });
    }, CTP_TX_OPTS);

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
        // El código del paquete es por lo que pregunta el comprador y lo que
        // está pintado en el atado: buscarlo tiene que funcionar.
        { codigoProducto: { contains: filters.search, mode: "insensitive" } },
      ];
    }
    const [entries, total] = await Promise.all([
      prisma.forestCtpEntry.findMany({ where, orderBy: [{ section: "asc" }, { lineNo: "asc" }], take: 500 }),
      prisma.forestCtpEntry.count({ where }),
    ]);

    /**
     * ¿Cuánto de cada despacho tiene origen declarado?
     *
     * La atribución parcial es LEGAL (invariante I4: siempre `≤`, nunca `==` —
     * forzar el 100% fabrica el fraude que previene), pero tiene que VERSE: un
     * despacho de 10 m³ con 5 atribuidos son 5 m³ que salieron de la planta sin
     * corrida de origen, y es lo primero que cruza un fiscalizador. Hasta ahora
     * sólo se sabía abriendo el despacho, de a uno.
     *
     * Un `groupBy` por página, igual que el de las corridas de abajo.
     */
    const despachos = entries.filter((e) => e.section === "despacho").map((e) => e.id);
    const atribuido = new Map<string, number>();
    if (despachos.length > 0) {
      const filas = await prisma.forestCtpDespachoOrigen.groupBy({
        by: ["despachoEntryId"],
        where: { tenantId, despachoEntryId: { in: despachos } },
        _sum: { quantity: true },
      });
      for (const f of filas) atribuido.set(f.despachoEntryId, Number(f._sum.quantity ?? 0));
    }

    // ¿Este paquete ya salió? Es la pregunta del reporte "estado de productos":
    // se produjo, ¿sigue en el patio o ya se lo llevaron? Va agregado acá y no
    // en el cliente porque la respuesta son dos tablas puente, no un campo.
    const corridas = entries.filter((e) => e.section === "produccion").map((e) => e.id);
    if (corridas.length === 0) {
      return {
        entries: entries.map((e) =>
          e.section === "despacho" ? { ...e, atribuidoQty: atribuido.get(e.id) ?? 0 } : e,
        ),
        total,
      };
    }

    /**
     * ¿De qué ingreso salió la madera que entró a esta corrida?
     *
     * Una corrida sin materia prima atribuida es producto que apareció de la
     * nada: el libro lo admite —el guard vive en el certificado, no en el
     * guardado— pero la fila tiene que decirlo. Consumos ya lo calculaba
     * (`corridasSinOrigen`), sólo que ahí hay que ir a buscarlo; en la tabla de
     * Producción, que es donde se miran las corridas, no se veía.
     *
     * Cierra el trío: el ingreso se cuadra contra sus piezas, la corrida contra
     * su materia prima, el despacho contra su corrida.
     */
    const [salidas, reprocesos, consumos] = await Promise.all([
      prisma.forestCtpDespachoOrigen.groupBy({
        by: ["produccionEntryId"],
        where: { tenantId, produccionEntryId: { in: corridas }, despacho: { deletedAt: null, status: "registrado" } },
        _sum: { quantity: true },
      }),
      prisma.forestCtpReproceso.groupBy({
        by: ["origenEntryId"],
        // Si la corrida DESTINO se anuló, ese reproceso no consumió nada: la
        // madera del origen volvió a estar disponible. Mismo criterio que el
        // despacho de arriba.
        where: { tenantId, origenEntryId: { in: corridas }, destino: { deletedAt: null, status: "registrado" } },
        _sum: { quantity: true },
      }),
      prisma.forestCtpConsumo.groupBy({
        by: ["ctpEntryId"],
        where: { tenantId, ctpEntryId: { in: corridas } },
        _sum: { volumeM3: true },
      }),
    ]);
    const desp = new Map(salidas.map((r) => [r.produccionEntryId, Number(r._sum.quantity ?? 0)]));
    const repro = new Map(reprocesos.map((r) => [r.origenEntryId, Number(r._sum.quantity ?? 0)]));
    const mpAtribuida = new Map(consumos.map((c) => [c.ctpEntryId, Number(c._sum.volumeM3 ?? 0)]));

    return {
      entries: entries.map((e) =>
        e.section === "produccion"
          ? {
              ...e,
              despachadoQty: desp.get(e.id) ?? 0,
              reprocesadoQty: repro.get(e.id) ?? 0,
              mpAtribuidaM3: mpAtribuida.get(e.id) ?? 0,
            }
          : e.section === "despacho"
            ? { ...e, atribuidoQty: atribuido.get(e.id) ?? 0 }
            : e,
      ),
      total,
    };
  }

  /**
   * Una corrida por id, con los paquetes que declaró.
   *
   * Los paquetes viajan porque quien amplía la producción (ADR-361) necesita
   * saber qué códigos ya están tomados: el código es lo que se busca en la pila
   * y la DB rechaza el repetido — enterarse recién en el 422, con la tanda
   * entera tipeada, es enterarse tarde.
   */
  static async getById(tenantId: string, id: string) {
    if (!tenantId) throw new Error("tenantId is required");
    return prisma.forestCtpEntry.findFirst({
      where: { tenantId, id, deletedAt: null },
      include: {
        paquetes: {
          select: {
            id: true, codigo: true, productType: true, presentacion: true,
            cantidad: true, volumenM3: true, espesorCm: true, anchoCm: true, largoM: true,
          },
          orderBy: { createdAt: "asc" },
        },
      },
    });
  }

  /**
   * DECLARAR LA PRODUCCIÓN de una corrida abierta en el patio (ADR-340).
   *
   * La corrida nació al consumir —con su materia prima y sin `quantity`— y esto
   * la cierra: qué producto salió, cuánto y en qué unidad. Es la Sección 3 del
   * LO-CTP, que tiene su propia fecha y su propio acto.
   *
   * Sólo completa corridas **en proceso**: si ya declaró producción, corregirla
   * es otra cosa (y hoy se hace anulando y rehaciendo, que deja rastro). El
   * rendimiento se calcula con la misma fórmula del alta — una sola regla.
   */
  /**
   * El código de paquete es único **en toda la planta**, no en la corrida
   * (`@@unique([tenantId, codigo])`): es lo que se busca en la pila y lo que se
   * cita en la guía de salida, y dos pilas con el mismo cartel no se distinguen.
   *
   * Sin este guard el choque llegaba al índice de Postgres y volvía como **500
   * `internal_error`** — una pantalla que se rompe sin decir por qué, con la
   * tanda entera tipeada. Verificado en el tenant real: declarar `PQ-001` una
   * segunda vez tiraba 500.
   *
   * Se mira el código ocupado por CUALQUIER corrida (borrada incluida: el índice
   * tampoco filtra `deletedAt`) y se nombra dónde está, que es lo único que
   * permite resolverlo.
   */
  private static async assertCodigosLibres(tenantId: string, codigos: readonly string[]) {
    const buscar = [...new Set(codigos.map((c) => c.trim()).filter(Boolean))];
    if (buscar.length === 0) return;
    const choques = await prisma.forestCtpPaquete.findMany({
      where: { tenantId, codigo: { in: buscar } },
      select: { codigo: true, entry: { select: { lineNo: true, deletedAt: true } } },
      take: 5,
    });
    if (choques.length === 0) return;
    const c = choques[0];
    throw new CtpInvariantError(
      `El código de paquete «${c.codigo}» ya está usado en la corrida N° ${c.entry.lineNo}` +
        `${c.entry.deletedAt ? " (borrada)" : ""}. El código no se repite en la planta: es lo que se busca ` +
        "en la pila y lo que se cita en la guía.",
      "PAQUETE_DUPLICADO",
    );
  }

  /**
   * AMPLIAR una corrida que ya declaró producción (ADR-361).
   *
   * El lote no sale de la sierra en un solo acto: se asierra una parte del turno,
   * salen los paquetes, y al día siguiente sale el resto de la MISMA materia
   * prima —tablillas, recuperación, lo que quedó del bloque—. Hasta acá había que
   * declarar todo junto o no declarar nada: `declararProduccion` rechaza la
   * corrida que ya declaró, y volver a consumir habría exigido trozas nuevas que
   * no existen porque la madera ya entró.
   *
   * Ampliar NO es corregir. Los paquetes anteriores quedan intactos y se suman
   * los nuevos: el libro gana filas, no las reescribe. Para corregir sigue
   * estando anular y rehacer, que es lo que deja rastro.
   *
   * El tope del 56 % se aplica sobre el **total acumulado** (ADR-358), no sobre
   * lo que se agrega ahora: si no, dos tandas del 40 % darían 80 % entre las dos.
   */
  static async ampliarProduccion(
    tenantId: string,
    id: string,
    campos: {
      paquetes: {
        codigo: string;
        productType?: string | null;
        presentacion?: string | null;
        cantidad: number;
        volumenM3: number;
        espesorCm?: number | null;
        anchoCm?: number | null;
        largoM?: number | null;
        observations?: string | null;
      }[];
      observations?: string | null;
    },
    user: string,
  ) {
    if (!tenantId) throw new Error("tenantId is required");
    const nuevos = campos.paquetes ?? [];
    if (nuevos.length === 0) {
      throw new CtpInvariantError("No hay paquetes que agregar.", "CANTIDAD_INVALIDA");
    }
    const suma = r4(nuevos.reduce((a, p) => a + (Number(p.volumenM3) || 0), 0));
    if (!(suma > 0)) {
      throw new CtpInvariantError("Los paquetes que se agregan no suman volumen.", "CANTIDAD_INVALIDA");
    }

    // Lock + lectura + escritura de `quantity` en UNA transacción (auditoría
    // 2026-08-25): dos operadores ampliando la MISMA corrida a la vez leían
    // el mismo `quantity` viejo y el que escribía último pisaba al otro —
    // los paquetes de los dos quedaban creados, pero el total declarado sólo
    // reflejaba uno. Mismo patrón que `setConsumos`/`setOrigenes`.
    const entry = await prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<
        {
          id: string; section: string; status: string; lineNo: number; entryDate: Date;
          quantity: Prisma.Decimal | null; unit: string | null; volumeInputM3: Prisma.Decimal | null;
          productType: string | null; presentacion: string | null;
        }[]
      >`
        SELECT "id", "section", "status", "lineNo", "entryDate", "quantity", "unit",
               "volumeInputM3", "productType", "presentacion"
        FROM "ForestCtpEntry"
        WHERE "id" = ${id} AND "tenantId" = ${tenantId} AND "deletedAt" IS NULL
        FOR UPDATE
      `;
      if (locked.length === 0) throw new CtpInvariantError("Esa corrida no existe.", "LINEA_NO_EDITABLE");
      const actual = locked[0];
      if (actual.section !== "produccion") {
        throw new CtpInvariantError("Sólo una corrida de producción declara producción.", "SECCION_INVALIDA");
      }
      if (actual.status !== "registrado") {
        throw new CtpInvariantError(`Esa corrida está ${actual.status}.`, "LINEA_NO_EDITABLE");
      }
      if (actual.quantity == null) {
        throw new CtpInvariantError(
          `La corrida #${actual.lineNo} todavía no declaró producción: declarala primero.`,
          "LINEA_NO_EDITABLE",
        );
      }
      const cerrado = await ForestCtpCierreDB.closedPeriodOf(tenantId, actual.entryDate);
      if (cerrado) {
        throw new CtpInvariantError(
          `El período ${cerrado.label} está cerrado: no se puede ampliar una corrida de un mes cerrado.`,
          "PERIODO_CERRADO",
          { periodKey: cerrado.periodKey },
        );
      }

      const paquetesActuales = await tx.forestCtpPaquete.findMany({ where: { ctpEntryId: id, tenantId }, select: { codigo: true } });

      /* El código de paquete es lo que se busca en la pila y lo que se cita en la
         guía de salida: no puede repetirse ni contra los que ya están. */
      const yaEstan = new Set(paquetesActuales.map((p) => p.codigo.trim().toLowerCase()));
      const choque = nuevos.find((p) => yaEstan.has(p.codigo.trim().toLowerCase()));
      if (choque) {
        throw new CtpInvariantError(
          `El código de paquete «${choque.codigo}» ya está en esta corrida.`,
          "PAQUETE_DUPLICADO",
        );
      }
      /* Y contra el resto de la planta, que es el alcance real del índice. */
      await ForestCtpDB.assertCodigosLibres(tenantId, nuevos.map((p) => p.codigo));
      const repetido = nuevos.find((p, i) => nuevos.findIndex((q) => q.codigo.trim() === p.codigo.trim()) !== i);
      if (repetido) {
        throw new CtpInvariantError(
          `El código de paquete «${repetido.codigo}» viene dos veces.`,
          "PAQUETE_DUPLICADO",
        );
      }

      const total = r4(Number(actual.quantity) + suma);

      /* El tope, sobre el TOTAL: dos tandas del 40 % son 80 % entre las dos, y el
         techo existe justo para que eso no pase (ADR-358). */
      const entrada = Number(actual.volumeInputM3 ?? 0);
      if (entrada > 0 && (actual.unit ?? "m3") === "m3") {
        const tope = topeDeclarableM3(entrada);
        if (total > tope + 0.001) {
          throw new CtpInvariantError(
            `Con ${entrada.toFixed(4)} m³ de materia prima el tope (${RENDIMIENTO_TOPE_PCT} %) permite ` +
              `${tope.toFixed(4)} m³ en total. Esta corrida ya declaró ${r4(Number(actual.quantity))} y estás ` +
              `agregando ${suma}: quedan ${r4(Math.max(0, tope - Number(actual.quantity)))} m³.`,
            "RENDIMIENTO_SOBRE_TOPE",
          );
        }
      }

      const rendimiento =
        entrada > 0 && (actual.unit ?? "m3") === "m3"
          ? Math.round((total / entrada) * 10000) / 100
          : null;

      return tx.forestCtpEntry.update({
        where: { id, tenantId } satisfies Prisma.ForestCtpEntryWhereUniqueInput,
        data: {
          quantity: total,
          rendimientoPct: rendimiento,
          ...(campos.observations?.trim() ? { observations: campos.observations.trim() } : {}),
          paquetes: {
            create: nuevos.map((p) => ({
              tenantId,
              codigo: p.codigo.trim(),
              productType: p.productType?.trim() || actual.productType || null,
              presentacion: p.presentacion?.trim() || actual.presentacion || null,
              cantidad: Math.max(0, Math.round(p.cantidad)),
              unit: actual.unit ?? "m3",
              volumenM3: p.volumenM3,
              espesorCm: p.espesorCm ?? null,
              anchoCm: p.anchoCm ?? null,
              largoM: p.largoM ?? null,
              observations: p.observations?.trim() || null,
              createdBy: user,
            })),
          },
        },
      });
    });
    auditCtp({
      tenantId,
      action: "ctp_linea_produccion_declarada",
      entity: "ForestCtpEntry",
      entityId: id,
      detail:
        `Amplió la corrida #${entry.lineNo}: +${nuevos.length} paquete(s) · +${suma} ` +
        `(total ${Number(entry.quantity)}${entry.rendimientoPct != null ? ` · rendimiento ${Number(entry.rendimientoPct)}%` : ""})`,
      user,
    });
    try { invalidateByPrefix(`${CACHE_PREFIX}:${tenantId}`); } catch { /* best-effort */ }
    return entry;
  }

  static async declararProduccion(
    tenantId: string,
    id: string,
    campos: {
      productType?: string | null;
      presentacion?: string | null;
      quantity: number;
      unit: string;
      pieces?: number | null;
      codigoProducto?: string | null;
      lineaProduccion?: string | null;
      observations?: string | null;
      /**
       * Los PAQUETES que salieron (ADR-349). El formato del SNIFFS declara
       * paquetes, no un volumen suelto: cada uno con su código, su producto y
       * —si se dimensionó— espesor, ancho y largo.
       *
       * Son el detalle de `quantity`, no otra cantidad: se valida que sumen lo
       * declarado. Sin paquetes, la corrida se declara como antes.
       */
      paquetes?: {
        codigo: string;
        productType?: string | null;
        presentacion?: string | null;
        cantidad: number;
        volumenM3: number;
        espesorCm?: number | null;
        anchoCm?: number | null;
        largoM?: number | null;
        observations?: string | null;
      }[];
    },
    user = "unknown",
  ) {
    if (!tenantId) throw new Error("tenantId is required");
    const actual = await prisma.forestCtpEntry.findFirst({
      where: { id, tenantId, deletedAt: null },
      select: { id: true, section: true, status: true, lineNo: true, entryDate: true, quantity: true, volumeInputM3: true, observations: true },
    });
    if (!actual) return null;
    if (actual.section !== "produccion") {
      throw new CtpInvariantError("Sólo una corrida de producción declara producción.", "SECCION_INVALIDA");
    }
    if (actual.status !== "registrado") {
      throw new CtpInvariantError(`Esa corrida está ${actual.status}.`, "LINEA_NO_EDITABLE");
    }
    if (actual.quantity != null) {
      throw new CtpInvariantError(
        `La corrida #${actual.lineNo} ya declaró producción. Para corregirla, anulala y volvé a registrarla.`,
        "LINEA_NO_EDITABLE",
      );
    }
    const cerrado = await ForestCtpCierreDB.closedPeriodOf(tenantId, actual.entryDate);
    if (cerrado) {
      throw new CtpInvariantError(
        `El período ${cerrado.label} está cerrado: no se puede declarar producción de un mes cerrado.`,
        "PERIODO_CERRADO",
        { periodKey: cerrado.periodKey },
      );
    }
    if (!(campos.quantity > 0)) {
      throw new CtpInvariantError("La cantidad producida debe ser mayor a 0.", "CANTIDAD_INVALIDA");
    }

    /* El techo del 56 % (ADR-358), también acá y no sólo en el formulario.
       Una regla que vive únicamente en la pantalla la saltea cualquier POST, y
       ésta existe justamente para que el libro no declare más producto del que
       sale físicamente de una troza. Sólo aplica cuando la corrida declara en
       m³: dividir pies tablares por m³ no es un rendimiento. */
    const entrada = Number(actual.volumeInputM3 ?? 0);
    if (entrada > 0 && (campos.unit ?? "m3") === "m3") {
      const tope = topeDeclarableM3(entrada);
      if (campos.quantity > tope + 0.001) {
        throw new CtpInvariantError(
          `Con ${entrada.toFixed(4)} m³ de materia prima el tope de rendimiento (${RENDIMIENTO_TOPE_PCT} %) ` +
            `permite ${tope.toFixed(4)} m³; estás declarando ${campos.quantity}.`,
          "RENDIMIENTO_SOBRE_TOPE",
        );
      }
    }

    /* Los paquetes son el DETALLE de lo declarado: si suman otra cosa, uno de
       los dos números está mal y no se puede saber cuál. `≤` no alcanza acá —no
       es una atribución parcial, es la misma cantidad contada de dos maneras—,
       pero la tolerancia es la del negocio (un litro), no la del float. */
    const paquetes = campos.paquetes ?? [];
    if (paquetes.length > 0) {
      const suma = Math.round(paquetes.reduce((a, p) => a + (Number(p.volumenM3) || 0), 0) * 10000) / 10000;
      if (Math.abs(suma - campos.quantity) > 0.001) {
        throw new CtpInvariantError(
          `Los paquetes suman ${suma} y la producción declara ${campos.quantity}: tienen que ser lo mismo.`,
          "PAQUETES_NO_CUADRAN",
        );
      }
      const repetido = paquetes.find((p, i) => paquetes.findIndex((q) => q.codigo.trim() === p.codigo.trim()) !== i);
      if (repetido) {
        throw new CtpInvariantError(
          `El código de paquete «${repetido.codigo}» está dos veces: es lo que se busca en la pila, no puede repetirse.`,
          "PAQUETE_DUPLICADO",
        );
      }
      /* Y contra los que ya existen en la planta: el índice es por tenant, así
         que el choque con OTRA corrida volvía como 500 sin explicación. */
      await ForestCtpDB.assertCodigosLibres(tenantId, paquetes.map((p) => p.codigo));
    }

    const inVol = actual.volumeInputM3 != null ? Number(actual.volumeInputM3) : 0;
    const rendimiento =
      inVol > 0 && campos.unit === "m3" ? Math.round((campos.quantity / inVol) * 10000) / 100 : null;

    const entry = await prisma.forestCtpEntry.update({
      where: { id, tenantId } satisfies Prisma.ForestCtpEntryWhereUniqueInput,
      data: {
        productType: campos.productType?.trim() || null,
        presentacion: campos.presentacion?.trim() || null,
        quantity: campos.quantity,
        unit: campos.unit,
        pieces: campos.pieces ?? null,
        codigoProducto: campos.codigoProducto?.trim() || null,
        lineaProduccion: campos.lineaProduccion?.trim() || "LP",
        rendimientoPct: rendimiento,
        /* La nota del consumo («producción por declarar») deja de ser cierta: se
           reemplaza si el operador escribió una, y si no se limpia el aviso. */
        observations: campos.observations?.trim() || null,
        ...(paquetes.length > 0
          ? {
              /* `create` y no `set`: la corrida se declara una sola vez (más
                 arriba se rechaza la que ya declaró), así que no hay paquetes
                 viejos que reemplazar. */
              paquetes: {
                create: paquetes.map((p) => ({
                  tenantId,
                  codigo: p.codigo.trim(),
                  productType: p.productType?.trim() || campos.productType?.trim() || null,
                  presentacion: p.presentacion?.trim() || campos.presentacion?.trim() || null,
                  cantidad: Math.max(0, Math.round(p.cantidad)),
                  unit: campos.unit,
                  volumenM3: p.volumenM3,
                  espesorCm: p.espesorCm ?? null,
                  anchoCm: p.anchoCm ?? null,
                  largoM: p.largoM ?? null,
                  observations: p.observations?.trim() || null,
                  createdBy: user,
                })),
              },
            }
          : {}),
      },
    });
    auditCtp({
      tenantId,
      action: "ctp_linea_produccion_declarada",
      entity: "ForestCtpEntry",
      entityId: id,
      detail:
        `Declaró la producción de la corrida #${entry.lineNo}: ${campos.quantity} ${campos.unit}` +
        (paquetes.length > 0 ? ` en ${paquetes.length} paquete(s)` : "") +
        (rendimiento != null ? ` · rendimiento ${rendimiento}%` : ""),
      user,
    });
    try { invalidateByPrefix(`${CACHE_PREFIX}:${tenantId}`); } catch { /* cache best-effort */ }
    return entry;
  }

  /**
   * LAS MEDIDAS DE SIEMPRE: los paquetes que este aserradero más declara.
   *
   * Cada turno se retipean las mismas dimensiones —2.5 × 20 cm × 3 m, otra vez—
   * y tipear cuatro números con guantes es donde se pierde el tiempo y donde
   * entran los errores. En vez de inventar un catálogo que alguien tendría que
   * mantener, se leen del propio libro: lo que más se produjo ES la plantilla.
   *
   * Sólo combinaciones DIMENSIONADAS y de corridas vivas: un paquete sin medidas
   * no ahorra tipeo, y uno de una corrida anulada no representa lo que la planta
   * hace hoy.
   */
  /**
   * Los códigos de paquete que la planta ya usó, los más nuevos primero.
   *
   * Alimenta `sugerirCodigoPaquete()`: el índice es `@@unique[tenantId, codigo]`,
   * así que sugerir «el siguiente de esta corrida» chocaba con la corrida de al
   * lado. Se leen los últimos —no todos— porque la serie vive en la cola: un
   * aserradero con 40.000 paquetes numera sobre los últimos, no sobre el primero.
   *
   * Van los BORRADOS también: el índice tampoco los filtra, y un código
   * propuesto que revienta contra un paquete borrado es igual de inservible.
   */
  /**
   * TODOS los códigos de paquete en uso, plegados a minúsculas.
   *
   * Distinto de `codigosDePaquete`, que trae los últimos 200 para proponer el
   * siguiente en la pantalla: acá se necesita la lista completa para saber si
   * un código del archivo choca con uno existente. Son cadenas cortas; traer
   * cinco mil no pesa nada al lado de perder una línea del libro.
   */
  static async codigosDePaqueteEnUso(tenantId: string): Promise<Set<string>> {
    if (!tenantId) throw new Error("tenantId is required");
    const filas = await prisma.forestCtpPaquete.findMany({
      where: { tenantId },
      select: { codigo: true },
    });
    return new Set(filas.map((f) => f.codigo.trim().toLowerCase()));
  }

  static async codigosDePaquete(tenantId: string, limite = 200): Promise<string[]> {
    if (!tenantId) throw new Error("tenantId is required");
    const filas = await prisma.forestCtpPaquete.findMany({
      where: { tenantId },
      select: { codigo: true },
      orderBy: { createdAt: "desc" },
      take: Math.min(Math.max(limite, 1), 500),
    });
    return filas.map((f) => f.codigo);
  }

  /**
   * BUSCAR UN PAQUETE POR SU CÓDIGO — el círculo completo (ADR-366).
   *
   * Alguien tiene un atado delante y lee el cartel: `PQ-0290`. La pregunta que
   * sigue es siempre la misma —«¿de dónde salió esto?»— y hasta ahora el libro
   * no la podía contestar: el código vivía dentro de la corrida y no había por
   * dónde entrar. Es la misma pregunta que `CtpBuscarGtf` ya contesta para una
   * guía, del otro extremo de la cadena.
   *
   * Devuelve el paquete con **su corrida y el saldo de esa corrida** (de
   * `saldosDeCorridas`, la única fuente — ADR-316). Y cuando la búsqueda cae en
   * UNO solo, suma la cadena hacia atrás: las trozas que entraron a esa corrida
   * y las guías que las ampararon. Un solo viaje para la pregunta entera.
   *
   * ⚠️ El saldo es de la CORRIDA, no del paquete (ADR-362): el libro no sabe
   * cuál de los atados salió, sabe cuántos m³ salieron. Decir «este paquete está
   * despachado» sería inventar un dato.
   */
  static async buscarPaquetes(tenantId: string, texto: string) {
    if (!tenantId) throw new Error("tenantId is required");
    const q = texto.trim();
    if (!q) return { resultados: [], trozas: [], guias: [] };

    const paquetes = await prisma.forestCtpPaquete.findMany({
      where: {
        tenantId,
        deletedAt: null,
        /* Exacto primero, pero se acepta el parcial: en el patio se lee «290» de
           un cartel embarrado y con eso hay que poder encontrarlo. */
        codigo: { contains: q, mode: "insensitive" },
        entry: { deletedAt: null },
      },
      orderBy: [{ createdAt: "desc" }],
      take: 20,
      include: {
        entry: {
          select: {
            id: true, lineNo: true, entryDate: true, section: true, status: true,
            speciesCommon: true, speciesScientific: true, productType: true, presentacion: true,
            quantity: true, unit: true, volumeInputM3: true, rendimientoPct: true,
            materiaPrimaRef: true, lineaProduccion: true, observations: true,
          },
        },
      },
    });
    if (paquetes.length === 0) return { resultados: [], trozas: [], guias: [] };

    /* El exacto manda: buscar «PQ-1» no puede enterrar a PQ-1 debajo de PQ-10. */
    const exacto = (c: string) => c.trim().toLowerCase() === q.toLowerCase();
    paquetes.sort((a, b) => Number(exacto(b.codigo)) - Number(exacto(a.codigo)));

    const saldos = await saldosDeCorridas(prisma, tenantId, [...new Set(paquetes.map((p) => p.ctpEntryId))]);
    const num = (v: unknown) => (v == null ? null : Number(v));
    const resultados = paquetes.map((p) => {
      const s = saldos.get(p.ctpEntryId);
      return {
        id: p.id,
        codigo: p.codigo,
        productType: p.productType,
        presentacion: p.presentacion,
        cantidad: p.cantidad,
        volumenM3: num(p.volumenM3),
        espesorCm: num(p.espesorCm),
        anchoCm: num(p.anchoCm),
        largoM: num(p.largoM),
        observations: p.observations,
        createdAt: p.createdAt,
        corrida: {
          id: p.entry.id,
          lineNo: p.entry.lineNo,
          entryDate: p.entry.entryDate,
          status: p.entry.status,
          speciesCommon: p.entry.speciesCommon,
          speciesScientific: p.entry.speciesScientific,
          productType: p.entry.productType,
          unit: p.entry.unit,
          quantity: num(p.entry.quantity),
          volumeInputM3: num(p.entry.volumeInputM3),
          rendimientoPct: num(p.entry.rendimientoPct),
          lote: p.entry.materiaPrimaRef,
          lineaProduccion: p.entry.lineaProduccion,
        },
        /* De la corrida, no del paquete: el libro no sabe cuál atado salió. */
        saldoCorrida: {
          producido: s?.producido ?? 0,
          despachado: s?.despachado ?? 0,
          reprocesado: s?.reprocesado ?? 0,
          disponible: s?.disponible ?? 0,
        },
      };
    });

    /* La cadena hacia atrás sólo cuando la búsqueda cayó en uno: con veinte
       resultados serían veinte lecturas del patio para algo que nadie mira. */
    if (resultados.length !== 1) return { resultados, trozas: [], guias: [] };
    const corridaId = paquetes[0].ctpEntryId;
    const [trozas, consumos] = await Promise.all([
      WoodEntriesDB.trozasDeCorrida(tenantId, corridaId),
      ForestCtpConsumoDB.listByEntry(tenantId, corridaId),
    ]);
    return {
      resultados,
      trozas,
      guias: consumos.map((c) => ({
        woodEntryId: c.woodEntryId,
        volumeM3: num(c.volumeM3),
        gtfNumber: c.woodEntry?.gtfNumber ?? null,
        especie: c.woodEntry?.speciesCommonName ?? null,
        fechaIngreso: c.woodEntry?.entryDate ?? null,
      })),
    };
  }

  static async medidasFrecuentes(
    tenantId: string,
    opts: { limite?: number; producto?: string } = {},
  ): Promise<
    {
      productType: string | null;
      presentacion: string | null;
      espesorCm: number;
      anchoCm: number;
      largoM: number;
      veces: number;
    }[]
  > {
    if (!tenantId) throw new Error("tenantId is required");
    const filas = await prisma.forestCtpPaquete.groupBy({
      by: ["productType", "presentacion", "espesorCm", "anchoCm", "largoM"],
      where: {
        tenantId,
        espesorCm: { not: null },
        anchoCm: { not: null },
        largoM: { not: null },
        /* Las de ESE producto cuando se pide: «las de siempre» mezcladas hacen
           que el que declara listones vea las medidas de la paquetería. */
        ...(opts.producto?.trim() ? { productType: opts.producto.trim() } : {}),
        entry: { deletedAt: null, status: "registrado" },
      },
      _count: { _all: true },
      orderBy: { _count: { id: "desc" } },
      take: Math.min(Math.max(opts.limite ?? 6, 1), 20),
    });
    return filas
      .filter((f) => f.espesorCm != null && f.anchoCm != null && f.largoM != null)
      .map((f) => ({
        productType: f.productType,
        presentacion: f.presentacion,
        espesorCm: Number(f.espesorCm),
        anchoCm: Number(f.anchoCm),
        largoM: Number(f.largoM),
        veces: f._count._all,
      }));
  }

  static async annul(tenantId: string, id: string, reason: string, user = "unknown") {
    if (!tenantId) throw new Error("tenantId is required");
    if (!reason?.trim()) throw new Error("reason is required");
    // Cierre de período (ADR-139): una línea de un mes cerrado no se anula.
    const curAnnul = await prisma.forestCtpEntry.findFirst({ where: { id, tenantId }, select: { entryDate: true } });
    const cerradoAnnul = curAnnul ? await ForestCtpCierreDB.closedPeriodOf(tenantId, curAnnul.entryDate) : null;
    if (cerradoAnnul) {
      throw new CtpInvariantError(
        `El período ${cerradoAnnul.label} está cerrado: no se puede anular una línea de un mes cerrado. Reabrí el período para corregir.`,
        "PERIODO_CERRADO",
        { periodKey: cerradoAnnul.periodKey },
      );
    }
    const e = await prisma.forestCtpEntry.update({
      where: { id, tenantId } satisfies Prisma.ForestCtpEntryWhereUniqueInput,
      data: { status: "anulado", annulledReason: reason.trim() },
    });
    // Las piezas vuelven al patio (ADR-326). Anular una corrida deshace el
    // consumo: en la realidad esa madera está ahí y se va a asserar en otra. Sin
    // esto quedaban marcadas "ya consumida" para siempre y nadie podía usarlas.
    await prisma.woodEntryTroza.updateMany({
      where: { tenantId, consumidaEnId: id },
      data: { consumidaEnId: null, fechaConsumo: null },
    });
    /* Y las que salieron SIN ASERRAR (ADR-363): anular el despacho es decir que
       ese camión no salió, así que la madera sigue en el patio. Sin esto la
       pieza quedaba marcada "ya despachada" para siempre. */
    await prisma.woodEntryTroza.updateMany({
      where: { tenantId, despachadaEnId: id },
      data: { despachadaEnId: null, fechaDespacho: null },
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
    const curDel = await prisma.forestCtpEntry.findFirst({ where: { id, tenantId }, select: { entryDate: true } });
    const cerradoDel = curDel ? await ForestCtpCierreDB.closedPeriodOf(tenantId, curDel.entryDate) : null;
    if (cerradoDel) {
      throw new CtpInvariantError(
        `El período ${cerradoDel.label} está cerrado: no se puede eliminar una línea de un mes cerrado.`,
        "PERIODO_CERRADO",
        { periodKey: cerradoDel.periodKey },
      );
    }
    const e = await prisma.forestCtpEntry.update({
      where: { id, tenantId } satisfies Prisma.ForestCtpEntryWhereUniqueInput,
      data: { deletedAt: new Date() },
    });
    // Igual que al anular: la FK es SET NULL al DELETE real, que acá nunca pasa
    // (es soft-delete), así que las piezas hay que soltarlas a mano.
    await prisma.woodEntryTroza.updateMany({
      where: { tenantId, consumidaEnId: id },
      data: { consumidaEnId: null, fechaConsumo: null },
    });
    /* Y las que salieron SIN ASERRAR (ADR-363): anular el despacho es decir que
       ese camión no salió, así que la madera sigue en el patio. Sin esto la
       pieza quedaba marcada "ya despachada" para siempre. */
    await prisma.woodEntryTroza.updateMany({
      where: { tenantId, despachadaEnId: id },
      data: { despachadaEnId: null, fechaDespacho: null },
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
  /**
   * PRODUCTOS DISPONIBLES: lo aserrado que todavía está en la planta (ADR-349).
   *
   * Una corrida de producción con saldo es producto que existe: se puede
   * despachar, reprocesar o mostrar en la pila. El saldo NO se recalcula acá —lo
   * da `saldosDeCorridas`, la única fuente (ADR-316)— y los **paquetes** son su
   * detalle: código, presentación y dimensiones para encontrarlo.
   *
   * Se listan sólo las corridas con `disponible > 0`: un producto agotado no es
   * un producto disponible con cero, es uno que ya no está.
   *
   * ⚠️ **No se filtra por período, y es a propósito.** Lo disponible es una FOTO
   * del depósito, no un movimiento del mes: un paquete aserrado en 2024 que
   * nadie despachó sigue estando hoy en la pila. Con el filtro puesto, un libro
   * abierto en "últimos 3 meses" mostraba 4 de 40 paquetes y el KPI declaraba
   * 8.9 m³ en vez de 34.7 — el dueño veía un depósito casi vacío que en la
   * realidad estaba lleno. El período sigue mandándose para acotar por fecha
   * cuando alguien lo pide EXPLÍCITAMENTE (`soloDelPeriodo`).
   */
  static async productosDisponibles(
    tenantId: string,
    opts: {
      fromDate?: Date;
      toDate?: Date;
      especie?: string;
      producto?: string;
      /** Acotar a lo producido en el período. Por omisión se ve TODO lo que hay. */
      soloDelPeriodo?: boolean;
    } = {},
  ) {
    if (!tenantId) throw new Error("tenantId is required");
    const where: Prisma.ForestCtpEntryWhereInput = {
      tenantId,
      section: "produccion",
      deletedAt: null,
      status: "registrado",
      /* Sin cantidad declarada no hay producto: es una corrida que consumió y
         todavía no dijo qué salió (ADR-340). */
      quantity: { not: null },
    };
    if (opts.soloDelPeriodo && (opts.fromDate || opts.toDate)) {
      where.entryDate = {
        ...(opts.fromDate ? { gte: opts.fromDate } : {}),
        ...(opts.toDate ? { lte: opts.toDate } : {}),
      };
    }
    if (opts.especie?.trim()) where.speciesCommon = { contains: opts.especie.trim(), mode: "insensitive" };
    if (opts.producto?.trim()) where.productType = { contains: opts.producto.trim(), mode: "insensitive" };

    const corridas = await prisma.forestCtpEntry.findMany({
      where,
      orderBy: [{ entryDate: "desc" }, { lineNo: "desc" }],
      take: 500,
      include: {
        paquetes: {
          where: { deletedAt: null },
          orderBy: { codigo: "asc" },
        },
        /* De qué guía y de qué título habilitante viene la madera de la corrida.
           Es lo que la GTF de salida declara como origen del recurso: sin esto,
           el picker de la guía puede decir "qué producto" pero no "de dónde
           salió", que es justo lo que compara un puesto de control. Se leen dos
           columnas del ingreso, no el ingreso entero. */
        consumos: {
          select: { woodEntry: { select: { gtfNumber: true, originCode: true } } },
        },
      },
    });
    if (corridas.length === 0) return { corridas: [], totales: { volumen: 0, paquetes: 0, corridas: 0 } };

    const saldos = await saldosDeCorridas(prisma, tenantId, corridas.map((c) => c.id));

    const conSaldo = corridas
      .map((c) => {
        const s = saldos.get(c.id);
        const disponible = s?.disponible ?? 0;
        /* Únicos y en orden de aparición: una corrida mezcla guías (ADR-134) y
           repetir "1-19-0313629" cinco veces no agrega información. Si la
           corrida se cargó a mano, queda el resumen de texto `gtfIngreso`. */
        const gtfOrigen = [
          ...new Set(
            c.consumos
              .map((x) => (x.woodEntry?.gtfNumber ?? "").trim())
              .filter(Boolean),
          ),
        ];
        const titularOrigen = [
          ...new Set(
            c.consumos
              .map((x) => (x.woodEntry?.originCode ?? "").trim())
              .filter(Boolean),
          ),
        ];
        return {
          id: c.id,
          lineNo: c.lineNo,
          fecha: c.entryDate.toISOString(),
          especie: c.speciesCommon,
          especieCientifica: c.speciesScientific,
          /** La guía de salida marca la especie protegida: es legal CON permiso. */
          cites: c.cites,
          producto: c.productType,
          presentacion: c.presentacion,
          unidad: c.unit,
          lote: c.materiaPrimaRef,
          lineaProduccion: c.lineaProduccion,
          /** GTF de ingreso de la materia prima que alimentó la corrida. */
          gtfOrigen: gtfOrigen.length > 0 ? gtfOrigen : (c.gtfIngreso ? [c.gtfIngreso] : []),
          /** Título habilitante / plan de manejo del que salió esa madera. */
          titularOrigen,
          rendimientoPct: c.rendimientoPct != null ? Number(c.rendimientoPct) : null,
          producido: s?.producido ?? 0,
          despachado: s?.despachado ?? 0,
          reprocesado: s?.reprocesado ?? 0,
          disponible,
          paquetes: c.paquetes.map((p) => ({
            id: p.id,
            codigo: p.codigo,
            producto: p.productType,
            presentacion: p.presentacion,
            cantidad: p.cantidad,
            volumenM3: Number(p.volumenM3),
            espesorCm: p.espesorCm != null ? Number(p.espesorCm) : null,
            anchoCm: p.anchoCm != null ? Number(p.anchoCm) : null,
            largoM: p.largoM != null ? Number(p.largoM) : null,
            observations: p.observations,
          })),
        };
      })
      .filter((c) => c.disponible > 0);

    return {
      corridas: conSaldo,
      totales: {
        volumen: Math.round(conSaldo.reduce((a, c) => a + c.disponible, 0) * 10000) / 10000,
        paquetes: conSaldo.reduce((a, c) => a + c.paquetes.length, 0),
        corridas: conSaldo.length,
      },
    };
  }

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

    const [ingresos, ctp, trozasFuera] = await Promise.all([
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
      /* La madera que salió SIN ASERRAR (ADR-363) también dejó el patio, pero no
         pasó por ninguna corrida: si no se resta acá, el saldo de materia prima
         declara madera que ya se fue en un camión. Se filtra por el DESPACHO
         vivo y por su fecha, no por la del ingreso: es cuando salió. */
      prisma.woodEntryTroza.findMany({
        where: {
          tenantId,
          despachadaEnId: { not: null },
          despachadaEn: { deletedAt: null, status: "registrado", ...(range ? { entryDate: range } : {}) },
        },
        select: { volumenM3: true, especieComun: true, entry: { select: { speciesCommonName: true } } },
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
          despachadoDirectoM3: 0,
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

    /* Lo que se fue en rollo, por especie. La especie viaja EN LA TROZA (una
       guía puede mezclar), con el ingreso como respaldo cuando la pieza no la
       declara. */
    let despachadoDirectoM3 = 0;
    for (const t of trozasFuera) {
      const vol = Number(t.volumenM3 ?? 0);
      if (!(vol > 0)) continue;
      bucket(t.especieComun ?? t.entry.speciesCommonName).despachadoDirectoM3 += vol;
      despachadoDirectoM3 += vol;
    }

    const porEspecie = [...bySpecies.values()]
      .map((b) => ({
        ...b,
        ingresoM3: r4(b.ingresoM3),
        pendienteM3: r4(b.pendienteM3),
        consumidoM3: r4(b.consumidoM3),
        despachadoDirectoM3: r4(b.despachadoDirectoM3),
        saldoM3: r4(b.ingresoM3 - b.consumidoM3 - b.despachadoDirectoM3),
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
        despachadoDirectoM3: r4(despachadoDirectoM3),
        saldoM3: r4(ingresoM3 - consumidoM3 - despachadoDirectoM3),
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
   * Existencia heredada al INICIO del período — el punto de partida de todo
   * rollforward (ADR-139).
   *
   * Sale del cierre inmediatamente anterior (snapshot congelado, que es el dato
   * declarado) o, si no hay cierre previo, del acumulado hasta el instante antes
   * del inicio. Sin `fromDate` no hay apertura: el período abarca todo.
   *
   * Vive acá y no dentro de `conciliacionPeriodo` porque la conciliación y la
   * curva de saldo tienen que arrancar EXACTAMENTE del mismo número: dos
   * aperturas calculadas por separado se desincronizan en cuanto una cambia, y
   * la pantalla mostraría dos gráficos que se contradicen.
   */
  private static async aperturaDePeriodo(
    tenantId: string,
    fromDate?: Date,
  ): Promise<{
    fuenteApertura: ConciliacionPeriodo["fuenteApertura"];
    aperturaLabel: string | null;
    materiaPrima: { especie: string; cites: boolean; existencia: number }[];
    productos: { producto: string; existencia: number }[];
  }> {
    const materiaPrima: { especie: string; cites: boolean; existencia: number }[] = [];
    const productos: { producto: string; existencia: number }[] = [];
    if (!fromDate) return { fuenteApertura: "sin_apertura", aperturaLabel: null, materiaPrima, productos };

    const cierres = await ForestCtpCierreDB.list(tenantId);
    const prev = cierres
      .filter((c) => !c.reabierto && new Date(c.to).getTime() < fromDate.getTime())
      .sort((a, b) => new Date(b.to).getTime() - new Date(a.to).getTime())[0];
    if (prev) {
      for (const m of prev.saldoCierre.materiaPrima) materiaPrima.push({ especie: m.especie, cites: m.cites, existencia: m.existenciaM3 });
      for (const p of prev.saldoCierre.productos) productos.push({ producto: p.producto, existencia: p.existencia });
      return { fuenteApertura: "cierre", aperturaLabel: prev.label, materiaPrima, productos };
    }

    const acum = await ForestCtpDB.saldos(tenantId, { toDate: new Date(fromDate.getTime() - 1) });
    for (const e of acum.porEspecie) materiaPrima.push({ especie: e.especie, cites: e.cites, existencia: e.saldoM3 });
    for (const p of acum.productos) productos.push({ producto: p.producto, existencia: p.stock });
    return { fuenteApertura: "calculada", aperturaLabel: null, materiaPrima, productos };
  }

  /**
   * Conciliación del período (ADR-139 rollforward): existencia de APERTURA + movimientos =
   * existencia FINAL, por especie y por producto. La apertura sale del cierre
   * inmediatamente anterior (snapshot congelado) o, si no hay cierre previo, se
   * calcula acumulada hasta el inicio del período. Cierra el bug de que un saldo
   * mensual ignoraba el stock heredado y no cuadraba ante un fiscalizador.
   */
  static async conciliacionPeriodo(tenantId: string, opts: { fromDate?: Date; toDate?: Date } = {}): Promise<ConciliacionPeriodo> {
    if (!tenantId) throw new Error("tenantId is required");

    const mov = await ForestCtpDB.saldos(tenantId, opts);

    // ── Apertura ──────────────────────────────────────────────────────────
    const { fuenteApertura, aperturaLabel, materiaPrima: aperturaMP, productos: aperturaProd } =
      await ForestCtpDB.aperturaDePeriodo(tenantId, opts.fromDate);

    // ── Combinar apertura + movimientos → final (materia prima) ───────────
    const mp = new Map<string, { label: string; cites: boolean; apertura: number; ingreso: number; consumido: number }>();
    const mpKey = (s: string) => s.trim().toLowerCase();
    const mpUpsert = (especie: string, cites: boolean) => {
      const key = mpKey(especie);
      let x = mp.get(key);
      if (!x) { x = { label: especie, cites, apertura: 0, ingreso: 0, consumido: 0 }; mp.set(key, x); }
      if (cites) x.cites = true;
      return x;
    };
    for (const a of aperturaMP) mpUpsert(a.especie, a.cites).apertura = a.existencia;
    for (const e of mov.porEspecie) { const x = mpUpsert(e.especie, e.cites); x.ingreso = e.ingresoM3; x.consumido = e.consumidoM3; }

    const materiaPrima = [...mp.values()]
      .map((x) => { const final = r4(x.apertura + x.ingreso - x.consumido); return { especie: x.label, cites: x.cites, apertura: r4(x.apertura), ingreso: r4(x.ingreso), consumido: r4(x.consumido), final, negativa: final < 0 }; })
      .sort((a, b) => (a.negativa === b.negativa ? b.final - a.final : a.negativa ? -1 : 1));

    // ── Combinar apertura + movimientos → final (productos) ───────────────
    const pr = new Map<string, { producto: string; apertura: number; producido: number; despachado: number }>();
    const prUpsert = (producto: string) => {
      let x = pr.get(producto);
      if (!x) { x = { producto, apertura: 0, producido: 0, despachado: 0 }; pr.set(producto, x); }
      return x;
    };
    for (const a of aperturaProd) prUpsert(a.producto).apertura = a.existencia;
    for (const p of mov.productos) { const x = prUpsert(p.producto); x.producido = p.producido; x.despachado = p.despachado; }

    const productos = [...pr.values()]
      .map((x) => { const final = r4(x.apertura + x.producido - x.despachado); return { producto: x.producto, apertura: r4(x.apertura), producido: r4(x.producido), despachado: r4(x.despachado), final, negativo: final < 0 }; })
      .sort((a, b) => b.final - a.final);

    return { fuenteApertura, aperturaLabel, materiaPrima, productos };
  }

  /**
   * Curva del saldo de materia prima a lo largo del período.
   *
   * Los KPIs y la cascada dan una FOTO: cuánto hay hoy y de dónde salió. Lo que
   * no contestaban es la pregunta de planificación —«¿el patio se está llenando
   * o vaciando?»—, que sólo se ve con el saldo dibujado en el tiempo. Un patio
   * que baja 3 m³ por semana y uno que sube 3 muestran el mismo total de hoy.
   *
   * Arranca en la apertura del período (misma fuente que la conciliación) y
   * acumula ingresos validados − consumo de producción, con los mismos filtros
   * que `saldos()`: el último punto DEBE dar `apertura + saldoM3` del período.
   * Si no cuadra, uno de los dos está mal.
   *
   * La granularidad la elige la longitud del período: 90 puntos diarios se leen,
   * 900 son una mancha. Sin snapshots ni tabla nueva — derivado de las fechas.
   */
  static async curvaSaldo(tenantId: string, opts: { fromDate?: Date; toDate?: Date } = {}): Promise<CurvaSaldo> {
    if (!tenantId) throw new Error("tenantId is required");

    const range = dateRange(opts);
    // Mismos predicados que `saldos()`: la madera `pendiente` NO es saldo (está
    // en el patio pero no validada), así que tampoco mueve la curva.
    const woodWhere: Prisma.WoodEntryWhereInput = { tenantId, deletedAt: null, status: { in: ["validado", "procesado"] } };
    const prodWhere: Prisma.ForestCtpEntryWhereInput = { tenantId, deletedAt: null, status: "registrado", section: "produccion" };
    if (range) { woodWhere.entryDate = range; prodWhere.entryDate = range; }

    const [ap, ingresos, corridas] = await Promise.all([
      ForestCtpDB.aperturaDePeriodo(tenantId, opts.fromDate),
      prisma.woodEntry.findMany({ where: woodWhere, select: { entryDate: true, volumeM3: true } }),
      prisma.forestCtpEntry.findMany({ where: prodWhere, select: { entryDate: true, volumeInputM3: true } }),
    ]);

    const apertura = r4(ap.materiaPrima.reduce((a, m) => a + m.existencia, 0));
    const vacia: CurvaSaldo = {
      apertura, fuenteApertura: ap.fuenteApertura, aperturaLabel: ap.aperturaLabel,
      paso: "dia", puntos: [], final: apertura, pico: null, valle: null,
    };

    const marcas = [...ingresos.map((i) => i.entryDate), ...corridas.map((c) => c.entryDate)];
    if (!marcas.length && !opts.fromDate) return vacia;
    const msMin = marcas.length ? Math.min(...marcas.map((d) => d.getTime())) : Number.POSITIVE_INFINITY;
    const msMax = marcas.length ? Math.max(...marcas.map((d) => d.getTime())) : Number.NEGATIVE_INFINITY;
    // El eje arranca en el inicio del período aunque los primeros días estén
    // vacíos: si empezara en el primer movimiento, la curva escondería una
    // semana sin ingresos, que es justo lo que hay que ver.
    const desde = opts.fromDate ?? new Date(msMin);
    // El eje no dibuja el futuro: un patio no tiene existencia mañana. Sin este
    // recorte, "mes actual" mostraba 27 días de línea plana y el trimestre
    // cerraba en un 1-de-septiembre vacío (el `to` local en UTC cae al día
    // siguiente). Si hay un movimiento cargado con fecha futura sí se dibuja
    // —está en el libro—, pero no se inventa una meseta hasta fin de mes.
    const finPeriodo = opts.toDate?.getTime() ?? (marcas.length ? msMax : Date.now());
    const tope = Math.min(finPeriodo, Date.now());
    const hasta = new Date(marcas.length ? Math.max(tope, msMax) : tope);
    if (hasta.getTime() < desde.getTime()) return vacia;

    const span = Math.floor((hasta.getTime() - desde.getTime()) / 86_400_000) + 1;
    const paso: CurvaSaldo["paso"] = span <= 120 ? "dia" : span <= 730 ? "semana" : "mes";
    const inicioDe = (d: Date): Date => {
      const u = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
      if (paso === "mes") return new Date(Date.UTC(u.getUTCFullYear(), u.getUTCMonth(), 1));
      if (paso === "semana") { u.setUTCDate(u.getUTCDate() - ((u.getUTCDay() + 6) % 7)); return u; } // lunes
      return u;
    };
    const avanzar = (d: Date): Date => {
      const n = new Date(d.getTime());
      if (paso === "mes") n.setUTCMonth(n.getUTCMonth() + 1);
      else n.setUTCDate(n.getUTCDate() + (paso === "semana" ? 7 : 1));
      return n;
    };
    const clave = (d: Date) => inicioDe(d).toISOString().slice(0, 10);

    const cubos = new Map<string, { ingreso: number; consumo: number }>();
    const orden: string[] = [];
    // Tope duro: con "mes" un período de 30 años da 360 puntos. Más que eso es
    // data corrupta, no un libro — se corta en vez de colgar la pantalla.
    for (let c = inicioDe(desde), fin = inicioDe(hasta); c.getTime() <= fin.getTime() && orden.length < 400; c = avanzar(c)) {
      const k = c.toISOString().slice(0, 10);
      cubos.set(k, { ingreso: 0, consumo: 0 });
      orden.push(k);
    }
    if (!orden.length) return vacia;

    // Un movimiento fuera de la ventana dibujada (o pasado el tope) se imputa al
    // extremo más cercano: descartarlo dejaría la curva sin cerrar en el saldo real.
    const dentro = (k: string) => (cubos.has(k) ? k : k < orden[0] ? orden[0] : orden[orden.length - 1]);
    for (const i of ingresos) cubos.get(dentro(clave(i.entryDate)))!.ingreso += Number(i.volumeM3 ?? 0);
    for (const c of corridas) cubos.get(dentro(clave(c.entryDate)))!.consumo += Number(c.volumeInputM3 ?? 0);

    let saldo = apertura;
    const puntos = orden.map((fecha) => {
      const b = cubos.get(fecha)!;
      saldo = r4(saldo + b.ingreso - b.consumo);
      return { fecha, ingreso: r4(b.ingreso), consumo: r4(b.consumo), saldo };
    });

    const pico = puntos.reduce((m, p) => (m == null || p.saldo > m.saldo ? p : m), null as (typeof puntos)[number] | null);
    const valle = puntos.reduce((m, p) => (m == null || p.saldo < m.saldo ? p : m), null as (typeof puntos)[number] | null);
    return {
      apertura, fuenteApertura: ap.fuenteApertura, aperturaLabel: ap.aperturaLabel, paso, puntos,
      final: saldo,
      pico: pico ? { fecha: pico.fecha, saldo: pico.saldo } : null,
      valle: valle ? { fecha: valle.fecha, saldo: valle.saldo } : null,
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

  /**
   * Grafo de la cadena de custodia del período: 3 capas (ingresos → corridas →
   * despachos) con sus enlaces (consumos / orígenes). Es la versión visual de
   * las mismas tablas puente que enforcean I1–I5; el Radar de trazabilidad lo
   * dibuja. Read-only. Los edges se filtran a endpoints VIVOS (soft-delete no
   * cascada) para no dibujar líneas colgando de un nodo que ya no está.
   */
  static async grafoTrazabilidad(tenantId: string, opts: { fromDate?: Date; toDate?: Date } = {}): Promise<TrazaGrafo> {
    if (!tenantId) throw new Error("tenantId is required");
    const range = dateRange(opts);
    const woodWhere: Prisma.WoodEntryWhereInput = {
      tenantId, deletedAt: null, status: { in: ["validado", "procesado", "pendiente"] },
    };
    const ctpWhere: Prisma.ForestCtpEntryWhereInput = { tenantId, deletedAt: null, status: "registrado" };
    if (range) { woodWhere.entryDate = range; ctpWhere.entryDate = range; }

    const [ing, ctp] = await Promise.all([
      prisma.woodEntry.findMany({
        where: woodWhere,
        /* Los casilleros que la Sección 2 pinta por ingreso viajan ACÁ (ADR-347).
           Antes la vista pedía `wood-entries?limit=5000` sólo para completarlos:
           traía el ingreso entero —notas, fotos, GTF de SERFOR— de miles de
           filas para leerle seis campos. */
        select: {
          id: true, gtfNumber: true, speciesCommonName: true, volumeM3: true,
          speciesCites: true, entryDate: true,
          productType: true, speciesScientificName: true, originCode: true,
          ctpProductCode: true, originSourceNumber: true, unit: true,
          // `originType` es lo que distingue una concesión de un permiso: el
          // radar lo necesita para etiquetar la columna del título habilitante,
          // que es el eslabón que va ANTES de la GTF (EUDR pide llegar al monte).
          originType: true,
        },
        orderBy: { entryDate: "asc" }, take: 300,
      }),
      prisma.forestCtpEntry.findMany({
        where: ctpWhere,
        select: { id: true, section: true, lineNo: true, productType: true, speciesCommon: true, quantity: true, unit: true, destino: true, gtfNumber: true, cites: true, entryDate: true, observations: true },
        orderBy: { lineNo: "asc" }, take: 300,
      }),
    ]);
    const corridas = ctp.filter((e) => e.section === "produccion");
    const despachos = ctp.filter((e) => e.section === "despacho");
    const ingIds = new Set(ing.map((w) => w.id));
    const corridaIds = corridas.map((c) => c.id);
    const despachoIds = despachos.map((d) => d.id);

    const [consumos, origenes] = await Promise.all([
      corridaIds.length
        ? prisma.forestCtpConsumo.findMany({ where: { tenantId, ctpEntryId: { in: corridaIds } }, select: { woodEntryId: true, ctpEntryId: true, volumeM3: true } })
        : Promise.resolve([]),
      despachoIds.length
        ? prisma.forestCtpDespachoOrigen.findMany({ where: { tenantId, despachoEntryId: { in: despachoIds } }, select: { produccionEntryId: true, despachoEntryId: true, quantity: true } })
        : Promise.resolve([]),
    ]);
    const corridaIdSet = new Set(corridaIds);

    return {
      ingresos: ing.map((w) => ({
        id: w.id, gtf: w.gtfNumber, species: w.speciesCommonName,
        volumeM3: Number(w.volumeM3 ?? 0), cites: w.speciesCites, fecha: w.entryDate.toISOString(),
        productType: w.productType, speciesScientificName: w.speciesScientificName,
        originCode: w.originCode, ctpProductCode: w.ctpProductCode,
        originSourceNumber: w.originSourceNumber, unit: w.unit,
        originType: w.originType,
      })),
      corridas: corridas.map((c) => ({ id: c.id, lineNo: c.lineNo, label: `${c.productType ?? "—"} · ${c.speciesCommon ?? "—"}`, quantity: Number(c.quantity ?? 0), unit: c.unit, cites: c.cites, productType: c.productType, species: c.speciesCommon, fecha: c.entryDate.toISOString(), observations: c.observations })),
      despachos: despachos.map((d) => ({ id: d.id, lineNo: d.lineNo, label: `${d.productType ?? "—"} · ${d.speciesCommon ?? "—"}`, quantity: Number(d.quantity ?? 0), unit: d.unit, destino: d.destino, gtf: d.gtfNumber, fecha: d.entryDate.toISOString() })),
      // Edge sólo si ambos extremos siguen en el grafo (endpoint vivo).
      consumos: consumos
        .filter((c) => ingIds.has(c.woodEntryId) && corridaIdSet.has(c.ctpEntryId))
        .map((c) => ({ from: c.woodEntryId, to: c.ctpEntryId, volumeM3: Number(c.volumeM3 ?? 0) })),
      origenes: origenes
        .filter((o) => corridaIdSet.has(o.produccionEntryId))
        .map((o) => ({ from: o.produccionEntryId, to: o.despachoEntryId, quantity: Number(o.quantity ?? 0) })),
    };
  }

  /**
   * Kardex (cuenta corriente) de la materia prima de UNA especie: cada
   * movimiento cronológico con su saldo corriente. Es el detalle que forma el
   * saldo neto que muestra Saldos — un fiscalizador lo reconstruye a mano; acá
   * sale derecho. El saldo final coincide EXACTO con `saldos().porEspecie.saldoM3`
   * (mismos criterios: ingresos validado/procesado en +, volumeInputM3 de las
   * corridas de esa especie en −, misma `speciesKey` normalizada).
   */
  static async kardexEspecie(tenantId: string, especie: string, opts: { fromDate?: Date; toDate?: Date } = {}): Promise<KardexEspecie> {
    if (!tenantId) throw new Error("tenantId is required");
    const target = speciesKey(especie);
    const range = dateRange(opts);
    const woodWhere: Prisma.WoodEntryWhereInput = { tenantId, deletedAt: null, status: { in: ["validado", "procesado"] } };
    const prodWhere: Prisma.ForestCtpEntryWhereInput = { tenantId, deletedAt: null, status: "registrado", section: "produccion" };
    if (range) { woodWhere.entryDate = range; prodWhere.entryDate = range; }

    const [ingresos, corridas] = await Promise.all([
      prisma.woodEntry.findMany({ where: woodWhere, select: { entryDate: true, gtfNumber: true, speciesCommonName: true, volumeM3: true } }),
      prisma.forestCtpEntry.findMany({ where: prodWhere, select: { entryDate: true, lineNo: true, productType: true, speciesCommon: true, volumeInputM3: true } }),
    ]);

    const movs = [
      ...ingresos
        .filter((i) => speciesKey(i.speciesCommonName) === target)
        .map((i) => ({ fecha: i.entryDate, tipo: "ingreso" as const, doc: `GTF ${i.gtfNumber}`, entra: Number(i.volumeM3 ?? 0), sale: 0 })),
      ...corridas
        .filter((c) => speciesKey(c.speciesCommon) === target && c.volumeInputM3 != null)
        .map((c) => ({ fecha: c.entryDate, tipo: "consumo" as const, doc: `Corrida #${c.lineNo}${c.productType ? ` · ${c.productType}` : ""}`, entra: 0, sale: Number(c.volumeInputM3 ?? 0) })),
    ].sort((a, b) => a.fecha.getTime() - b.fecha.getTime());

    let saldo = 0;
    let ingresoTotal = 0;
    let consumoTotal = 0;
    const movimientos = movs.map((m) => {
      saldo = r4(saldo + m.entra - m.sale);
      ingresoTotal += m.entra;
      consumoTotal += m.sale;
      return { fecha: m.fecha, tipo: m.tipo, doc: m.doc, entra: r4(m.entra), sale: r4(m.sale), saldo };
    });
    return { especie, movimientos, ingresoTotal: r4(ingresoTotal), consumoTotal: r4(consumoTotal), saldo: r4(ingresoTotal - consumoTotal) };
  }

  /**
   * Reorden predictivo: por especie, cuántos DÍAS de materia prima quedan al
   * ritmo de consumo reciente. saldo actual (all-time) ÷ (consumo últimos 90
   * días / 90). null si la especie no se consume (no se agota) — no se inventa
   * una urgencia donde no la hay.
   */
  static async proyeccionReorden(tenantId: string): Promise<ReordenProyeccion[]> {
    if (!tenantId) throw new Error("tenantId is required");
    const desde = new Date(Date.now() - 90 * 86_400_000);
    const [ingresos, corridas] = await Promise.all([
      prisma.woodEntry.findMany({ where: { tenantId, deletedAt: null, status: { in: ["validado", "procesado"] } }, select: { speciesCommonName: true, speciesScientificName: true, speciesCites: true, volumeM3: true } }),
      prisma.forestCtpEntry.findMany({ where: { tenantId, deletedAt: null, status: "registrado", section: "produccion" }, select: { speciesCommon: true, volumeInputM3: true, entryDate: true } }),
    ]);
    const map = new Map<string, { especie: string; scientific: string | null; cites: boolean; ingreso: number; consumo: number; consumo90: number }>();
    const get = (raw: string | null, sci?: string | null, cites?: boolean) => {
      const k = speciesKey(raw);
      let m = map.get(k);
      if (!m) { m = { especie: raw?.trim() || "Sin especie", scientific: sci?.trim() || null, cites: false, ingreso: 0, consumo: 0, consumo90: 0 }; map.set(k, m); }
      if (sci && !m.scientific) m.scientific = sci.trim();
      if (cites) m.cites = true;
      return m;
    };
    for (const i of ingresos) get(i.speciesCommonName, i.speciesScientificName, i.speciesCites).ingreso += Number(i.volumeM3 ?? 0);
    for (const c of corridas) { const m = get(c.speciesCommon); const v = Number(c.volumeInputM3 ?? 0); m.consumo += v; if (c.entryDate >= desde) m.consumo90 += v; }
    return [...map.values()]
      .map((m) => {
        const saldo = r4(m.ingreso - m.consumo);
        const ratePorDia = m.consumo90 / 90;
        const diasHastaAgotar = ratePorDia > 0 && saldo > 0 ? Math.round(saldo / ratePorDia) : null;
        return { especie: m.especie, scientific: m.scientific, cites: m.cites, saldo, consumo90: r4(m.consumo90), ratePorDia: r4(ratePorDia), diasHastaAgotar };
      })
      .filter((r) => r.saldo > 0 || r.consumo90 > 0)
      .sort((a, b) => (a.diasHastaAgotar ?? Number.POSITIVE_INFINITY) - (b.diasHastaAgotar ?? Number.POSITIVE_INFINITY));
  }

  /**
   * Tendencias mensuales (últimos `meses`): volumen ingresado, producido,
   * consumido y rendimiento ponderado por mes. Derivado de las fechas de los
   * registros existentes — sin snapshots ni tabla nueva. Meses sin datos van
   * en 0 para que la serie no tenga huecos.
   */
  /**
   * TODO lo que se movió en el libro, por cubo de tiempo (tablero de Control).
   *
   * Las cuatro secciones del LO-CTP en una sola serie: lo que entró, lo que se
   * gastó en la sierra, lo que salió de producto y lo que se despachó. Hasta
   * acá cada una vivía en su pestaña y nadie podía ver si la planta traga más
   * de lo que saca.
   *
   * Mismos predicados que `saldos()` y `curvaSaldo()` —la madera `pendiente` no
   * es saldo, la corrida anulada no produjo— para que el tablero no discuta con
   * el balance de la pestaña de al lado.
   *
   * El reparto en cubos es puro y vive en `movimiento-libro.ts`: lo comparte con
   * la curva de saldo, así las dos series de la misma pantalla empiezan la
   * semana el mismo lunes.
   */
  static async movimientoDelLibro(
    tenantId: string,
    opts: { fromDate?: Date; toDate?: Date; hoy?: Date } = {},
  ): Promise<MovimientoDelLibro> {
    if (!tenantId) throw new Error("tenantId is required");
    const range = dateRange(opts);

    const woodWhere: Prisma.WoodEntryWhereInput = {
      tenantId, deletedAt: null, status: { in: ["validado", "procesado"] },
      ...(range ? { entryDate: range } : {}),
    };
    const linea = (section: "produccion" | "despacho"): Prisma.ForestCtpEntryWhereInput => ({
      tenantId, deletedAt: null, status: "registrado", section,
      ...(range ? { entryDate: range } : {}),
    });

    const [apertura, ingresos, corridas, despachos] = await Promise.all([
      /* Lo que YA había en el patio: sin esto, «días de materia prima» se
         proyectaría sobre la variación del período y no sobre el stock. */
      ForestCtpDB.aperturaDePeriodo(tenantId, opts.fromDate),
      prisma.woodEntry.findMany({
        where: woodWhere,
        select: { entryDate: true, volumeM3: true, speciesCommonName: true, pieces: true },
      }),
      prisma.forestCtpEntry.findMany({
        where: linea("produccion"),
        select: { entryDate: true, volumeInputM3: true, quantity: true, unit: true, speciesCommon: true },
      }),
      prisma.forestCtpEntry.findMany({
        where: linea("despacho"),
        select: { entryDate: true, quantity: true, speciesCommon: true },
      }),
    ]);

    /* El eje arranca en el inicio del período aunque los primeros días estén
       vacíos, y NO dibuja el futuro: un patio no tiene movimiento mañana. Sin
       período, se abre desde el primer movimiento del libro. */
    const hoy = opts.hoy ?? new Date();
    const marcas = [
      ...ingresos.map((i) => i.entryDate.getTime()),
      ...corridas.map((c) => c.entryDate.getTime()),
      ...despachos.map((d) => d.entryDate.getTime()),
    ];
    const desde = opts.fromDate ?? (marcas.length ? new Date(Math.min(...marcas)) : hoy);
    const topeSuperior = Math.min(opts.toDate?.getTime() ?? hoy.getTime(), hoy.getTime());
    const hasta = new Date(marcas.length ? Math.max(topeSuperior, Math.max(...marcas)) : topeSuperior);

    return agruparMovimiento({
      ingresos: ingresos.map((i) => ({
        fecha: i.entryDate, volumenM3: Number(i.volumeM3 ?? 0),
        especie: i.speciesCommonName, piezas: i.pieces,
      })),
      corridas: corridas.map((c) => ({
        fecha: c.entryDate, consumidoM3: Number(c.volumeInputM3 ?? 0),
        producido: Number(c.quantity ?? 0), unidad: c.unit, especie: c.speciesCommon,
      })),
      despachos: despachos.map((d) => ({
        fecha: d.entryDate, cantidad: Number(d.quantity ?? 0), especie: d.speciesCommon,
      })),
      desde: desde <= hasta ? desde : hasta,
      hasta,
      aperturaM3: apertura.materiaPrima.reduce((a, m) => a + m.existencia, 0),
      /* Este endpoint alimenta BARRAS: el trimestre en días daba 67 barras
         apretadas y casi todas en cero. */
      paso: pasoParaBarras(
        Math.max(1, Math.floor((hasta.getTime() - Math.min(desde.getTime(), hasta.getTime())) / 86_400_000) + 1),
      ),
    });
  }

  static async tendenciasMensuales(tenantId: string, meses = 6): Promise<TendenciaMes[]> {
    if (!tenantId) throw new Error("tenantId is required");
    const n = Math.min(Math.max(meses, 1), 24);
    const now = new Date();
    const startMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (n - 1), 1));
    const keyOf = (d: Date) => d.toISOString().slice(0, 7);
    const [ingresos, corridas, despachos] = await Promise.all([
      prisma.woodEntry.findMany({ where: { tenantId, deletedAt: null, status: { in: ["validado", "procesado"] }, entryDate: { gte: startMonth } }, select: { entryDate: true, volumeM3: true } }),
      prisma.forestCtpEntry.findMany({ where: { tenantId, deletedAt: null, status: "registrado", section: "produccion", entryDate: { gte: startMonth } }, select: { entryDate: true, quantity: true, volumeInputM3: true, rendimientoPct: true } }),
      prisma.forestCtpEntry.findMany({ where: { tenantId, deletedAt: null, status: "registrado", section: "despacho", entryDate: { gte: startMonth } }, select: { entryDate: true, quantity: true } }),
    ]);
    const buckets = new Map<string, { ingresoM3: number; producido: number; despachado: number; consumidoM3: number; rendW: number; rendPeso: number }>();
    for (let i = 0; i < n; i++) {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (n - 1) + i, 1));
      buckets.set(keyOf(d), { ingresoM3: 0, producido: 0, despachado: 0, consumidoM3: 0, rendW: 0, rendPeso: 0 });
    }
    for (const i of ingresos) { const b = buckets.get(keyOf(i.entryDate)); if (b) b.ingresoM3 += Number(i.volumeM3 ?? 0); }
    for (const c of corridas) {
      const b = buckets.get(keyOf(c.entryDate));
      if (!b) continue;
      b.producido += Number(c.quantity ?? 0);
      const vin = Number(c.volumeInputM3 ?? 0);
      b.consumidoM3 += vin;
      const rend = Number(c.rendimientoPct ?? 0);
      if (rend > 0 && vin > 0) { b.rendW += rend * vin; b.rendPeso += vin; }
    }
    // Despachado: cantidad de producto que salió por mes (como el `producido`, en
    // unidades de producto declaradas — por eso va en el chart de salida, no en el
    // de materia prima m³, para no mezclar unidades).
    for (const d of despachos) { const b = buckets.get(keyOf(d.entryDate)); if (b) b.despachado += Number(d.quantity ?? 0); }
    return [...buckets.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([mes, b]) => ({ mes, ingresoM3: r4(b.ingresoM3), producido: r4(b.producido), despachado: r4(b.despachado), consumidoM3: r4(b.consumidoM3), rendimiento: b.rendPeso > 0 ? Math.round((b.rendW / b.rendPeso) * 10) / 10 : 0 }));
  }

  /**
   * Claves compuestas de las corridas de producción vivas — para la importación
   * idempotente (ADR-138 etapa 2): una corrida no tiene GTF propio, así que se
   * deduplica por `fecha|producto|especie|cantidad` (evita re-crear + el estado
   * parcial de re-importar, donde I2 rechazaría los consumos ya atribuidos).
   */
  /**
   * CUÁNTAS corridas hay de cada clave, no si hay alguna.
   *
   * Un depósito tiene ocho paquetes armados iguales —misma fecha, especie,
   * producto, volumen y hasta el mismo código de lote— y eso no es un error de
   * carga: son ocho bultos. Con un `Set` el importador declaraba UNO y perdía
   * siete (en el inventario real del aserradero fueron 6 filas y 0.489 m³ que
   * nunca llegaron a la base, sin un solo error en pantalla).
   *
   * Contando, la idempotencia se mantiene: si el archivo trae ocho y la base ya
   * tiene ocho, no se crea ninguna; si tiene tres, se crean las cinco que
   * faltan.
   */
  static async existingProduccionKeys(tenantId: string): Promise<Map<string, number>> {
    if (!tenantId) throw new Error("tenantId is required");
    const rows = await prisma.forestCtpEntry.findMany({
      where: { tenantId, section: "produccion", deletedAt: null, status: "registrado" },
      select: { entryDate: true, productType: true, speciesCommon: true, quantity: true, codigoProducto: true, materiaPrimaRef: true },
    });
    const claves = new Map<string, number>();
    const sumar = (k: string) => claves.set(k, (claves.get(k) ?? 0) + 1);
    for (const r of rows) {
      sumar(produccionKey(r.entryDate, r.productType, r.speciesCommon, r.quantity, r.codigoProducto, r.materiaPrimaRef));
      /* Sólo las corridas SIN paquete ni lote aportan además su clave vieja: son
         las que se importaron antes y no se pueden distinguir de otra igual. Una
         corrida que sí tiene código no bloquea a un paquete distinto. */
      if (!r.codigoProducto && !r.materiaPrimaRef) {
        sumar(produccionKeyBase(r.entryDate, r.productType, r.speciesCommon, r.quantity));
      }
    }
    return claves;
  }

  /** Claves de los despachos vivos — dedup idempotente del import (ADR-138 2b). */
  static async existingDespachoKeys(tenantId: string): Promise<Set<string>> {
    if (!tenantId) throw new Error("tenantId is required");
    const rows = await prisma.forestCtpEntry.findMany({
      where: { tenantId, section: "despacho", deletedAt: null, status: "registrado" },
      select: { gtfNumber: true, entryDate: true, productType: true, speciesCommon: true, quantity: true, destino: true },
    });
    return new Set(rows.map((r) => despachoKey(r.gtfNumber, r.entryDate, r.productType, r.speciesCommon, r.quantity, r.destino)));
  }

  /**
   * Mapa `gtfNumber → campos comparables` de los despachos vivos CON GTF, para la
   * vista de reconciliación del importador (ADR-138): un despacho cuyo GTF ya
   * existe pero con cantidad/producto/destino distinto se marca «difiere». Solo
   * despachos con GTF (los «sin GTF» se dedupean por clave compuesta, sin diff).
   */
  static async despachoComparableByGtf(
    tenantId: string,
  ): Promise<Map<string, { quantity: number; productType: string; speciesCommon: string; destino: string }>> {
    if (!tenantId) throw new Error("tenantId is required");
    const rows = await prisma.forestCtpEntry.findMany({
      where: { tenantId, section: "despacho", deletedAt: null, status: "registrado", gtfNumber: { not: null } },
      select: { gtfNumber: true, quantity: true, productType: true, speciesCommon: true, destino: true },
    });
    const map = new Map<string, { quantity: number; productType: string; speciesCommon: string; destino: string }>();
    for (const r of rows) {
      if (!r.gtfNumber) continue;
      map.set(r.gtfNumber, {
        quantity: Number(r.quantity ?? 0),
        productType: r.productType ?? "",
        speciesCommon: r.speciesCommon ?? "",
        destino: r.destino ?? "",
      });
    }
    return map;
  }

  /**
   * Trazabilidad HACIA ADELANTE de un ingreso: ¿a dónde fue esta madera?
   * GTF de ingreso → corridas de producción que la consumieron (puente
   * ForestCtpConsumo) → despachos que salieron de esas corridas (puente
   * ForestCtpDespachoOrigen). Complementa al Radar (que dibuja el período
   * entero) con el detalle de UN ingreso — la pregunta que hace un fiscalizador:
   * "esta guía, ¿dónde terminó?". Read-only, tenant-scoped, 3 queries batched.
   *
   * `sinConsumirM3` = volumen que aún no entró a ninguna corrida (Σ consumos ≤
   * volumeM3, invariante I2). No es un hueco de trazabilidad: es patio.
   */
  static async trazaForwardIngreso(tenantId: string, woodEntryId: string): Promise<TrazaForwardIngreso | null> {
    if (!tenantId) throw new Error("tenantId is required");
    if (!woodEntryId) throw new Error("woodEntryId is required");

    const wood = await prisma.woodEntry.findFirst({
      where: { id: woodEntryId, tenantId, deletedAt: null },
      select: { volumeM3: true },
    });
    if (!wood) return null;

    // Corridas que consumieron ESTE ingreso (con cuánto de él entró a cada una).
    const consumos = await prisma.forestCtpConsumo.findMany({
      where: { tenantId, woodEntryId },
      select: { ctpEntryId: true, volumeM3: true },
    });
    const corridaIds = consumos.map((c) => c.ctpEntryId);

    const [corridaRows, origenRows] = await Promise.all([
      corridaIds.length
        ? prisma.forestCtpEntry.findMany({
            where: { id: { in: corridaIds }, tenantId, deletedAt: null },
            select: { id: true, lineNo: true, entryDate: true, productType: true, speciesCommon: true, quantity: true, unit: true, status: true },
          })
        : Promise.resolve([]),
      corridaIds.length
        ? prisma.forestCtpDespachoOrigen.findMany({
            where: { tenantId, produccionEntryId: { in: corridaIds } },
            select: { produccionEntryId: true, despachoEntryId: true, quantity: true },
          })
        : Promise.resolve([]),
    ]);

    const despachoIds = [...new Set(origenRows.map((o) => o.despachoEntryId))];
    const despachoRows = despachoIds.length
      ? await prisma.forestCtpEntry.findMany({
          where: { id: { in: despachoIds }, tenantId, deletedAt: null },
          select: { id: true, lineNo: true, entryDate: true, destino: true, gtfNumber: true, unit: true, status: true },
        })
      : [];
    const despachoById = new Map(despachoRows.map((d) => [d.id, d]));
    const corridaById = new Map(corridaRows.map((c) => [c.id, c]));

    const volumeM3 = Number(wood.volumeM3 ?? 0);
    const consumidoM3 = consumos.reduce((a, c) => a + Number(c.volumeM3 ?? 0), 0);

    const corridas = consumos
      .map((c) => {
        const corrida = corridaById.get(c.ctpEntryId);
        if (!corrida) return null;
        const despachos = origenRows
          .filter((o) => o.produccionEntryId === c.ctpEntryId)
          .map((o) => {
            const d = despachoById.get(o.despachoEntryId);
            if (!d) return null;
            return {
              despachoEntryId: o.despachoEntryId,
              lineNo: d.lineNo,
              entryDate: d.entryDate.toISOString(),
              destino: d.destino,
              gtfNumber: d.gtfNumber,
              quantity: r4(Number(o.quantity ?? 0)),
              unit: d.unit,
              status: d.status,
            };
          })
          .filter((d): d is NonNullable<typeof d> => d !== null)
          .sort((a, b) => a.lineNo - b.lineNo);
        return {
          produccionEntryId: c.ctpEntryId,
          lineNo: corrida.lineNo,
          entryDate: corrida.entryDate.toISOString(),
          productType: corrida.productType,
          speciesCommon: corrida.speciesCommon,
          volumeConsumidoM3: r4(Number(c.volumeM3 ?? 0)),
          quantity: corrida.quantity != null ? r4(Number(corrida.quantity)) : null,
          unit: corrida.unit,
          status: corrida.status,
          despachos,
        };
      })
      .filter((c): c is NonNullable<typeof c> => c !== null)
      .sort((a, b) => a.lineNo - b.lineNo);

    return {
      volumeM3: r4(volumeM3),
      consumidoM3: r4(consumidoM3),
      sinConsumirM3: r4(Math.max(0, volumeM3 - consumidoM3)),
      corridas,
    };
  }
}

export interface ReordenProyeccion {
  especie: string; scientific: string | null; cites: boolean;
  saldo: number; consumo90: number; ratePorDia: number;
  /** Días hasta agotar al ritmo reciente; null si no se consume. */
  diasHastaAgotar: number | null;
}

export interface TendenciaMes {
  mes: string; // YYYY-MM
  ingresoM3: number; producido: number; despachado: number; consumidoM3: number; rendimiento: number;
}

/** Serie del saldo de materia prima en el tiempo. Ver `curvaSaldo`. */
export interface CurvaSaldo {
  /** Existencia heredada al inicio del período; 0 si el período no tiene inicio. */
  apertura: number;
  fuenteApertura: ConciliacionPeriodo["fuenteApertura"];
  aperturaLabel: string | null;
  /** Granularidad del eje, elegida por la longitud del período. */
  paso: "dia" | "semana" | "mes";
  /** `fecha` = inicio del cubo (YYYY-MM-DD). `saldo` = acumulado hasta ese cubo. */
  puntos: { fecha: string; ingreso: number; consumo: number; saldo: number }[];
  /** Saldo al cierre de la serie. Cuadra con `apertura + saldoM3` del período. */
  final: number;
  pico: { fecha: string; saldo: number } | null;
  valle: { fecha: string; saldo: number } | null;
}

/** Trazabilidad hacia adelante de un ingreso: corridas que lo consumieron y
 *  los despachos que salieron de esas corridas. Ver `trazaForwardIngreso`. */
export interface TrazaForwardIngreso {
  volumeM3: number;
  consumidoM3: number;
  sinConsumirM3: number;
  corridas: {
    produccionEntryId: string;
    lineNo: number;
    entryDate: string; // ISO
    productType: string | null;
    speciesCommon: string | null;
    /** m³ de ESTE ingreso que entraron a la corrida. */
    volumeConsumidoM3: number;
    /** producido total de la corrida (todas sus materias primas). */
    quantity: number | null;
    unit: string | null;
    status: string;
    despachos: {
      despachoEntryId: string;
      lineNo: number;
      entryDate: string; // ISO
      destino: string | null;
      gtfNumber: string | null;
      /** cantidad de la corrida que salió en este despacho. */
      quantity: number;
      unit: string | null;
      status: string;
    }[];
  }[];
}

export interface KardexEspecie {
  especie: string;
  movimientos: { fecha: Date; tipo: "ingreso" | "consumo"; doc: string; entra: number; sale: number; saldo: number }[];
  ingresoTotal: number;
  consumoTotal: number;
  saldo: number;
}

export interface TrazaGrafo {
  ingresos: {
    id: string; gtf: string; species: string | null; volumeM3: number; cites: boolean; fecha: string;
    /** Los casilleros por ingreso que pinta la Sección 2 (ADR-347). Opcionales
     *  en el tipo: el endpoint siempre los manda, los fixtures no los declaran. */
    productType?: string | null; speciesScientificName?: string | null; originCode?: string | null;
    ctpProductCode?: string | null; originSourceNumber?: string | null; unit?: string | null;
    /** Concesión, permiso, comunidad… — el tipo del título habilitante de origen. */
    originType?: string | null;
  }[];
  corridas: { id: string; lineNo: number; label: string; quantity: number; unit: string | null; cites: boolean; productType: string | null; species: string | null; fecha: string; observations?: string | null }[];
  despachos: { id: string; lineNo: number; label: string; quantity: number; unit: string | null; destino: string | null; gtf: string | null; fecha: string }[];
  /** woodEntryId → corridaId (m³ consumido). */
  consumos: { from: string; to: string; volumeM3: number }[];
  /** corridaId → despachoId (cantidad atribuida). */
  origenes: { from: string; to: string; quantity: number }[];
}
