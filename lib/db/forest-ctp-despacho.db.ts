/**
 * forest-ctp-despacho.db — atribución N:M despacho → corridas de producción,
 * el ÚLTIMO tramo de la cadena de custodia (ADR-135).
 *
 * Con `ForestCtpConsumo` (ingreso → producción) más esta tabla se puede
 * responder de punta a punta "¿de qué árbol salió esta tabla que despaché?",
 * que es lo que exige EUDR y lo que pregunta un fiscalizador. Antes de esto el
 * despacho se ataba por TEXTO y la cadena se cortaba en el último paso.
 *
 * ── Por qué I4/I5 se AGREGAN y no reemplazan a I3 (ADR-135 D2) ──────────────
 * No es una opinión: se midió construyendo los dos escenarios.
 *
 *   I3 · Σ despachado(producto) ≤ Σ producido(producto)   ← el ACTA, agregado
 *   I4 · Σ origenes(despacho)   ≤ despacho.quantity       ← ÍNDICE (≅ I1)
 *   I5 · Σ origenes(corrida)    ≤ produccion.quantity     ← ÍNDICE (≅ I2)
 *
 *   A) despacho de 100 contra una producción de 6.2, SIN atribuir:
 *      I3 rechaza · I5 CIEGO (Σ=0 ≤ 6.2 — con atribución parcial es vacua).
 *   B) 2 corridas (6.2+10), 2 despachos, ambos citando la MISMA corrida:
 *      I3 CIEGO (16.2−16.2=0, el agregado cuadra) · I5 ATRAPA (16.2 sobre 6.2).
 *
 * Cada una ve lo que la otra deja pasar. B *es* la pregunta de EUDR: el total
 * cuadra mientras una corrida sostiene 2.6× su producción. I5 no es un segundo
 * stock — es el techo de UNA fila; el stock sigue siendo uno solo (el acta).
 */
import { explicarSaldo, saldosDeCorridas } from "./forest-ctp-saldo-corrida";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/lib/generated/prisma/client";
import { invalidateByPrefix } from "@/lib/cache";
import { auditCtp, auditCtpEsperando } from "@/lib/forestal/ctp-audit";
import { closedPeriodOf, type CtpCierrePeriodo } from "@/lib/forestal/ctp-cierre-types";
import { corridaDeServicio, corridaMixta, decidirCogs, type MotivoCogs } from "@/lib/forestal/ctp-cogs";
import { ForestCtpFichaDB } from "./forest-ctp-ficha.db";
import { CtpInvariantError, ForestCtpConsumoDB, CTP_TX_OPTS } from "./forest-ctp-consumo.db";
import { ForestCtpCierreDB } from "./forest-ctp-cierre.db";
import { ForestAnexosDB } from "./forest-anexos.db";
import { agregarPnl, decidirMargen, type FilaPnl, type MargenMotivo, type PnlAgregado } from "@/lib/forestal/ctp-pnl";
import { guiaEditable } from "@/lib/forestal/gtf-estado";
import {
  correlativoEnSerie, gtfEnUso, leerGtfConfirmada, mismoNumeroGtf, proponerGtf, saltoDeCorrelativo,
  type GtfUsada, type PropuestaGtf,
} from "@/lib/forestal/gtf-talonario";
import { PlatformSettingsDB } from "./platform-settings.db";
import { claveEspecie } from "@/lib/forestal/loth-constants";
import { sinDato } from "@/lib/errores/sin-dato";

const CACHE_PREFIX = "forest-ctp";
/** 4 decimales — precisión forestal (volúmenes/cantidades). */
const r4 = (n: number) => Math.round(n * 10000) / 10000;

/** Un origen sólo cuenta si su línea de despacho sigue viva (espejo de CONSUMO_VIGENTE). */
export const ORIGEN_VIGENTE = {
  despacho: { deletedAt: null, status: "registrado" },
} as const;

export interface OrigenInput {
  produccionEntryId: string;
  quantity: number | string;
}

/** Un despacho cuenta mientras su línea siga viva: borrador o emitido, no anulado ni borrado. */
const DESPACHO_VIGENTE = ORIGEN_VIGENTE.despacho;

/**
 * La salida de UNA troza sin aserrar (ADR-363) guarda en `codigoProducto` el
 * código de la PIEZA (`codigoPlanta`/codificación), y ese código puede ser igual
 * al de un paquete: en Blas los paquetes «55»…«72» comparten número con 18
 * trozas libres. Esa línea no lleva ningún paquete, así que no cuenta para «un
 * paquete, una guía» (ADR-444). La marca que persiste es la pieza colgada del
 * despacho (`despachadaEnId`), no `desdeTrozas`, que sólo vive en el alta.
 */
const NO_ES_SALIDA_DE_TROZAS = { trozasDespachadas: { none: {} } } as const;

/** Un origen como lo devuelve `setOrigenes`: con la corrida que lo sostiene. */
export type OrigenConCorrida = Prisma.ForestCtpDespachoOrigenGetPayload<{
  include: { produccion: { select: { lineNo: true; productType: true; speciesCommon: true } } };
}>;

/** Lo que `setOrigenesEnTx` escribió, y el renglón que `despuesDeOrigenes` narra tras el commit. */
export interface OrigenesEscritos {
  origenes: OrigenConCorrida[];
  auditoria: string;
}

export interface CogsDespacho {
  /** Costo de lo que salió. null = no se puede saber (falta factura / monedas mezcladas). NUNCA 0. */
  cogs: number | null;
  /** Costo por unidad despachada — el número con el que se compara el precio de venta. */
  costoUnitario: number | null;
  moneda: string | null;
  /** Por qué es null, para que la UI lo explique en vez de mostrar "—". */
  /* `madera_de_servicio` (ADR-437 §1): salió de madera ajena — no lleva costo de madera y NO es un faltante.
     `mixto_servicio` (revisión 26-09): mezcla propia y de servicio — INCOMPLETO, se avisa. */
  motivo: MotivoCogs;
  /** Sólo con `mixto_servicio`: costo de la parte comprada (null si una corrida mixta no lo separa). */
  cogsPropio: number | null;
  /** Lo despachado que NO tiene corrida atribuida: su costo es desconocido por definición. */
  sinAtribuir: number;
  detalle: {
    lineNo: number;
    quantity: number;
    /** S/ por unidad de esa corrida (ya incluye materia prima ponderada + proceso). */
    costoUnitario: number | null;
    costo: number | null;
    congelado: boolean;
    /** Corrida de madera ajena: la pantalla dice «servicio», no «sin costo». */
    maderaDeServicio: boolean;
    /** Corrida que mezcló madera propia y ajena: la pantalla dice «mixta». */
    mezclaServicio: boolean;
  }[];
}

/** Margen de un despacho = venta − COGS (ADR-141). null si falta cualquiera. */
export interface MargenDespacho {
  valorVenta: number | null;
  cogs: number | null;
  /** venta − cogs. null (NUNCA 0) si falta la venta o el costo. */
  margen: number | null;
  /** margen / venta × 100. */
  margenPct: number | null;
  moneda: string;
  /** Por qué el margen es null (sin_venta / o el motivo del COGS). */
  motivo: MargenMotivo;
}

/** P&L agregado de un período (ADR-141). La forma y la suma viven en `lib/forestal/ctp-pnl.ts` (pura, con tests). */
export type PnlPeriodo = PnlAgregado;

export interface TrazabilidadDespacho {
  /** Sin huecos: cada unidad despachada tiene una corrida y un ingreso detrás. */
  completa: boolean;
  declarado: number;
  atribuido: number;
  sinAtribuir: number;
  /** Por qué NO está completa, para que la UI lo explique en vez de sólo negar. */
  motivo: "ok" | "sin_atribucion" | "atribucion_parcial" | "corrida_sin_origen";
  /**
   * Las PIEZAS que salieron sin aserrar (ADR-363). Su cadena es más corta —el
   * origen es el ingreso, no una corrida— pero está igual de completa: la troza
   * se puede señalar en la guía con la que entró.
   */
  trozas: { id: string; codificacion: string | null; volumenM3: number; gtfIngreso: string }[];
  corridas: {
    produccionEntryId: string;
    lineNo: number;
    quantity: number;
    /** Guías de ingreso que alimentaron esa corrida (ADR-134). */
    guias: string[];
    /** La corrida no tiene su propia materia prima atribuida ⇒ la cadena se corta ahí. */
    sinOrigen: boolean;
    /**
     * El lote de aserrío que se comió esa corrida (ADR-334/337), si salió de uno.
     *
     * Es el eslabón entre la guía y la sierra: con él, «¿de qué pila salió este
     * paquete?» se contesta con un código y no reconstruyendo consumos. `null`
     * en las corridas cargadas a mano — el libro admite huecos.
     */
    loteAserrio: { code: string; piezas: number } | null;
  }[];
}

