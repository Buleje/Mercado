import "server-only";
import { prisma } from "@/lib/prisma";
import { auditCtp } from "@/lib/forestal/ctp-audit";
import { ForestCtpCierreDB } from "@/lib/db/forest-ctp-cierre.db";
import { invalidateByPrefix } from "@/lib/cache";
import { logger } from "@/lib/logger";

/**
 * Vaciar el Libro de Operaciones del CTP — entero o por alcance.
 *
 * Es la operación más destructiva del módulo: borra el registro que acredita el
 * origen legal de la madera. Existe porque un libro cargado mal —una importación
 * de prueba, un archivo equivocado— deja el saldo inservible y rehacerlo fila
 * por fila no es viable. Pero se trata como lo que es.
 *
 * GUARDS, y ninguno es opcional:
 *
 * 1. **Los períodos cerrados no se tocan.** Un mes cerrado ya se presentó ante
 *    SERFOR; borrarlo deja al titular sin poder respaldar lo que declaró. Si hay
 *    alguno, la purga se niega ENTERA y dice cuál — reabrirlo es una decisión
 *    aparte, con su propio rastro. Aplica a los cuatro alcances por igual.
 * 2. **Un alcance parcial nunca rompe lo que deja vivo.** `corridasSinTocar()`
 *    saca de la lista cualquier corrida todavía referenciada (la lista completa,
 *    más abajo). El filtro va primero para poder decir CUÁNTAS se saltaron en
 *    vez de fallar la transacción entera (Brandon, 2026-09-01).
 *    ⚠️ El `onDelete: Restrict` es red de seguridad SÓLO para despacho,
 *    reproceso y lote comercial. El lote de aserrío y las trozas NO tienen esa
 *    red —id suelto y `SetNull` respectivamente—, así que para ellos el filtro
 *    no es la primera línea de defensa: es la única.
 * 3. **Siempre se cuenta antes de borrar**, y el conteo se le muestra al
 *    operador. Un «¿seguro?» sin números no es una confirmación informada.
 * 4. **Queda auditado** con el detalle de cuánto se borró de cada cosa. Un libro
 *    que desaparece sin rastro es exactamente lo que un fiscalizador buscaría.
 *
 * ## Los cuatro alcances
 *
 * | Alcance | Qué borra | Qué NUNCA toca |
 * |---|---|---|
 * | `trozas_disponibles` | Trozas del patio sin consumir, sin despachar, sin hijos de retrozado | El ingreso (GTF) — queda como evidencia, aunque quede en 0 piezas |
 * | `madera_disponible` | Corridas de producción con saldo (`quantity > 0`) y CERO referencia encima | Cualquier corrida referenciada — ver la lista completa abajo |
 * | `consumo` | TODAS las corridas de producción sin referencias encima (incluye las que no llegaron a declarar `quantity`) | Idem — se salta y CUENTA las que están tocadas |
 * | `todo` | El libro entero: ingresos, trozas, producción, despachos, puentes | Nada — es el purge histórico, sin cambios de comportamiento |
 *
 * ## Qué cuenta como «referencia» (la lista, completa)
 *
 * Una corrida se salva si algo de esto la apunta: un **despacho**, un
 * **reproceso** (como origen o como destino), un **lote comercial**
 * (`ForestProdLoteMiembro`, ADR-136), un **lote de aserrío**
 * (`ForestLoteAserrio`, ADR-334) o una **troza** que declara haberse consumido
 * en ella.
 *
 * ⛔ Los dos últimos FALTABAN hasta 2026-09-05, y ninguno de los dos falla solo:
 * `ForestLoteAserrio.produccionEntryId` es un id suelto sin `@relation`, así que
 * no hay `onDelete: Restrict` que frene nada; y la troza es `SetNull`, así que
 * el borrado pasa limpio y deja una pieza «consumida por nadie». Este docstring
 * decía «lote de producción» y con eso parecía cubrir los dos: `ForestProdLoteMiembro`
 * (comercial) y `ForestLoteAserrio` (el de la sierra) son cosas distintas con
 * nombres parecidos, y esa confusión es la que dejó el hueco.
 */

export type ScopeVaciado = "trozas_disponibles" | "madera_disponible" | "consumo" | "todo";

export type ConteoDelLibro = {
  ingresos: number;
  trozas: number;
  produccion: number;
  despachos: number;
  consumos: number;
  origenes: number;
  total: number;
  /** Sólo en `consumo`/`madera_disponible`: corridas que se salvaron por tener
   *  algo encima (despacho, reproceso, lote comercial, lote de aserrío o trozas
   *  consumidas) — no es un error, es el guard actuando. */
  saltadas?: number;
};

