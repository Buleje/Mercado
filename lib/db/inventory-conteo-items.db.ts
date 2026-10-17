import "server-only";
import { revalidateTag } from "next/cache";
import { prisma } from "@/lib/prisma";
import type { ConteoFisicoItem } from "@/lib/generated/prisma/client";

/**
 * InventoryConteoItemsDB — conteo físico de inventario (abrir, contar, cerrar).
 *
 * Audit project-wide 2026-05-19: migración de /api/inventory/conteo/[id]/items.
 * 2026-10-10: también abrir, listar y cerrar (antes eran `prisma.*` en la ruta).
 *
 * `ConteoFisicoItem` no tiene `tenantId`: su dueño se prueba por el conteo
 * (`conteo: { tenantId }` en el WHERE), nunca con un `if` después.
 */

export type TipoConteo = "completo" | "categoria" | "ubicacion";

export type ResumenCierreConteo = {
  totalItems: number;
  contados: number;
  conDiferencia: number;
  ajustados: number;
};

export type CierreConteo =
  | { ok: true; resumen: ResumenCierreConteo }
  | { ok: false; motivo: "no_encontrado" | "ya_cerrado" };

/**
 * Un conteo grande ajusta cientos de productos: con el default de Prisma (5 s)
 * la transacción se cortaba a la mitad del pooler. 20 s queda dentro de los
 * 30 s que Vercel le da a la ruta.
 */
const TX_CIERRE = { timeout: 20_000, maxWait: 10_000 } as const;

/**
 * Un PATCH que llega durante el cierre espera el candado del conteo hasta que el
 * cierre termina (hasta 20 s): con los 5 s de Prisma respondía 500 en vez de
 * «ya está cerrado».
 */
const TX_CONTAR = { timeout: 25_000, maxWait: 5_000 } as const;

/** Lo perdió una carrera: otro cierre del mismo conteo llegó antes. */
class ConteoYaCerrado extends Error {}

type MotivoNoEditable = "cerrado" | "item_no_encontrado";

/** Corta la transacción de `contarItem` y deshace el paso a EN_PROGRESO. */
class ConteoNoEditable extends Error {
  constructor(readonly motivo: MotivoNoEditable) {
    super(motivo);
  }
}

export type ConteoDeItem =
  | { ok: true; item: ConteoFisicoItem }
  | { ok: false; motivo: "no_encontrado" | MotivoNoEditable };