export class ForestCtpDespachoDB {
  /**
   * Reemplaza el set de orígenes de un despacho, validando I4 + I5 + tenant +
   * orientación dentro de UNA transacción.
   *
   * LOCKEA LAS CORRIDAS, no el despacho. El recurso disputado es la producción:
   * dos despachos distintos citando la misma corrida lockean líneas distintas,
   * no se bloquean, y bajo READ COMMITTED los dos leen el mismo saldo ⇒ ambos
   * pasan I5. Es el mismo TOCTOU que ya nos comió en I2, invertido. Ordenadas
   * por id para que dos transacciones tomen las mismas corridas en el mismo
   * orden y no se deadlockeen.
   */
  static async setOrigenes(
    tenantId: string,
    despachoEntryId: string,
    origenes: OrigenInput[],
    user: string,
  ) {
    if (!tenantId) throw new Error("tenantId is required");
    if (!despachoEntryId) throw new Error("despachoEntryId is required");
    if (!user?.trim()) throw new Error("user is required");

    /* Los cierres se leen ANTES de abrir la transacción, como en `setConsumos`:
       son un KV que se lee con el cliente global, y adentro pedirían una
       segunda conexión del pool mientras la tx retiene la suya. */
    const cierres = await ForestCtpCierreDB.list(tenantId);
    const escritos = await prisma.$transaction(
      (tx) => ForestCtpDespachoDB.setOrigenesEnTx(tx, tenantId, despachoEntryId, origenes, user, { cierres }),
      CTP_TX_OPTS,
    );
    await ForestCtpDespachoDB.despuesDeOrigenes(tenantId, despachoEntryId, escritos, user);
    return escritos.origenes;
  }

  /**
   * El núcleo de `setOrigenes` DENTRO de una transacción ajena (ADR-444).
   *
   * Existe para que el ALTA de un despacho y su atribución sean un solo acto.
   * Antes `ForestCtpDB.create` grababa la línea en una transacción y validaba
   * los orígenes en OTRA: si I5 o el producto rechazaban, el operador veía un
   * 422 con la línea ya grabada, y cada reintento del modal de la guía sumaba
   * otra línea igual (medido 27-09 en `main`).
   *
   * Las reglas son LAS MISMAS y en el mismo orden (tenant, orientación,
   * producto, I4, I5, lock de las corridas `ORDER BY id`): es un corte, no una
   * segunda versión. Lo que NO hace es auditar ni invalidar la caché: eso va
   * DESPUÉS del commit (`despuesDeOrigenes`) — un renglón escrito antes de un
   * rollback narraría una atribución que nunca existió.
   *
   * `cierres` los lee el llamador ANTES de abrir la transacción
   * (`ForestCtpCierreDB.list`), por la misma razón que en `setConsumosEnTx`.
   */
  static async setOrigenesEnTx(
    tx: Prisma.TransactionClient,
    tenantId: string,
    despachoEntryId: string,
    origenes: OrigenInput[],
    user: string,
    { cierres }: { cierres: CtpCierrePeriodo[] },
  ): Promise<OrigenesEscritos> {
    if (!tenantId) throw new Error("tenantId is required");
    if (!despachoEntryId) throw new Error("despachoEntryId is required");
    if (!user?.trim()) throw new Error("user is required");

    const ids = origenes.map((o) => o.produccionEntryId);
    if (new Set(ids).size !== ids.length) {
      throw new CtpInvariantError(
        "Una misma corrida aparece dos veces: suma las cantidades en una sola línea.",
        "I4_SOBRE_ATRIBUCION_DESPACHO",
      );
    }
    for (const o of origenes) {
      if (Number(o.quantity) <= 0) {
        throw new CtpInvariantError("Un origen debe ser mayor a 0.", "I4_SOBRE_ATRIBUCION_DESPACHO", {
          produccionEntryId: o.produccionEntryId,
        });
      }
    }
    if (ids.includes(despachoEntryId)) {
      throw new CtpInvariantError("Una línea no puede salir de sí misma.", "TENANT_MISMATCH");
    }

    // Cierre de período (ADR-139): la atribución de origen de un despacho de un
    // mes cerrado es inmutable.
    const despOrig = await tx.forestCtpEntry.findFirst({
      where: { id: despachoEntryId, tenantId },
      select: { entryDate: true },
    });
    const cerradoOrig = despOrig ? closedPeriodOf(cierres, despOrig.entryDate) : null;
    if (cerradoOrig) {
      throw new CtpInvariantError(
        `El período ${cerradoOrig.label} está cerrado: no se puede cambiar el origen de un despacho de un mes cerrado.`,
        "PERIODO_CERRADO",
        { periodKey: cerradoOrig.periodKey },
      );
    }

    // 1. La línea destino existe, es de este tenant y ES un despacho.
    const despacho = await tx.forestCtpEntry.findFirst({
      where: { id: despachoEntryId, tenantId, deletedAt: null },
      select: {
        id: true, section: true, quantity: true, unit: true, productType: true, speciesCommon: true, lineNo: true,
        codigoProducto: true,
      },
    });
    if (!despacho) throw new Error("Línea de despacho no encontrada");
    if (despacho.section !== "despacho") {
      throw new CtpInvariantError(
        "Sólo una línea de despacho puede tener orígenes de producción.",
        "TENANT_MISMATCH",
        { section: despacho.section },
      );
    }

    // 2. Lock de las CORRIDAS — el recurso disputado (ver cabecera).
    if (ids.length > 0) {
      await tx.$queryRaw`
        SELECT "id" FROM "ForestCtpEntry"
        WHERE "id" IN (${Prisma.join(ids)}) AND "tenantId" = ${tenantId} AND "deletedAt" IS NULL
        ORDER BY "id"
        FOR UPDATE
      `;
    }

    // 3. Las corridas citadas: de este tenant, vivas, y de sección producción.
    //    El FK de Postgres no garantiza ni el tenant ni la ORIENTACIÓN (aceptaría
    //    un despacho citando a otro despacho) — ADR-135 D5.
    const corridas = await tx.forestCtpEntry.findMany({
      where: { id: { in: ids }, tenantId, deletedAt: null, status: "registrado" },
      select: { id: true, lineNo: true, section: true, quantity: true, unit: true, productType: true, speciesCommon: true },
    });
    if (corridas.length !== ids.length) {
      const vistas = new Set(corridas.map((c) => c.id));
      throw new CtpInvariantError(
        "Alguna corrida citada no existe, fue anulada, o pertenece a otra tienda.",
        "TENANT_MISMATCH",
        { faltantes: ids.filter((id) => !vistas.has(id)) },
      );
    }
    const noProduccion = corridas.filter((c) => c.section !== "produccion");
    if (noProduccion.length > 0) {
      throw new CtpInvariantError(
        "Un despacho sale de corridas de producción, no de otros despachos.",
        "TENANT_MISMATCH",
        { lineas: noProduccion.map((c) => c.lineNo) },
      );
    }

    // 4. Mismo producto y misma unidad: atribuir tablones a un despacho de
    //    leña, o m³ contra kg, sería un número que no significa nada.
    /* Tres comparaciones y CADA UNA con su criterio, que no es lo mismo:
       · la ESPECIE va con `claveEspecie` —se tipea a mano y una tilde no la
         convierte en otra madera—;
       · el PRODUCTO va crudo (sólo trim+minúsculas): sale de un `<select>` del
         catálogo oficial, así que no tiene variantes de tipeo, y `claveEspecie`
         ignora lo que va entre paréntesis — con ella, «MADERA ASERRADA
         (COMERCIAL)» y «(CORTA)» pasaban a ser el mismo producto y se podía
         atribuir una corrida de corta a un despacho de comercial;
       · la UNIDAD, cruda también: «m3» y «pt» no son variantes de escritura,
         son magnitudes distintas.
       El producto de la corrida, o el del PAQUETE QUE VA EN ESTA LÍNEA
       (ADR-444): `despacho.codigoProducto` → ese paquete, de ESA corrida. El
       paquete pertenece a su corrida (ADR-349) y puede declarar un producto
       más fino que ella: en Blas 174 paquetes dicen «(COMERCIAL)» colgados de
       una corrida «(TABLA)», y la guía sale con el producto del paquete. NO
       vale el de cualquier paquete de la corrida: con eso una salida
       «(COMERCIAL)» sin código sacaba 2 m³ de una corrida «(TABLA)» que tenía
       0,5 comerciales —la misma puerta «corta contra comercial» de arriba—, y
       en Blas hay 30 corridas con paquetes de productos mezclados. Por lo
       mismo, lo que se le atribuye a la corrida por ese paquete no pasa de lo
       que el paquete mide. La especie y la unidad siguen siendo las de la
       corrida: esas no cambian de un paquete a otro. Sin código de paquete, la
       comparación es la estricta de siempre. */
    const claveProducto = (v: string | null | undefined) => (v ?? "").trim().toLowerCase();
    const codigoLinea = (despacho.codigoProducto ?? "").trim();
    const paqueteDeLaLinea =
      codigoLinea && ids.length > 0
        ? await tx.forestCtpPaquete.findFirst({
            where: { tenantId, codigo: codigoLinea, ctpEntryId: { in: ids }, deletedAt: null },
            select: { codigo: true, ctpEntryId: true, productType: true, volumenM3: true },
          })
        : null;
    const productoDespacho = claveProducto(despacho.productType);
    /** La corrida sólo cuadra por el producto de SU paquete nombrado en la línea. */
    const cuadraPorPaquete = (c: { id: string }) =>
      paqueteDeLaLinea?.ctpEntryId === c.id &&
      paqueteDeLaLinea.productType != null &&
      claveProducto(paqueteDeLaLinea.productType) === productoDespacho;
    const distinto = corridas.filter(
      (c) =>
        (claveProducto(c.productType) !== productoDespacho && !cuadraPorPaquete(c)) ||
        claveEspecie(c.speciesCommon) !== claveEspecie(despacho.speciesCommon) ||
        (c.unit ?? "") !== (despacho.unit ?? ""),
    );
    if (distinto.length > 0) {
      throw new CtpInvariantError(
        `El despacho es de ${despacho.productType ?? "—"} · ${despacho.speciesCommon ?? "—"} (${despacho.unit ?? "—"}); ` +
          `la corrida #${distinto[0].lineNo} es de ${distinto[0].productType ?? "—"} · ${distinto[0].speciesCommon ?? "—"} (${distinto[0].unit ?? "—"}).`,
        "TENANT_MISMATCH",
        { lineas: distinto.map((c) => c.lineNo) },
      );
    }

    //    El producto de la corrida que sólo cuadra por el paquete: hasta lo que
    //    el paquete mide (≤, nunca ==: puede salir menos).
    const porPaquete = corridas.find((c) => claveProducto(c.productType) !== productoDespacho && cuadraPorPaquete(c));
    if (porPaquete && paqueteDeLaLinea) {
      const pedido = r4(Number(origenes.find((o) => o.produccionEntryId === porPaquete.id)?.quantity ?? 0));
      const mide = r4(Number(paqueteDeLaLinea.volumenM3));
      if (pedido > mide) {
        throw new CtpInvariantError(
          `El paquete ${paqueteDeLaLinea.codigo} es de ${paqueteDeLaLinea.productType} y mide ${mide}; ` +
            `la línea le atribuye ${pedido} a la corrida #${porPaquete.lineNo}, que es de ${porPaquete.productType ?? "—"}. ` +
            `Lo que pasa de ${mide} no es de ese producto.`,
          "I4_SOBRE_ATRIBUCION_DESPACHO",
          { codigo: paqueteDeLaLinea.codigo, pedido, mide, lineNo: porPaquete.lineNo },
        );
      }
    }

    // 5. I4 — Σ atribuido ≤ lo que el despacho declara haber sacado.
    const declarado = despacho.quantity ? Number(despacho.quantity) : null;
    const totalAtribuido = origenes.reduce((a, o) => a + Number(o.quantity), 0);
    if (declarado != null && r4(totalAtribuido) > r4(declarado)) {
      throw new CtpInvariantError(
        `Estás atribuyendo ${r4(totalAtribuido)} pero el despacho declara ${r4(declarado)}.`,
        "I4_SOBRE_ATRIBUCION_DESPACHO",
        { atribuido: r4(totalAtribuido), declarado: r4(declarado) },
      );
    }

    // 6. I5 — ninguna corrida despachada por encima de lo que produjo,
    //    contando lo que YA sacan OTROS despachos. Esto es lo que I3 no ve.
    //
    //    Desde ADR-316 el saldo lo calcula `saldosDeCorridas`, porque el
    //    despacho dejó de ser el único consumidor: el REPROCESO también saca
    //    producto. Con dos cálculos separados, producir 10, reprocesar 8 y
    //    despachar 10 pasaba las dos validaciones por su cuenta.
    const saldos = await saldosDeCorridas(tx, tenantId, ids, { despachoEntryId });

    for (const o of origenes) {
      const corrida = corridas.find((c) => c.id === o.produccionEntryId)!;
      const saldo = saldos.get(o.produccionEntryId);
      const producido = saldo?.producido ?? 0;
      const disponible = saldo?.disponible ?? 0;
      if (r4(Number(o.quantity)) > r4(disponible)) {
        throw new CtpInvariantError(
          `La corrida #${corrida.lineNo} produjo ${r4(producido)} y sólo le quedan ${r4(disponible)} disponibles` +
            (saldo ? explicarSaldo(saldo) : "") +
            `; estás pidiendo ${r4(Number(o.quantity))}.`,
          "I5_SOBRE_SALIDA_PRODUCCION",
          {
            lineNo: corrida.lineNo,
            producido: r4(producido),
            disponible: r4(disponible),
            despachado: saldo?.despachado ?? 0,
            reprocesado: saldo?.reprocesado ?? 0,
            pedido: r4(Number(o.quantity)),
          },
        );
      }
    }

    // 7. Estado anterior — para que el audit diga de qué a qué (no "cambió").
    const antes = await tx.forestCtpDespachoOrigen.findMany({
      where: { despachoEntryId, tenantId },
      include: { produccion: { select: { lineNo: true } } },
    });

    // 8. Reemplazo atómico. El acta (gtfNumber/destino) no se toca nunca.
    await tx.forestCtpDespachoOrigen.deleteMany({ where: { despachoEntryId, tenantId } });
    if (origenes.length > 0) {
      await tx.forestCtpDespachoOrigen.createMany({
        data: origenes.map((o) => ({
          tenantId,
          despachoEntryId,
          produccionEntryId: o.produccionEntryId,
          quantity: new Prisma.Decimal(o.quantity),
          createdBy: user,
        })),
      });
    }

    const result = await tx.forestCtpDespachoOrigen.findMany({
      where: { despachoEntryId, tenantId },
      include: { produccion: { select: { lineNo: true, productType: true, speciesCommon: true } } },
    });

    const fmt = (rows: { quantity: Prisma.Decimal; produccion: { lineNo: number } }[]) =>
      rows.length === 0 ? "(sin atribución)" : rows.map((r) => `corrida #${r.produccion.lineNo}: ${Number(r.quantity)}`).join(", ");
    return {
      origenes: result,
      auditoria: `Origen del despacho #${despacho.lineNo}: ${fmt(antes)} → ${fmt(result)}`,
    };
  }