/** Una troza "disponible" para el vaciado: nunca tocó ni la sierra ni un camión,
 *  y no es una madre con hijos de retrozado (borrarla arrastraría a hijos que
 *  bien podrían estar consumidos). */
const TROZA_DISPONIBLE_WHERE = (tenantId: string) => ({
  tenantId,
  consumidaEnId: null,
  despachadaEnId: null,
  retrozos: { none: {} },
});

/**
 * Las corridas de PRODUCCIÓN que nada más referencia todavía — el candidato
 * seguro para un vaciado parcial. `soloConSaldo` filtra además a las que
 * declararon `quantity > 0` (madera aserrada disponible); sin el flag, trae
 * también las que consumieron trozas pero nunca llegaron a declarar producto
 * (una corrida a medio declarar sigue siendo "Consumo" del libro).
 */
async function corridasSinTocar(
  tenantId: string,
  soloConSaldo: boolean,
): Promise<{ id: string; quantity: unknown }[]> {
  const vivas = await prisma.forestCtpEntry.findMany({
    where: { tenantId, section: "produccion", deletedAt: null, status: "registrado" },
    select: { id: true, quantity: true },
  });
  if (vivas.length === 0) return [];
  const ids = vivas.map((v) => v.id);

  const [despachos, reprocesosOrigen, reprocesosDestino, loteMiembros, lotesAserrio, trozasConsumidas] =
    await Promise.all([
    prisma.forestCtpDespachoOrigen.findMany({
      where: { tenantId, produccionEntryId: { in: ids } },
      select: { produccionEntryId: true },
      distinct: ["produccionEntryId"],
    }),
    prisma.forestCtpReproceso.findMany({
      where: { tenantId, origenEntryId: { in: ids } },
      select: { origenEntryId: true },
      distinct: ["origenEntryId"],
    }),
    /* También como DESTINO: si esta corrida nació de reprocesar otra, borrarla
       se llevaría en cascada el reproceso que la originó — y el saldo de la
       corrida de ORIGEN (que ya la contaba como "reprocesada") de golpe
       recuperaría ese volumen como disponible sin que nadie lo haya tocado. */
    prisma.forestCtpReproceso.findMany({
      where: { tenantId, destinoEntryId: { in: ids } },
      select: { destinoEntryId: true },
      distinct: ["destinoEntryId"],
    }),
    prisma.forestProdLoteMiembro.findMany({
      where: { tenantId, produccionEntryId: { in: ids } },
      select: { produccionEntryId: true },
      distinct: ["produccionEntryId"],
    }),
    /* ⛔ El LOTE DE ASERRÍO (ADR-334) — el que faltaba, y el que más duele.
       `ForestLoteAserrio.produccionEntryId` es un id SUELTO: no tiene
       `@relation` en el schema, así que tampoco hay `onDelete: Restrict` que
       frene el borrado. Sin esta consulta, vaciar «Consumo» o «Madera
       disponible» borraba EN DURO la corrida que un lote todavía apunta: el
       lote quedaba en `consumido` señalando una fila inexistente y su
       producción y su rendimiento —lo que se mira— desaparecían del libro sin
       que nadie lo hubiera pedido.
       No confundir con `ForestProdLoteMiembro` de acá arriba: ése es el lote
       COMERCIAL (ADR-136). Son dos cosas distintas con nombres parecidos, y
       esa confusión es exactamente la que dejó el hueco. */
    prisma.forestLoteAserrio.findMany({
      where: { tenantId, deletedAt: null, produccionEntryId: { in: ids } },
      select: { produccionEntryId: true },
      distinct: ["produccionEntryId"],
    }),
    /* Y las TROZAS que declaran haberse consumido en esta corrida. Su relación
       es `onDelete: SetNull`, así que el borrado no falla: deja la troza con
       `consumidaEnId` en null pero conservando `fechaConsumo` y
       `loteAserrioId` — una pieza "consumida por nadie", que es peor que un
       error porque cuadra en los conteos y miente en la trazabilidad. */
    prisma.woodEntryTroza.findMany({
      where: { tenantId, consumidaEnId: { in: ids } },
      select: { consumidaEnId: true },
      distinct: ["consumidaEnId"],
    }),
  ]);
  const tocadas = new Set<string>([
    ...despachos.map((d) => d.produccionEntryId),
    ...reprocesosOrigen.map((r) => r.origenEntryId),
    ...reprocesosDestino.map((r) => r.destinoEntryId),
    ...loteMiembros.map((l) => l.produccionEntryId),
    ...lotesAserrio.map((l) => l.produccionEntryId).filter((x): x is string => Boolean(x)),
    ...trozasConsumidas.map((t) => t.consumidaEnId).filter((x): x is string => Boolean(x)),
  ]);

  return vivas.filter((v) => !tocadas.has(v.id) && (!soloConSaldo || Number(v.quantity ?? 0) > 0));
}