export const InventoryConteoItemsDB = {
  async findConteoInTenant(tenantId: string, conteoId: string) {
    return prisma.conteoFisico.findFirst({
      where: { id: conteoId, tenantId },
    });
  },

  async listItemsByConteo(tenantId: string, conteoId: string) {
    return prisma.conteoFisicoItem.findMany({
      where: { conteoId, conteo: { tenantId } },
      orderBy: { id: "asc" },
    });
  },

  async getProductsForItems(tenantId: string, productIds: number[]) {
    if (productIds.length === 0) return [];
    return prisma.product.findMany({
      where: { id: { in: productIds }, tenantId },
      select: {
        id: true,
        name: true,
        barcode: true,
        category: true,
        image: true,
        stock: true,
      },
    });
  },

  /**
   * Anota lo contado de un producto (y/o el check «ajustar») en un conteo abierto.
   *
   * Una transacción que arranca con `updateMany … status ∈ {INICIADO, EN_PROGRESO}
   * → EN_PROGRESO`: toma el mismo candado de fila que `cerrar`, así que un PATCH
   * que llega durante el cierre espera y después ve CERRADO. Antes se leía el
   * estado y se escribía el ítem por separado: un PATCH que leyó «abierto» justo
   * antes del cierre respondía 200 y lo contado quedaba fuera del ajuste.
   *
   * `stockContado` y `ajustado` son opcionales: se puede tildar o destildar
   * «ajustar» sin volver a contar el producto (se conserva la cuenta anterior).
   */
  async contarItem(
    tenantId: string,
    conteoId: string,
    itemId: string,
    input: { stockContado?: number; ajustado?: boolean },
  ): Promise<ConteoDeItem> {
    const conteo = await prisma.conteoFisico.findFirst({
      where: { id: conteoId, tenantId },
      select: { status: true },
    });
    if (!conteo) return { ok: false, motivo: "no_encontrado" };
    if (conteo.status === "CERRADO") return { ok: false, motivo: "cerrado" };

    try {
      const item = await prisma.$transaction(async (tx) => {
        const abierto = await tx.conteoFisico.updateMany({
          where: { id: conteoId, tenantId, status: { in: ["INICIADO", "EN_PROGRESO"] } },
          data: { status: "EN_PROGRESO" },
        });
        if (abierto.count === 0) throw new ConteoNoEditable("cerrado");

        const actual = await tx.conteoFisicoItem.findFirst({
          where: { id: itemId, conteoId, conteo: { tenantId } },
        });
        // Lanza para deshacer el paso a EN_PROGRESO: sin ítem no se contó nada.
        if (!actual) throw new ConteoNoEditable("item_no_encontrado");

        const contado = input.stockContado ?? actual.stockContado;
        const diferencia = contado != null ? contado - actual.stockSistema : actual.diferencia;
        return tx.conteoFisicoItem.update({
          where: { id: itemId, conteoId, conteo: { tenantId } },
          data: {
            ...(contado != null ? { stockContado: contado } : {}),
            ...(diferencia != null ? { diferencia } : {}),
            // La decisión del usuario manda. Sólo cuando no dice nada se usa el
            // default de siempre: toda diferencia se ajusta salvo aviso.
            ajustado: input.ajustado ?? (diferencia != null && diferencia !== 0),
          },
        });
      }, TX_CONTAR);
      return { ok: true, item };
    } catch (e) {
      if (e instanceof ConteoNoEditable) return { ok: false, motivo: e.motivo };
      throw e;
    }
  },

  /**
   * Abre un conteo con una foto del stock de cada producto activo del negocio
   * (o de una categoría). `null` si no hay nada que contar.
   */
  async abrir(
    tenantId: string,
    opts: { tipo: TipoConteo; categoria?: string; creadoPor: string },
  ): Promise<{ id: string; tipo: string; status: string; totalItems: number } | null> {
    const productos = await prisma.product.findMany({
      where: {
        tenantId,
        active: true,
        deletedAt: null,
        ...(opts.tipo === "categoria" && opts.categoria ? { category: opts.categoria } : {}),
      },
      select: { id: true, stock: true },
      orderBy: { name: "asc" },
    });
    if (productos.length === 0) return null;

    const conteo = await prisma.conteoFisico.create({
      data: {
        tenantId,
        tipo: opts.tipo,
        status: "INICIADO",
        creadoPor: opts.creadoPor,
        items: {
          create: productos.map((p) => ({ productId: p.id, stockSistema: p.stock ?? 0 })),
        },
      },
      select: { id: true, tipo: true, status: true },
    });
    // El create anidado arma un ítem por producto: no hace falta traerlos de vuelta.
    return { ...conteo, totalItems: productos.length };
  },

  /** Los últimos 50 conteos del negocio, con cuántos productos tiene cada uno. */
  async listar(tenantId: string, status?: string) {
    return prisma.conteoFisico.findMany({
      where: { tenantId, ...(status ? { status } : {}) },
      include: { _count: { select: { items: true } } },
      orderBy: { fechaInicio: "desc" },
      take: 50,
    });
  },

  /**
   * Cierra el conteo y pisa el stock de cada diferencia tildada con lo contado,
   * con su renglón de kardex (`ajuste_positivo` / `ajuste_negativo`).
   *
   * Todo en una transacción que arranca reclamando el conteo con
   * `updateMany … status ≠ CERRADO`: el candado de fila deja pasar a un solo
   * cierre y el segundo ve CERRADO (antes los dos pasaban el `if` y el kardex
   * quedaba con los ajustes repetidos). Los ítems se leen DESPUÉS del reclamo,
   * así un PATCH que llegó antes del cierre también entra.
   *
   * Si un producto ya no existe en el negocio se deshace todo (lanza).
   */
  async cerrar(tenantId: string, conteoId: string, cerradoPor: string): Promise<CierreConteo> {
    const conteo = await prisma.conteoFisico.findFirst({
      where: { id: conteoId, tenantId },
      select: { status: true },
    });
    if (!conteo) return { ok: false, motivo: "no_encontrado" };
    if (conteo.status === "CERRADO") return { ok: false, motivo: "ya_cerrado" };

    const referencia = `Conteo-${conteoId.slice(0, 8)}`;
    let resumen: ResumenCierreConteo;
    try {
      resumen = await prisma.$transaction(async (tx) => {
        const reclamo = await tx.conteoFisico.updateMany({
          where: { id: conteoId, tenantId, status: { not: "CERRADO" } },
          data: { status: "CERRADO", fechaCierre: new Date() },
        });
        if (reclamo.count === 0) throw new ConteoYaCerrado();

        const items = await tx.conteoFisicoItem.findMany({
          where: { conteoId, conteo: { tenantId } },
          orderBy: { id: "asc" },
        });
        const contados = items.filter((i) => i.stockContado !== null);
        const conDiferencia = contados.filter((i) => i.diferencia !== null && i.diferencia !== 0);
        const aAjustar = conDiferencia.filter((i) => i.ajustado);

        // El stock de HOY, con candado: el kardex parte de lo que el sistema
        // tenía al pisarlo, no de la foto que se sacó al abrir (un conteo puede
        // quedar abierto semanas con ventas y compras encima). En orden de id,
        // como el resto de los bloqueos de productos (products.db.ts).
        const ids = [...new Set(aAjustar.map((i) => i.productId))];
        const hoy = ids.length === 0
          ? []
          : await tx.$queryRaw<Array<{ id: number; stock: number | null }>>`
              SELECT "id", "stock" FROM "Product"
              WHERE "tenantId" = ${tenantId} AND "id" = ANY(${ids}::int[])
              ORDER BY "id"
              FOR UPDATE
            `;
        const stockHoy = new Map(hoy.map((p) => [p.id, p.stock ?? 0]));

        // Una sola escritura por cada valor contado (no una por producto).
        const porStock = new Map<number, number[]>();
        for (const it of aAjustar) {
          if (it.stockContado === null) continue;
          porStock.set(it.stockContado, [...(porStock.get(it.stockContado) ?? []), it.productId]);
        }
        for (const [stock, ids] of porStock) {
          const r = await tx.product.updateMany({
            where: { id: { in: ids }, tenantId },
            data: { stock },
          });
          if (r.count !== new Set(ids).size) {
            throw new Error("Un producto del conteo ya no existe en este negocio");
          }
        }

        // Como `InventoryDB.adjust`: cantidad y sentido salen de contado − stock
        // real; si ya coinciden no hay movimiento que registrar.
        const movimientos = aAjustar.flatMap((it) => {
          if (it.stockContado === null || it.diferencia === null) return [];
          const previo = stockHoy.get(it.productId) ?? it.stockSistema;
          const delta = it.stockContado - previo;
          if (delta === 0) return [];
          const alAbrir = previo === it.stockSistema ? "" : `, al abrir=${it.stockSistema}`;
          return [{
            productId: it.productId,
            type: delta > 0 ? "ajuste_positivo" : "ajuste_negativo",
            quantity: Math.abs(delta),
            previousStock: previo,
            newStock: it.stockContado,
            reference: referencia,
            notes: `Conteo físico: sistema=${previo}, contado=${it.stockContado}${alAbrir}`,
            createdBy: cerradoPor,
            tenantId,
          }];
        });
        if (movimientos.length > 0) await tx.inventoryMovement.createMany({ data: movimientos });

        return {
          totalItems: items.length,
          contados: contados.length,
          conDiferencia: conDiferencia.length,
          ajustados: aAjustar.length,
        };
      }, TX_CIERRE);
    } catch (e) {
      if (e instanceof ConteoYaCerrado) return { ok: false, motivo: "ya_cerrado" };
      throw e;
    }

    // `{ expire: 0 }`: con "max" la primera lectura del Inventario después de
    // cerrar todavía mostraba el stock de antes de contar.
    try {
      revalidateTag(`tenant:${tenantId}:products`, { expire: 0 });
    } catch {
      /* fuera de un request de Next (tests, scripts) no hay caché que purgar */
    }
    return { ok: true, resumen };
  },
};