  /**
   * Lo que va DESPUÉS del commit de `setOrigenesEnTx`: la caché y el renglón
   * del libro. El renglón se ESPERA, como el de los consumos: de qué corrida
   * salió un despacho es lo que pregunta un fiscalizador, y en Vercel lo que
   * corre después de responder puede no terminar. Nunca tira.
   */
  static async despuesDeOrigenes(
    tenantId: string,
    despachoEntryId: string,
    escritos: OrigenesEscritos,
    user: string,
  ): Promise<void> {
    try {
      invalidateByPrefix(`${CACHE_PREFIX}:${tenantId}`);
    } catch {
      /* cache best-effort */
    }
    await auditCtpEsperando({
      tenantId,
      action: "ctp_origenes_set",
      entity: "ForestCtpEntry",
      entityId: despachoEntryId,
      detail: escritos.auditoria,
      user,
    });
  }

  /**
   * Un paquete, una guía vigente (ADR-444).
   *
   * El despacho guarda el código del paquete en `codigoProducto` (lo escribe
   * `payloadDeFila`; el código es único por tenant y la línea sólo lo escribe
   * al crearse). Si ese código es de un paquete de la planta y ya hay un
   * despacho VIVO que lo lleva —borrador o emitido da igual: los dos dicen
   * «este bulto va en ese camión»—, el alta se rechaza. Anular aquella guía lo
   * libera sola: el criterio es el estado del despacho, no una marca en el
   * paquete, así que no hay nada que «desmarcar» y no se puede desincronizar.
   *
   * LOCKEA EL PAQUETE y relee bajo el lock: dos altas del mismo bulto a la vez
   * se turnan, y la segunda ya ve a la primera confirmada (READ COMMITTED lee
   * lo confirmado en cada sentencia). Sin el lock las dos leerían «libre». Se
   * llama después del lock de las corridas (I3) y antes del INSERT: el orden
   * del libro es la corrida y después lo que cuelga de ella.
   *
   * Un código que no es de ningún paquete (texto libre del formulario manual,
   * una corrida vieja sin paquetes) no se juzga: devuelve null.
   */
  static async exigirPaqueteLibreEnTx(
    tx: Prisma.TransactionClient,
    tenantId: string,
    codigoProducto: string | null | undefined,
  ): Promise<{ id: string; codigo: string; ctpEntryId: string } | null> {
    if (!tenantId) throw new Error("tenantId is required");
    const codigo = (codigoProducto ?? "").trim();
    if (!codigo) return null;

    const bloqueados = await tx.$queryRaw<{ id: string; codigo: string; ctpEntryId: string }[]>`
      SELECT "id", "codigo", "ctpEntryId" FROM "ForestCtpPaquete"
      WHERE "tenantId" = ${tenantId} AND "codigo" = ${codigo} AND "deletedAt" IS NULL
      FOR UPDATE
    `;
    const paquete = bloqueados[0];
    if (!paquete) return null;

    const previo = await tx.forestCtpEntry.findFirst({
      where: { tenantId, section: "despacho", codigoProducto: codigo, ...DESPACHO_VIGENTE, ...NO_ES_SALIDA_DE_TROZAS },
      orderBy: { lineNo: "asc" },
      select: { id: true, lineNo: true, gtfNumber: true },
    });
    if (previo) {
      const guia = previo.gtfNumber?.trim() ? `la guía ${previo.gtfNumber.trim()}` : "una guía en borrador";
      throw new CtpInvariantError(
        `El paquete ${codigo} ya va en ${guia} (línea N° ${previo.lineNo} de Despacho). ` +
          "Un paquete sale en una sola guía: si esa guía está mal, anúlala y vuelve a registrar el paquete.",
        "PAQUETE_YA_DESPACHADO",
        { codigo, despachoEntryId: previo.id, lineNo: previo.lineNo, gtfNumber: previo.gtfNumber },
      );
    }
    return paquete;
  }