export class ForestCtpPurgaDB {
  /** Qué hay en el libro (o en el alcance elegido), para mostrarlo ANTES de borrar. */
  static async contar(tenantId: string, scope: ScopeVaciado = "todo"): Promise<ConteoDelLibro> {
    if (!tenantId) throw new Error("tenantId is required");

    if (scope === "trozas_disponibles") {
      const trozas = await prisma.woodEntryTroza.count({ where: TROZA_DISPONIBLE_WHERE(tenantId) });
      return { ingresos: 0, trozas, produccion: 0, despachos: 0, consumos: 0, origenes: 0, total: trozas };
    }

    if (scope === "madera_disponible" || scope === "consumo") {
      const [candidatas, vivasCount] = await Promise.all([
        corridasSinTocar(tenantId, scope === "madera_disponible"),
        prisma.forestCtpEntry.count({ where: { tenantId, section: "produccion", deletedAt: null, status: "registrado" } }),
      ]);
      const ids = candidatas.map((c) => c.id);
      const consumos = ids.length
        ? await prisma.forestCtpConsumo.count({ where: { tenantId, ctpEntryId: { in: ids } } })
        : 0;
      return {
        ingresos: 0,
        trozas: 0,
        produccion: candidatas.length,
        despachos: 0,
        consumos,
        origenes: 0,
        total: candidatas.length,
        saltadas: Math.max(0, vivasCount - candidatas.length),
      };
    }

    const [ingresos, trozas, entradas, consumos, origenes] = await Promise.all([
      prisma.woodEntry.count({ where: { tenantId } }),
      prisma.woodEntryTroza.count({ where: { tenantId } }),
      prisma.forestCtpEntry.groupBy({ by: ["section"], where: { tenantId }, _count: true }),
      prisma.forestCtpConsumo.count({ where: { tenantId } }),
      prisma.forestCtpDespachoOrigen.count({ where: { tenantId } }),
    ]);

    const porSeccion = (s: string) => entradas.find((e) => e.section === s)?._count ?? 0;
    const produccion = porSeccion("produccion");
    const despachos = porSeccion("despacho");

    return {
      ingresos,
      trozas,
      produccion,
      despachos,
      consumos,
      origenes,
      /* El total cuenta los REGISTROS del libro, no las filas puente: es el
         número que el operador reconoce como «lo que cargué». */
      total: ingresos + produccion + despachos,
    };
  }

  /** Los períodos cerrados que impiden vaciar (cualquier alcance). Vacío = se puede. */
  static async periodosQueBloquean(tenantId: string): Promise<string[]> {
    if (!tenantId) throw new Error("tenantId is required");
    const cierres = await ForestCtpCierreDB.list(tenantId);
    /* Un cierre reabierto sigue en el historial pero ya no bloquea: reabrirlo
       fue una decisión explícita, con su motivo y su rastro. */
    return cierres.filter((c) => !c.reabierto).map((c) => c.label || c.periodKey);
  }

