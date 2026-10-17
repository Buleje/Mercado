/**
 * lib/db/metas-avance-forestal.db.ts — lecturas del aserradero que las metas
 * necesitan y que ninguna clase forestal publica (ADR-488). SOLO LECTURA.
 *
 * Lo demás (ingreso, producción, despacho, LO-TH, Cubicador) se lee por
 * las clases de siempre (`ForestCtpDB`, `ForestCtpDespachoDB`, `ForestLothDB`,
 * `ForestCubicacionesDB`): acá sólo va lo que les falta.
 *
 * Fechas: `desde`/`hasta` son días «YYYY-MM-DD» de la ventana de la meta. Las
 * columnas son date-only (el libro las muestra con `timeZone: "UTC"`), así que
 * el día se compara en UTC: un ingreso guardado a las 04:08 UTC del 03-10 es
 * del 03-10, como lo dice el libro, aunque en Lima todavía fuera el 02-10.
 */
import "server-only";
import { prisma } from "@/lib/prisma";
import type { MovCuentaEntrada } from "@/lib/finance/resultado-del-negocio";

const DIA = /^\d{4}-\d{2}-\d{2}$/;

function diaUtc(fecha: string, nombre: string): Date {
  if (!DIA.test(fecha)) throw new Error(`${nombre} debe ser YYYY-MM-DD`);
  return new Date(`${fecha}T00:00:00.000Z`);
}

/** Un grupo de lotes aplicados de la ventana: misma fórmula, sentido y material. */
export interface CubicadoGrupo {
  /** "smalian" (m³) | "oxapampina" | "tablar" (PT) — decide la unidad de `volumen`. */
  formula: string;
  /** "compra" | "venta". */
  sentido: string;
  /** "troza" | "aserrada". */
  material: string;
  /** Σ volumen neto (después de descuentos), en la unidad de la fórmula. */
  volumen: number;
  lotes: number;
  /**
   * Lotes armados desde una cubicación guardada en el Cubicador de madera
   * (`cubicacionRefId`): esa madera ya cuenta en la meta «Madera aserrada
   * cubicada» y sumarla acá la contaría dos veces.
   */
  deCubicador: boolean;
}

/** Líneas vivas de producción o despacho del Libro CTP con cantidad, por la unidad que declaran. */
export interface CtpPorUnidad {
  section: "produccion" | "despacho";
  /** La unidad tal como se guardó (`m3`, `m³`, `pt`, `unidad`…); `null` = sin unidad (el libro asume m³). */
  unidad: string | null;
  cantidad: number;
  lineas: number;
}

export class MetasAvanceForestalDB {
  /**
   * Lo cubicado en la ventana: lotes de `ForestCubicacionTrozas` APLICADOS
   * (el borrador todavía se edita; el anulado no vale) y vivos, con `fecha`
   * entre `desde` y `hasta` (inclusive). Agrupado para que el que suma decida
   * la unidad de cada fila con `unidadDe(formula)`.
   */
  static async cubicadoDelRango(tenantId: string, desde: string, hasta: string): Promise<CubicadoGrupo[]> {
    if (!tenantId) throw new Error("tenantId is required");
    const gte = diaUtc(desde, "desde");
    const lte = diaUtc(hasta, "hasta");
    const filas = await prisma.forestCubicacionTrozas.groupBy({
      by: ["formula", "sentido", "material", "cubicacionRefId"],
      where: { tenantId, deletedAt: null, estado: "aplicada", fecha: { gte, lte } },
      _sum: { volumen: true },
      _count: { _all: true },
    });
    // `cubicacionRefId` parte el grupo por cubicación citada: se vuelve a juntar en «de cubicador sí/no».
    const grupos = new Map<string, CubicadoGrupo>();
    for (const f of filas) {
      const deCubicador = f.cubicacionRefId != null;
      const clave = [f.formula, f.sentido, f.material, deCubicador].join("|");
      const g = grupos.get(clave) ?? { formula: f.formula, sentido: f.sentido, material: f.material, volumen: 0, lotes: 0, deCubicador };
      g.volumen += Number(f._sum.volumen ?? 0);
      g.lotes += f._count._all;
      grupos.set(clave, g);
    }
    return [...grupos.values()];
  }

  /**
   * Los cargos de venta de madera en la cuenta del cliente (ADR-437): el mismo
   * `where` con que «Madera vendida» de Mi Plata los lee (`ResultadoNegocioDB`,
   * cargo vivo con concepto `venta`). Si la guía tiene cargo, manda el cargo
   * sobre el precio del despacho (`ventasDeMadera`).
   *
   * `fecha` es un instante: un día del formulario se guarda a las 00:00 UTC y
   * cuenta ese día; cualquier otra hora cuenta en su día de Lima (`diaDeFecha`).
   * El día de Lima nunca es posterior al de UTC, así que `desde` 00:00 UTC es el
   * piso exacto; arriba se trae un día de margen y el que suma decide el día de
   * cada venta con `diaDeFecha`.
   */
  static async cargosVentaMadera(tenantId: string, desde: string, hasta: string): Promise<MovCuentaEntrada[]> {
    if (!tenantId) throw new Error("tenantId is required");
    const gte = diaUtc(desde, "desde");
    const lt = new Date(diaUtc(hasta, "hasta").getTime() + 2 * 86_400_000);
    const filas = await prisma.forestCuentaMov.findMany({
      where: { tenantId, deletedAt: null, concepto: "venta", tipo: "cargo", fecha: { gte, lt } },
      select: {
        id: true, parteId: true, parteNombre: true, fecha: true, tipo: true, concepto: true, monto: true, moneda: true,
        referencia: true, ctpEntryId: true, liquidacionId: true, gtfNumber: true,
      },
    });
    return filas.map((m) => ({ ...m, monto: Number(m.monto) }));
  }

  /**
   * Producción y despacho del Libro CTP separados por unidad. Sólo se usa
   * cuando el período MEZCLA unidades: `ForestCtpDB.movimientoDelLibro` suma
   * pies tablares con m³ y devuelve `unidadProducido: null`, y ese total no se
   * puede convertir. Mismos predicados que su `linea()` (viva, `registrado`,
   * por sección) para que la meta no discuta con el tablero del libro.
   */
  static async ctpPorUnidad(tenantId: string, desde: string, hasta: string): Promise<CtpPorUnidad[]> {
    if (!tenantId) throw new Error("tenantId is required");
    const gte = diaUtc(desde, "desde");
    const lte = new Date(diaUtc(hasta, "hasta").getTime() + 86_400_000 - 1);
    const filas = await prisma.forestCtpEntry.groupBy({
      by: ["section", "unit"],
      where: {
        tenantId,
        deletedAt: null,
        status: "registrado",
        section: { in: ["produccion", "despacho"] },
        quantity: { gt: 0 },
        entryDate: { gte, lte },
      },
      _sum: { quantity: true },
      _count: { _all: true },
    });
    return filas.map((f) => ({
      section: f.section === "despacho" ? "despacho" : "produccion",
      unidad: f.unit ?? null,
      cantidad: Number(f._sum.quantity ?? 0),
      lineas: f._count._all,
    }));
  }
}