  /**
   * Los códigos de paquete que ya viajan en una guía viva (ADR-444).
   *
   * UNA consulta para todos (`codigoProducto in [...]`, nunca una por
   * paquete). Es el mismo criterio que la guarda del alta
   * (`exigirPaqueteLibreEnTx`): lo usan «Productos disponibles» —y a través de
   * ella el selector de la guía, el resumen y el mapa de planta— y la campana
   * de reservas vencidas. Si dos lecturas usaran criterios parecidos, la
   * pantalla ofrecería un paquete que el servidor rechaza.
   */
  static async codigosDespachados(tenantId: string, codigos: readonly string[]): Promise<Set<string>> {
    if (!tenantId) throw new Error("tenantId is required");
    const unicos = [...new Set(codigos.map((c) => c.trim()).filter(Boolean))];
    if (unicos.length === 0) return new Set();
    const filas = await prisma.forestCtpEntry.findMany({
      where: { tenantId, section: "despacho", codigoProducto: { in: unicos }, ...DESPACHO_VIGENTE, ...NO_ES_SALIDA_DE_TROZAS },
      select: { codigoProducto: true },
    });
    return new Set(filas.map((f) => f.codigoProducto).filter((c): c is string => Boolean(c)));
  }

  /** Orígenes de un despacho, con la corrida de cada uno. */
  static async listByDespacho(tenantId: string, despachoEntryId: string) {
    if (!tenantId) throw new Error("tenantId is required");
    return prisma.forestCtpDespachoOrigen.findMany({
      where: { tenantId, despachoEntryId },
      orderBy: { createdAt: "asc" },
      include: {
        produccion: {
          select: {
            id: true, lineNo: true, entryDate: true, productType: true,
            speciesCommon: true, quantity: true, unit: true,
            // ADR-412/437: una corrida «de tercero» sin costo es madera de servicio.
            duenoMadera: true,
          },
        },
      },
    });
  }

  /**
   * COGS — cuánto costó la madera que salió en este despacho (ADR-135 D7).
   *
   *   COGS = Σ (origen.quantity × costoUnitario(corrida))
   *
   * El puente NO tiene costo propio a propósito: un 2º snap acá serían dos
   * relojes de congelado desincronizándose, y el COGS dependería de cuál se
   * leyó. Se deriva de la corrida, que ya congela al cierre (ADR-134 D6).
   *
   * Doble ponderación encadenada: cada corrida ya promedió sus guías por
   * volumen, y acá se promedian las corridas por lo despachado de cada una.
   *
   * Misma regla de oro: **falta un costo ⇒ null, NUNCA 0** (un 0 fingiría
   * margen 100%, que es peor que no saber). Y lo despachado sin corrida
   * atribuida hace el COGS desconocido por definición: no se puede costear lo
   * que no se sabe de dónde salió.
   */
  static async cogsDeDespacho(tenantId: string, despachoEntryId: string): Promise<CogsDespacho> {
    if (!tenantId) throw new Error("tenantId is required");

    const [despacho, origenes] = await Promise.all([
      prisma.forestCtpEntry.findFirst({
        where: { id: despachoEntryId, tenantId, deletedAt: null },
        select: { quantity: true, moneda: true },
      }),
      ForestCtpDespachoDB.listByDespacho(tenantId, despachoEntryId),
    ]);
    if (!despacho) throw new Error("Línea de despacho no encontrada");

    // El costo de cada corrida ya viene ponderado por sus guías (ADR-134 D6).
    const costos = await Promise.all(
      origenes.map((o) => ForestCtpConsumoDB.costoDeLinea(tenantId, o.produccionEntryId)),
    );

    // La REGLA vive en `lib/forestal/ctp-cogs.ts` (pura, con tests). Acá sólo se
    // leen los datos: el P&L del período aplica la misma función sobre datos
    // traídos en lote, y así los dos caminos no pueden dar números distintos.
    return decidirCogs({
      declarado: despacho.quantity ? Number(despacho.quantity) : 0,
      moneda: despacho.moneda,
      origenes: origenes.map((o, i) => ({
        lineNo: o.produccion.lineNo,
        quantity: Number(o.quantity),
        costoUnitario: costos[i].costoUnitario,
        moneda: costos[i].moneda,
        congelado: costos[i].congelado,
        maderaDeServicio: corridaDeServicio({ ...costos[i], duenoMadera: o.produccion.duenoMadera }),
        mezclaServicio: corridaMixta(costos[i]),
      })),
    });
  }

  /**
   * Margen de un despacho = valor de venta − COGS (ADR-141). Regla de oro: si
   * falta la venta O el costo, el margen es null (NUNCA 0 — un 0 fingiría margen).
   */
  static async margenDeDespacho(tenantId: string, despachoEntryId: string): Promise<MargenDespacho> {
    if (!tenantId) throw new Error("tenantId is required");
    const [cogsR, despacho] = await Promise.all([
      ForestCtpDespachoDB.cogsDeDespacho(tenantId, despachoEntryId),
      prisma.forestCtpEntry.findFirst({ where: { id: despachoEntryId, tenantId, deletedAt: null }, select: { valorVenta: true } }),
    ]);
    const venta = despacho?.valorVenta != null ? Number(despacho.valorVenta) : null;
    const { margen, margenPct, motivo } = decidirMargen(venta, cogsR.cogs, cogsR.motivo);
    return { valorVenta: venta, cogs: cogsR.cogs, margen, margenPct, moneda: cogsR.moneda ?? "PEN", motivo };
  }

  /**
   * Registra el valor de VENTA de un despacho (ADR-141). Es un dato COMERCIAL,
   * no del acta de trazabilidad — por eso NO lo bloquea el cierre de período (la
   * venta puede registrarse después de cerrar la producción del mes).
   */
  static async setValorVenta(tenantId: string, despachoEntryId: string, valorVenta: number | null, user = "unknown"): Promise<void> {
    if (!tenantId) throw new Error("tenantId is required");
    if (valorVenta != null && valorVenta < 0) throw new Error("El valor de venta no puede ser negativo");
    const e = await prisma.forestCtpEntry.findFirst({ where: { id: despachoEntryId, tenantId, deletedAt: null }, select: { section: true, lineNo: true, entryDate: true } });
    if (!e) throw new Error("Despacho no encontrado");
    if (e.section !== "despacho") throw new Error("El valor de venta solo aplica a una línea de despacho");

    // Cierre de período (ADR-139): el P&L NO se congela en el cierre — se deriva
    // on-read de `valorVenta`. Sin este guard, editar la venta de un despacho de
    // un mes cerrado cambiaba el margen de un período ya cerrado, mientras el
    // resto del libro seguía inmutable.
    const cerradoVenta = await ForestCtpCierreDB.closedPeriodOf(tenantId, e.entryDate);
    if (cerradoVenta) {
      throw new CtpInvariantError(
        `El período ${cerradoVenta.label} está cerrado: no se puede cambiar el valor de venta de un despacho de un mes cerrado.`,
        "PERIODO_CERRADO",
        { periodKey: cerradoVenta.periodKey },
      );
    }
    await prisma.forestCtpEntry.update({
      where: { id: despachoEntryId, tenantId } satisfies Prisma.ForestCtpEntryWhereUniqueInput,
      data: { valorVenta: valorVenta != null ? new Prisma.Decimal(valorVenta) : null },
    });
    auditCtp({
      tenantId,
      action: "ctp_venta_set",
      entity: "ForestCtpEntry",
      entityId: despachoEntryId,
      detail: `Registró el valor de venta del despacho #${e.lineNo}: ${valorVenta != null ? `S/ ${valorVenta}` : "borrado"}`,
      user,
    });
    try { invalidateByPrefix(`${CACHE_PREFIX}:${tenantId}`); } catch { /* cache best-effort */ }
  }