  /**
   * Vacía el libro — entero o por alcance.
   *
   * Devuelve lo que se borró (y, en un alcance parcial, cuánto se salvó), para
   * poder decir exactamente qué pasó. Todo en una transacción: media purga deja
   * un libro peor que el que había —corridas sin sus ingresos— y eso sí sería
   * irrecuperable.
   */
  static async vaciar(
    tenantId: string,
    usuario: string,
    scope: ScopeVaciado = "todo",
  ): Promise<{ ok: true; borrado: ConteoDelLibro } | { ok: false; motivo: string; periodos: string[] }> {
    if (!tenantId) throw new Error("tenantId is required");

    const periodos = await ForestCtpPurgaDB.periodosQueBloquean(tenantId);
    if (periodos.length > 0) {
      return {
        ok: false,
        motivo:
          `Hay ${periodos.length} período${periodos.length === 1 ? "" : "s"} cerrado${periodos.length === 1 ? "" : "s"} ` +
          `(${periodos.join(", ")}). Un mes cerrado ya se presentó ante SERFOR: reabrilo primero si de verdad hay que borrarlo.`,
        periodos,
      };
    }

    if (scope === "trozas_disponibles") {
      const borrado = await ForestCtpPurgaDB.contar(tenantId, scope);
      await prisma.woodEntryTroza.deleteMany({ where: TROZA_DISPONIBLE_WHERE(tenantId) });
      auditCtp({
        tenantId,
        action: "ctp_libro_purga_parcial",
        entity: "ForestCtpLibro",
        entityId: tenantId,
        detail: `VACIÓ trozas disponibles: ${borrado.trozas} pieza(s) del patio sin consumir ni despachar. Los ingresos (GTF) quedaron intactos.`,
        user: usuario,
      });
      try { invalidateByPrefix(`wood-entries:${tenantId}`); } catch (e) {
        logger.error("[forest-ctp-purga] no se pudo invalidar el caché", { error: String(e) });
      }
      return { ok: true, borrado };
    }

    if (scope === "madera_disponible" || scope === "consumo") {
      const borrado = await ForestCtpPurgaDB.contar(tenantId, scope);
      const candidatas = await corridasSinTocar(tenantId, scope === "madera_disponible");
      const ids = candidatas.map((c) => c.id);
      if (ids.length > 0) {
        await prisma.$transaction(async (tx) => {
          await tx.forestCtpConsumo.deleteMany({ where: { tenantId, ctpEntryId: { in: ids } } });
          await tx.forestCtpEntry.deleteMany({ where: { tenantId, id: { in: ids } } });
        });
      }
      auditCtp({
        tenantId,
        action: "ctp_libro_purga_parcial",
        entity: "ForestCtpLibro",
        entityId: tenantId,
        detail:
          `VACIÓ ${scope === "madera_disponible" ? "madera aserrada disponible" : "Consumos"}: ${borrado.produccion} ` +
          `corrida(s) de producción, ${borrado.consumos} consumo(s) atribuido(s). ` +
          `${borrado.saltadas ?? 0} corrida(s) se salvaron por tener despacho, reproceso o lote de producción encima.`,
        user: usuario,
      });
      try { invalidateByPrefix(`forest-ctp:${tenantId}`); } catch (e) {
        logger.error("[forest-ctp-purga] no se pudo invalidar el caché", { error: String(e) });
      }
      return { ok: true, borrado };
    }

    const borrado = await ForestCtpPurgaDB.contar(tenantId, "todo");

    await prisma.$transaction(async (tx) => {
      /* Orden: primero lo que cuelga, después los padres. Las cascadas ya se
         encargarían, pero borrar explícitamente los puentes deja claro en el
         código qué se lleva la purga — y no depende de que nadie afloje un
         `onDelete` más adelante. */
      await tx.forestCtpDespachoOrigen.deleteMany({ where: { tenantId } });
      await tx.forestCtpConsumo.deleteMany({ where: { tenantId } });
      await tx.forestCtpReproceso.deleteMany({ where: { tenantId } });
      await tx.forestCtpEntry.deleteMany({ where: { tenantId } });
      /* Los retrozos primero: cuelgan de otra troza y borrar la madre antes
         dispararía la cascada sobre filas que ya no están. */
      await tx.woodEntryTroza.deleteMany({ where: { tenantId, trozaOrigenId: { not: null } } });
      await tx.woodEntryTroza.deleteMany({ where: { tenantId } });
      await tx.woodEntry.deleteMany({ where: { tenantId } });
    });

    auditCtp({
      tenantId,
      action: "ctp_libro_purga",
      entity: "ForestCtpLibro",
      entityId: tenantId,
      detail:
        `VACIÓ EL LIBRO DE OPERACIONES COMPLETO: ${borrado.ingresos} ingresos, ${borrado.trozas} trozas, ` +
        `${borrado.produccion} corridas, ${borrado.despachos} despachos, ${borrado.consumos} consumos atribuidos, ` +
        `${borrado.origenes} orígenes de despacho.`,
      user: usuario,
    });

    try {
      invalidateByPrefix(`forest-ctp:${tenantId}`);
      invalidateByPrefix(`wood-entries:${tenantId}`);
    } catch (e) {
      logger.error("[forest-ctp-purga] no se pudo invalidar el caché", { error: String(e) });
    }

    return { ok: true, borrado };
  }
}