  /**
   * P&L del período (ADR-141): venta − COGS agregado sobre los despachos vivos.
   * El margen total cubre SOLO los "completos" (con venta Y costo conocidos); los
   * que les falta venta o costo se cuentan aparte y NO se suman (no se inventa
   * margen). Itera despacho por despacho reusando `margenDeDespacho`.
   */
  static async pnlDelPeriodo(tenantId: string, opts: { fromDate?: Date; toDate?: Date } = {}): Promise<PnlPeriodo> {
    if (!tenantId) throw new Error("tenantId is required");
    const where: Prisma.ForestCtpEntryWhereInput = { tenantId, section: "despacho", deletedAt: null, status: "registrado" };
    if (opts.fromDate || opts.toDate) {
      where.entryDate = {};
      if (opts.fromDate) where.entryDate.gte = opts.fromDate;
      if (opts.toDate) where.entryDate.lte = opts.toDate;
    }
    // Antes esto era 1 + D×(3+O) queries: por cada despacho se volvía a pedir la
    // línea, sus orígenes y el costo de cada corrida citada. Con 100 despachos
    // eran ~600 viajes a la base. Ahora son 2 queries + una por corrida ÚNICA
    // (varios despachos suelen salir de las mismas corridas).
    const despachos = await prisma.forestCtpEntry.findMany({
      where,
      orderBy: { lineNo: "asc" },
      select: {
        id: true, lineNo: true, productType: true, speciesCommon: true, gtfNumber: true,
        // Se traen acá para no volver a pedir la línea despacho por despacho.
        quantity: true, moneda: true, valorVenta: true,
      },
    });

    const origenesTodos = despachos.length
      ? await prisma.forestCtpDespachoOrigen.findMany({
          where: { tenantId, despachoEntryId: { in: despachos.map((d) => d.id) } },
          orderBy: { createdAt: "asc" },
          include: { produccion: { select: { id: true, lineNo: true, duenoMadera: true } } },
        })
      : [];

    const porDespachoId = new Map<string, typeof origenesTodos>();
    for (const o of origenesTodos) {
      const arr = porDespachoId.get(o.despachoEntryId) ?? [];
      arr.push(o);
      porDespachoId.set(o.despachoEntryId, arr);
    }

    // Una corrida citada por diez despachos se costea UNA vez.
    const corridas = [...new Set(origenesTodos.map((o) => o.produccionEntryId))];
    const costosPorCorrida = new Map(
      await Promise.all(
        corridas.map(async (id) => [id, await ForestCtpConsumoDB.costoDeLinea(tenantId, id)] as const),
      ),
    );

    const filas: FilaPnl[] = despachos.map((d) => {
      const origenes = porDespachoId.get(d.id) ?? [];
      // MISMA función que `cogsDeDespacho`: el P&L no puede dar otro número que la ficha.
      const cogsR = decidirCogs({
        declarado: d.quantity ? Number(d.quantity) : 0,
        moneda: d.moneda,
        origenes: origenes.map((o) => {
          const c = costosPorCorrida.get(o.produccionEntryId);
          return {
            lineNo: o.produccion.lineNo,
            quantity: Number(o.quantity),
            costoUnitario: c?.costoUnitario ?? null,
            moneda: c?.moneda ?? null,
            congelado: c?.congelado ?? false,
            maderaDeServicio: c ? corridaDeServicio({ ...c, duenoMadera: o.produccion.duenoMadera }) : false,
            mezclaServicio: c ? corridaMixta(c) : false,
          };
        }),
      });
      const venta = d.valorVenta != null ? Number(d.valorVenta) : null;
      const { margen, margenPct, motivo } = decidirMargen(venta, cogsR.cogs, cogsR.motivo);
      return {
        id: d.id, lineNo: d.lineNo, producto: `${d.productType ?? "—"} · ${d.speciesCommon ?? "—"}`, gtfSalida: d.gtfNumber ?? null,
        valorVenta: venta, cogs: cogsR.cogs, margen, margenPct, moneda: cogsR.moneda ?? "PEN", motivo,
      };
    });

    // La suma (completos / incompletos / de servicio / mixtos) es pura y tiene tests.
    return agregarPnl(filas);
  }

  /**
   * ¿La cadena de custodia de este despacho está completa (ADR-135 D3)?
   *
   * El LIBRO admite huecos (I4 es `≤`): forzar atribución total haría que el
   * operador invente un origen para poder guardar. El CERTIFICADO no: acá se
   * mueve el gate. Esto NO bloquea el guardado — bloquea afirmar cumplimiento.
   *
   * Completa = el despacho atribuye el 100% a corridas Y cada una de esas
   * corridas tiene su propia materia prima atribuida (si no, la cadena se corta
   * un eslabón más atrás y el certificado mentiría igual).
   */
  static async trazabilidadCompleta(tenantId: string, despachoEntryId: string): Promise<TrazabilidadDespacho> {
    if (!tenantId) throw new Error("tenantId is required");

    const despacho = await prisma.forestCtpEntry.findFirst({
      where: { id: despachoEntryId, tenantId, deletedAt: null },
      select: { quantity: true },
    });
    if (!despacho) throw new Error("Línea de despacho no encontrada");

    const origenes = await ForestCtpDespachoDB.listByDespacho(tenantId, despachoEntryId);
    /* Las piezas que se fueron enteras (ADR-363): atribuyen igual que una
       corrida, sólo que su origen es el ingreso. Sin contarlas, una venta en
       rollo figuraba como 100 % sin atribuir y no podía certificar nunca. */
    const trozasCrudas = await prisma.woodEntryTroza.findMany({
      where: { tenantId, despachadaEnId: despachoEntryId },
      select: { id: true, codificacion: true, volumenM3: true, entry: { select: { gtfNumber: true } } },
      orderBy: { orden: "asc" },
    });
    const trozas = trozasCrudas.map((t) => ({
      id: t.id,
      codificacion: t.codificacion,
      volumenM3: Number(t.volumenM3 ?? 0),
      gtfIngreso: t.entry.gtfNumber,
    }));
    const declarado = despacho.quantity ? Number(despacho.quantity) : 0;
    const atribuido = r4(
      origenes.reduce((a, o) => a + Number(o.quantity), 0) + trozas.reduce((a, t) => a + t.volumenM3, 0),
    );
    const sinAtribuir = r4(Math.max(0, declarado - atribuido));

    // Un eslabón más atrás: ¿cada corrida sabe de qué ingresos salió?
    const consumos = origenes.length
      ? await prisma.forestCtpConsumo.groupBy({
          by: ["ctpEntryId"],
          where: { tenantId, ctpEntryId: { in: origenes.map((o) => o.produccionEntryId) } },
          _count: { _all: true },
        })
      : [];
    const conOrigen = new Set(consumos.filter((c) => c._count._all > 0).map((c) => c.ctpEntryId));

    const guiasPorCorrida = origenes.length
      ? await prisma.forestCtpConsumo.findMany({
          where: { tenantId, ctpEntryId: { in: origenes.map((o) => o.produccionEntryId) } },
          select: { ctpEntryId: true, woodEntry: { select: { gtfNumber: true } } },
        })
      : [];

    /* Y un eslabón más: de qué LOTE DE ASERRÍO salió cada corrida (ADR-337).
       Es la pregunta del patio —«¿de qué pila es este paquete?»— y hasta acá la
       cadena llegaba sólo hasta la corrida. */
    const lotes = origenes.length
      ? await prisma.forestLoteAserrio.findMany({
          where: {
            tenantId,
            deletedAt: null,
            produccionEntryId: { in: origenes.map((o) => o.produccionEntryId) },
          },
          select: { code: true, produccionEntryId: true, _count: { select: { trozas: true } } },
        })
      : [];
    const lotePorCorrida = new Map(
      lotes
        .filter((l): l is typeof l & { produccionEntryId: string } => Boolean(l.produccionEntryId))
        .map((l) => [l.produccionEntryId, { code: l.code, piezas: l._count.trozas }]),
    );

    const corridas = origenes.map((o) => ({
      produccionEntryId: o.produccionEntryId,
      lineNo: o.produccion.lineNo,
      quantity: Number(o.quantity),
      guias: guiasPorCorrida.filter((g) => g.ctpEntryId === o.produccionEntryId).map((g) => g.woodEntry.gtfNumber),
      sinOrigen: !conOrigen.has(o.produccionEntryId),
      loteAserrio: lotePorCorrida.get(o.produccionEntryId) ?? null,
    }));

    const motivo: TrazabilidadDespacho["motivo"] =
      origenes.length === 0 && trozas.length === 0
        ? "sin_atribucion"
        : sinAtribuir > 0
          ? "atribucion_parcial"
          : corridas.some((c) => c.sinOrigen)
            ? "corrida_sin_origen"
            : "ok";

    return { completa: motivo === "ok", declarado, atribuido, sinAtribuir, motivo, corridas, trozas };
  }

  /**
   * Agregado del período para el panel Cumplimiento: cuántos despachos NO
   * podrían emitir su certificado (ADR-135 D3).
   *
   * Mismos criterios que `trazabilidadCompleta()` — sin atribución, atribución
   * parcial o corrida citada sin materia prima propia. Si el panel y la ficha
   * usaran predicados distintos, el módulo se contradeciría en la cifra que ve
   * un fiscalizador (la misma lección que ya dejó el fuera-de-plazo).
   */
  static async trazabilidadDelPeriodo(
    tenantId: string,
    period?: { fromDate?: Date; toDate?: Date; especie?: string },
  ): Promise<{
    total: number;
    incompletos: number;
    lineas: number[];
    /**
     * Y CUÁLES, con su motivo. `lineas` sólo daba números: el panel podía decir
     * «3 despachos no certifican» y el operador no tenía dónde ir ni qué
     * arreglar. El motivo usa las mismas tres causas que `trazabilidadCompleta`,
     * o la lista y la ficha dirían cosas distintas de la misma guía.
     */
    detalle: {
      id: string;
      lineNo: number;
      entryDate: string;
      producto: string | null;
      gtfSalida: string | null;
      declarado: number;
      sinAtribuir: number;
      motivo: "sin_atribucion" | "atribucion_parcial" | "corrida_sin_origen";
      /** Las corridas citadas que no declaran de qué madera salieron. */
      corridasSinOrigen: number[];
    }[];
  }> {
    if (!tenantId) throw new Error("tenantId is required");

    const despachos = await prisma.forestCtpEntry.findMany({
      where: {
        tenantId,
        section: "despacho",
        status: "registrado",
        deletedAt: null,
        /* El recorte por especie (ADR-400). Va en el `where` y no en memoria
           porque en el libro la especie del despacho es una columna directa —a
           diferencia de una troza, que puede heredarla de su ingreso. */
        ...(period?.especie?.trim()
          ? { speciesCommon: { equals: period.especie.trim(), mode: "insensitive" as const } }
          : {}),
        ...(period?.fromDate || period?.toDate
          ? {
              entryDate: {
                ...(period.fromDate && { gte: period.fromDate }),
                ...(period.toDate && { lte: period.toDate }),
              },
            }
          : {}),
      },
      select: { id: true, lineNo: true, quantity: true, entryDate: true, productType: true, gtfNumber: true },
    });
    if (despachos.length === 0) return { total: 0, incompletos: 0, lineas: [], detalle: [] };

    const ids = despachos.map((d) => d.id);
    const [sumas, vinculos] = await Promise.all([
      prisma.forestCtpDespachoOrigen.groupBy({
        by: ["despachoEntryId"],
        where: { tenantId, despachoEntryId: { in: ids } },
        _sum: { quantity: true },
      }),
      prisma.forestCtpDespachoOrigen.findMany({
        where: { tenantId, despachoEntryId: { in: ids } },
        select: { despachoEntryId: true, produccionEntryId: true },
      }),
    ]);

    // Un eslabón más atrás (igual que trazabilidadCompleta): corridas sin consumo propio.
    const corridaIds = [...new Set(vinculos.map((v) => v.produccionEntryId))];
    const consumos = corridaIds.length
      ? await prisma.forestCtpConsumo.groupBy({
          by: ["ctpEntryId"],
          where: { tenantId, ctpEntryId: { in: corridaIds } },
          _count: { _all: true },
        })
      : [];
    const corridasConOrigen = new Set(consumos.filter((c) => c._count._all > 0).map((c) => c.ctpEntryId));

    const atribuidoPor = new Map(sumas.map((s) => [s.despachoEntryId, r4(Number(s._sum.quantity ?? 0))]));
    const corridasPor = new Map<string, string[]>();
    for (const v of vinculos) {
      const arr = corridasPor.get(v.despachoEntryId) ?? [];
      arr.push(v.produccionEntryId);
      corridasPor.set(v.despachoEntryId, arr);
    }

    /* Para poder nombrar la corrida que falla hace falta su N° de línea, no su
       id: es lo que el operador ve en la tabla. */
    const lineNoDeCorrida = new Map(
      (corridaIds.length
        ? await prisma.forestCtpEntry.findMany({
            where: { id: { in: corridaIds }, tenantId },
            select: { id: true, lineNo: true },
          })
        : []
      ).map((c) => [c.id, c.lineNo]),
    );

    const detalle: Awaited<ReturnType<typeof ForestCtpDespachoDB.trazabilidadDelPeriodo>>["detalle"] = [];
    for (const d of despachos) {
      const corridas = corridasPor.get(d.id) ?? [];
      const declarado = d.quantity ? Number(d.quantity) : 0;
      const sinAtribuir = r4(Math.max(0, declarado - (atribuidoPor.get(d.id) ?? 0)));
      const sinOrigen = corridas.filter((c) => !corridasConOrigen.has(c));
      /* El MISMO orden de causas que `trazabilidadCompleta`: primero la ausencia
         total, después el hueco parcial, y al final el eslabón de más atrás. */
      const motivo =
        corridas.length === 0 ? "sin_atribucion" : sinAtribuir > 0 ? "atribucion_parcial" : sinOrigen.length > 0 ? "corrida_sin_origen" : null;
      if (!motivo) continue;
      detalle.push({
        id: d.id,
        lineNo: d.lineNo,
        entryDate: d.entryDate.toISOString(),
        producto: d.productType,
        gtfSalida: d.gtfNumber,
        declarado,
        sinAtribuir,
        motivo,
        corridasSinOrigen: sinOrigen.map((c) => lineNoDeCorrida.get(c) ?? 0).filter(Boolean).sort((a, b) => a - b),
      });
    }
    detalle.sort((a, b) => a.lineNo - b.lineNo);
    return {
      total: despachos.length,
      incompletos: detalle.length,
      lineas: detalle.map((d) => d.lineNo),
      detalle,
    };
  }

  /**
   * Verificación PÚBLICA de un despacho — target del QR del certificado
   * (ADR-135 D3). Sin auth: el id es un cuid no adivinable y solo se expone
   * la cadena de origen, NUNCA costos ni precios (mismo criterio que
   * /verificar/[code] de trozas). Anulado ⇒ se dice, no se esconde.
   *
   * Además de la cadena responde las tres preguntas que quedaban afuera y que
   * son las que decide un comprador europeo o un fiscalizador:
   *   · ¿QUIÉN transformó? → identidad registral del CTP (nunca datos
   *     personales: ni DNI del representante, ni teléfono, ni email — Ley 29733).
   *   · ¿El papel que traigo existe? → el ANEXO N° 04 emitido para este despacho.
   *   · ¿Esto todavía puede cambiar? → si el mes está cerrado, es un acta.
   */
  static async verificacionPublica(tenantId: string, despachoEntryId: string) {
    if (!tenantId) throw new Error("tenantId is required");

    const despacho = await prisma.forestCtpEntry.findFirst({
      where: { id: despachoEntryId, tenantId, section: "despacho", deletedAt: null },
      select: {
        id: true, lineNo: true, entryDate: true, status: true,
        productType: true, speciesCommon: true, speciesScientific: true, cites: true,
        quantity: true, unit: true, pieces: true, gtfNumber: true, destino: true,
      },
    });
    if (!despacho) return null;

    const [trazabilidad, ficha, anexos, cerrado] = await Promise.all([
      ForestCtpDespachoDB.trazabilidadCompleta(tenantId, despachoEntryId),
      ForestCtpFichaDB.get(tenantId).catch(sinDato("forest-ctp-despacho.db ficha del establecimiento")),
      ForestAnexosDB.list(tenantId).catch(() => []),
      ForestCtpCierreDB.closedPeriodOf(tenantId, despacho.entryDate).catch(sinDato("forest-ctp-despacho.db período cerrado del despacho")),
    ]);

    const anexo = anexos.find((a) => a.ctpEntryId === despachoEntryId);

    return {
      despacho,
      trazabilidad,
      /** Sólo identidad registral del establecimiento — es lo que se verifica. */
      establecimiento: ficha
        ? {
            nombreCtp: ficha.nombreCtp,
            codigoCtp: ficha.codigoCtp,
            razonSocial: ficha.razonSocial,
            ruc: ficha.ruc,
            arffs: ficha.arffs,
            registroArffs: ficha.registroArffs,
            region: ficha.region,
            provincia: ficha.provincia,
            distrito: ficha.distrito,
          }
        : null,
      /** El anexo que viaja con la guía: se contrasta el papel contra el libro. */
      anexo: anexo
        ? {
            numero: anexo.numero,
            gtf: anexo.gtf,
            fecha: anexo.fecha,
            hojas: anexo.hojas,
            totalPiezas: anexo.totalPiezas,
            totalM3: anexo.totalM3,
          }
        : null,
      /** Período cerrado = la línea ya no se puede editar ni anular. */
      periodoCerrado: cerrado ? { label: cerrado.label, closedAt: cerrado.closedAt } : null,
    };
  }

  /**
   * Guarda el cuerpo de la Guía de Transporte Forestal del despacho (propietario,
   * destinatario, transportista, vehículo, traslado, títulos).
   *
   * Guardar admite huecos —el transportista suele definirse a última hora— y es
   * IMPRIMIR el original lo que exige la guía completa: mismo criterio que el
   * resto del libro (el acta admite huecos, el documento que se presenta no).
   *
   * Sí respeta el cierre de período: una guía de un mes cerrado no se retoca.
   */
  static async guardarGtfDatos(
    tenantId: string,
    despachoEntryId: string,
    datos: unknown,
    user = "unknown",
  ): Promise<{ ok: true } | { ok: false; reason: "no_despacho" | "anulado" | "emitida"; gtf?: string }> {
    if (!tenantId) throw new Error("tenantId is required");

    const desp = await prisma.forestCtpEntry.findFirst({
      where: { id: despachoEntryId, tenantId, deletedAt: null },
      select: { id: true, section: true, status: true, lineNo: true, entryDate: true, gtfNumber: true },
    });
    if (!desp || desp.section !== "despacho") return { ok: false, reason: "no_despacho" };
    if (desp.status !== "registrado") return { ok: false, reason: "anulado" };

    /**
     * Una guía EMITIDA no se edita (ADR-374).
     *
     * Mientras no tiene número es un borrador: se corrige las veces que haga
     * falta porque todavía no es un documento. Con número ya identifica un
     * traslado ante la autoridad —y puede estar impresa y viajando en la
     * cabina—, así que cambiarle el destinatario o el volumen por detrás sería
     * dejar el libro diciendo una cosa y el papel otra.
     *
     * El guard va acá, en la DB class, y no sólo en el botón de la pantalla:
     * el endpoint es la única puerta que de verdad hay que cerrar.
     */
    if (!guiaEditable(desp.gtfNumber)) {
      return { ok: false, reason: "emitida", gtf: String(desp.gtfNumber).trim() };
    }

    const cerrado = await ForestCtpCierreDB.closedPeriodOf(tenantId, desp.entryDate);
    if (cerrado) {
      throw new CtpInvariantError(
        `El período ${cerrado.label} está cerrado: no se puede editar la guía de un mes cerrado.`,
        "PERIODO_CERRADO",
        { periodKey: cerrado.periodKey },
      );
    }

    await prisma.forestCtpEntry.update({
      where: { id: desp.id },
      data: { gtfDatos: datos as Prisma.InputJsonValue },
    });

    auditCtp({
      tenantId,
      action: "ctp_gtf_datos",
      entity: "ForestCtpEntry",
      entityId: desp.id,
      detail: `Completó los datos de la guía del despacho #${desp.lineNo}${desp.gtfNumber ? ` (GTF ${desp.gtfNumber})` : ""}`,
      user,
    });
    return { ok: true };
  }

  /**
   * La guía de un despacho: su número y su cuerpo, leídos de la base.
   *
   * El número viene de acá y no de la fila que el cliente ya tenía en la lista
   * porque emitir la GTF lo cambia: si la vista se queda con la copia vieja, una
   * guía emitida se muestra "sin emitir" y el operador la vuelve a emitir.
   *
   * `gtfDatos` se devuelve como JSON crudo: la forma la valida `leerGtfDatos()`
   * del lado del que lo consume, que tolera versiones viejas del formulario (un
   * formulario que no abre es peor que uno con un campo vacío).
   */
  static async guiaDeDespacho(
    tenantId: string,
    despachoEntryId: string,
  ): Promise<{ gtfNumber: string | null; gtfDatos: unknown }> {
    if (!tenantId) throw new Error("tenantId is required");
    const row = await prisma.forestCtpEntry.findFirst({
      where: { id: despachoEntryId, tenantId, deletedAt: null, section: "despacho" },
      select: { gtfNumber: true, gtfDatos: true },
    });
    return { gtfNumber: row?.gtfNumber ?? null, gtfDatos: row?.gtfDatos ?? null };
  }

  /**
   * Los números que ya ocupan el talonario de GTF de salida (ADR-446).
   *
   * Despachos con número —vigentes, anulados y dados de baja: un número del
   * talonario que se escribió en el libro no vuelve—, más los números de guía de
   * los Anexos 04 guardados. Esos anexos son el único rastro de las guías
   * 054…064 de Blas: sin ellos el siguiente salía del 000001.
   *
   * El KV de anexos se lee FRESCO (`getFresco`, sin caché por instancia) con la
   * misma clave que `ForestAnexosDB` (`ctp-anexos:<tenantId>`). `db` es la tx
   * cuando se lee bajo el lock de la emisión.
   */
  private static async gtfUsadas(
    db: Prisma.TransactionClient | typeof prisma,
    tenantId: string,
    anexos: unknown,
  ): Promise<GtfUsada[]> {
    const despachos = await db.forestCtpEntry.findMany({
      where: { tenantId, section: "despacho", gtfNumber: { not: null } },
      select: { id: true, lineNo: true, status: true, deletedAt: true, gtfNumber: true, entryDate: true },
    });
    const usados: GtfUsada[] = [];
    for (const d of despachos) {
      const numero = (d.gtfNumber ?? "").trim();
      if (!numero) continue;
      usados.push({
        numero,
        fuente: d.status === "registrado" && d.deletedAt == null ? "despacho" : "despacho_anulado",
        despachoId: d.id,
        lineNo: d.lineNo,
        fecha: d.entryDate.toISOString().slice(0, 10),
      });
    }
    for (const a of Array.isArray(anexos) ? anexos : []) {
      const o = (a ?? {}) as Record<string, unknown>;
      const numero = typeof o.gtf === "string" ? o.gtf.trim() : "";
      if (!numero) continue;
      /* Un anexo apunta a su despacho de dos maneras: `ctpEntryId` (emitido
         desde la línea) y `despachoIds[]` (registrado después por el puente
         anexo → despacho, ADR-446). Se juntan las dos. */
      const despachoIds = [
        ...(typeof o.ctpEntryId === "string" && o.ctpEntryId ? [o.ctpEntryId] : []),
        ...(Array.isArray(o.despachoIds) ? o.despachoIds.filter((x): x is string => typeof x === "string" && x.length > 0) : []),
      ].filter((id, i, todos) => todos.indexOf(id) === i);
      usados.push({
        numero,
        fuente: "anexo",
        despachoId: despachoIds[0] ?? null,
        despachoIds,
        fecha: typeof o.fecha === "string" ? o.fecha : null,
        anexoNumero: typeof o.numero === "string" ? o.numero : null,
      });
    }
    return usados;
  }

  /** El KV de los Anexos 04 guardados, sin caché (misma clave que `ForestAnexosDB`). */
  private static anexosFrescos(tenantId: string): Promise<unknown> {
    return PlatformSettingsDB.getFresco<unknown>(`ctp-anexos:${tenantId}`);
  }

  /**
   * El número que «Emitir GTF» propone, SIN escribir nada (ADR-446): la pantalla
   * lo muestra y el operador lo confirma o lo cambia antes de emitir.
   */
  static async proximaGtf(
    tenantId: string,
  ): Promise<{ ok: true; propuesta: PropuestaGtf } | { ok: false; reason: "serie_no_configurada" }> {
    if (!tenantId) throw new Error("tenantId is required");
    const ficha = await ForestCtpFichaDB.getFresco(tenantId);
    const serie = ficha.gtfSerie.trim();
    if (!serie) return { ok: false, reason: "serie_no_configurada" };
    const usados = await ForestCtpDespachoDB.gtfUsadas(prisma, tenantId, await ForestCtpDespachoDB.anexosFrescos(tenantId));
    return { ok: true, propuesta: proponerGtf(serie, ficha.gtfDigitos ?? null, usados) };
  }

  /**
   * Emite la GTF de SALIDA formal de un despacho: le asigna serie + correlativo
   * a partir de la **serie autorizada por la ARFFS** (ficha del CTP), en lugar
   * del texto libre que se tipeaba en `gtfNumber`. El CTP está habilitado a
   * emitir su propia GTF de salida (FAQ GTF SERFOR); esto le da número trazable.
   *
   * El correlativo se saca DENTRO de la tx con LOCK sobre los despachos del
   * tenant (el recurso disputado) para que dos emisiones concurrentes no repitan
   * número — mismo patrón que `lineNo` (forest-ctp) y `loteCode` (forest-lote).
   * Se deriva del MÁXIMO correlativo de todo lo usado (`gtfUsadas`: despachos
   * vigentes y anulados + Anexos 04), comparado por tramos numéricos, y se
   * escribe con los dígitos de la Ficha (ADR-446) — sin columna nueva.
   *
   * `numero` = lo que el operador confirmó (o cambió) sobre la propuesta de
   * `proximaGtf`. Tiene que ser de la serie de la Ficha (o sólo el correlativo)
   * y no puede llevarlo otro despacho vigente (`gtf_en_uso`, HTTP 409) salvo
   * que el operador confirme que es LA MISMA guía (`mismaGuiaQue` = el id de
   * esa línea: un camión con dos productos). Si se adelanta más de
   * `GTF_SALTO_MAX` sobre la propuesta es casi seguro un tipeo y pide
   * `confirmarSalto` (`salto_de_correlativo`, 422). Sin `numero` se emite la
   * propuesta, como antes.
   *
   * Idempotente: si el despacho ya tiene una GTF de esta serie, la devuelve sin
   * re-numerar (`yaEmitida:true`). NO exige cadena completa: la GTF ampara el
   * transporte; el gate de trazabilidad total vive en el certificado (ADR-135 D3).
   */
  static async emitirGtf(
    tenantId: string,
    despachoEntryId: string,
    user: string,
    numero?: string,
    confirmacion: { mismaGuiaQue?: string | null; confirmarSalto?: boolean } = {},
  ): Promise<
    | { ok: true; gtf: string; serie: string; correlativo: number; digitos: number; yaEmitida: boolean }
    | { ok: false; reason: "serie_no_configurada" | "no_despacho" | "anulado" }
    | { ok: false; reason: "fuera_de_serie"; serie: string; propuesta: string }
    | { ok: false; reason: "gtf_en_uso"; gtf: string; usadaPor: GtfUsada; propuesta: string }
    | { ok: false; reason: "salto_de_correlativo"; gtf: string; propuesta: string; salto: number }
  > {
    if (!tenantId) throw new Error("tenantId is required");
    if (!despachoEntryId) throw new Error("despachoEntryId is required");
    if (!user?.trim()) throw new Error("user is required");

    // Cierre de período (ADR-139): numerar la GTF de salida ESCRIBE `gtfNumber`
    // en la línea, y una línea de un mes cerrado es inmutable como cualquier otra.
    const despFecha = await prisma.forestCtpEntry.findFirst({ where: { id: despachoEntryId, tenantId }, select: { entryDate: true } });
    const cerradoGtf = despFecha ? await ForestCtpCierreDB.closedPeriodOf(tenantId, despFecha.entryDate) : null;
    if (cerradoGtf) {
      throw new CtpInvariantError(
        `El período ${cerradoGtf.label} está cerrado: no se puede emitir la GTF de un despacho de un mes cerrado.`,
        "PERIODO_CERRADO",
        { periodKey: cerradoGtf.periodKey },
      );
    }

    const ficha = await ForestCtpFichaDB.getFresco(tenantId);
    const serie = ficha.gtfSerie.trim();
    if (!serie) return { ok: false, reason: "serie_no_configurada" };
    // Los anexos viven en el KV, fuera de la tx: se leen antes de tomar el lock.
    const anexos = await ForestCtpDespachoDB.anexosFrescos(tenantId);

    return prisma.$transaction(async (tx) => {
      /* Lock de los despachos del tenant = serializa la asignación del
         correlativo. Va ANTES de leer la línea: si otra pestaña le está
         poniendo número a esta misma, se espera a que termine y se lee lo que
         dejó (si se leyera antes, se vería «sin número» y se la pisaría). */
      await tx.$queryRaw`
        SELECT "id" FROM "ForestCtpEntry"
        WHERE "tenantId" = ${tenantId} AND "section" = 'despacho' AND "deletedAt" IS NULL
        ORDER BY "id"
        FOR UPDATE
      `;
      const desp = await tx.forestCtpEntry.findFirst({
        where: { id: despachoEntryId, tenantId, deletedAt: null },
        select: { id: true, section: true, status: true, lineNo: true, gtfNumber: true, productType: true, speciesCommon: true },
      });
      if (!desp || desp.section !== "despacho") return { ok: false as const, reason: "no_despacho" as const };
      if (desp.status !== "registrado") return { ok: false as const, reason: "anulado" as const };

      // Ya tiene una GTF formal de esta serie ⇒ devolverla, no re-numerar.
      const already = correlativoEnSerie(desp.gtfNumber, serie);
      if (already) {
        return {
          ok: true as const, gtf: (desp.gtfNumber ?? "").trim(), serie, correlativo: already.correlativo,
          digitos: already.digitos, yaEmitida: true,
        };
      }

      const usados = await ForestCtpDespachoDB.gtfUsadas(tx, tenantId, anexos);
      const propuesta = proponerGtf(serie, ficha.gtfDigitos ?? null, usados);

      let gtf = propuesta.gtf;
      let correlativo = propuesta.correlativo;
      if (numero?.trim()) {
        const leido = leerGtfConfirmada(numero, serie, propuesta.digitos);
        if (!leido.ok) return { ok: false as const, reason: "fuera_de_serie" as const, serie, propuesta: propuesta.gtf };
        gtf = leido.gtf;
        correlativo = leido.correlativo;
      }
      const usadaPor = gtfEnUso(gtf, usados, despachoEntryId, confirmacion.mismaGuiaQue);
      if (usadaPor) return { ok: false as const, reason: "gtf_en_uso" as const, gtf, usadaPor, propuesta: propuesta.gtf };
      /* La misma guía que otra línea: el número ya está en el talonario, no
         corre el máximo y no hay salto que preguntar. */
      const mismaGuia = usados.find(
        (u) => u.fuente === "despacho" && u.despachoId === confirmacion.mismaGuiaQue && u.despachoId !== despachoEntryId && mismoNumeroGtf(u.numero, gtf),
      );
      const salto = mismaGuia ? null : saltoDeCorrelativo(correlativo, propuesta);
      if (salto != null && !confirmacion.confirmarSalto) {
        return { ok: false as const, reason: "salto_de_correlativo" as const, gtf, propuesta: propuesta.gtf, salto };
      }

      await tx.forestCtpEntry.updateMany({
        where: { id: despachoEntryId, tenantId },
        data: { gtfNumber: gtf },
      });

      auditCtp({
        tenantId,
        action: "ctp_gtf_emitir",
        entity: "ForestCtpEntry",
        entityId: despachoEntryId,
        detail:
          `Emitió la GTF de salida ${gtf} para el despacho #${desp.lineNo} (${desp.speciesCommon ?? "—"} · ${desp.productType ?? "—"})` +
          (mismaGuia
            ? ` · misma guía que el despacho #${mismaGuia.lineNo ?? "—"} (lo confirmó el operador)`
            : gtf !== propuesta.gtf
              ? ` · el sistema proponía ${propuesta.gtf}${salto != null ? ` (salto de ${salto} confirmado)` : ""}`
              : ""),
        user,
      });
      try { invalidateByPrefix(`${CACHE_PREFIX}:${tenantId}`); } catch { /* cache best-effort */ }
      return { ok: true as const, gtf, serie, correlativo, digitos: propuesta.digitos, yaEmitida: false };
    }, CTP_TX_OPTS);
  }
}
