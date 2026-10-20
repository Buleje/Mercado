import "server-only";
import { ESTADOS_PEDIDO_QUE_ENTRAN } from "@/lib/finance/ingresos-del-periodo";
import { withRlsTx } from "@/lib/prisma-rls";
import { getOrSet, invalidateByPrefix } from "@/lib/cache";
import { toNumOrZero } from "@/lib/decimal-utils";
import { SettingsDB } from "./settings.db";
import {
  CLAVE_ALTAS_REVENDEDORAS,
  CLAVE_REVENDEDORAS,
  LISTA_REVENDEDORA,
  cotizarPedido,
  leerAltas,
  leerConfigRevendedoras,
  mesDeLima,
  nivelPorCompras,
  preciosPorNivel,
  sinCreditoHasta,
  type ConfigRevendedoras,
  type CotizacionRevendedora,
  type ProductoPrecios,
  type ResumenRevendedoras,
  type RevendedoraFila,
} from "@/lib/revendedoras/reglas";

/**
 * Revendedoras (ADR-507): clientas con `listaPrecio = "revendedora"` y las
 * reglas del negocio en `featureFlagsJson.revendedoras`. Sin schema propio.
 *
 * Lo que se lee para la LISTA va con caché corta (30 s, por tenant y mes) y se
 * invalida en cada escritura de este módulo. Lo que COBRA (`cotizar`) se lee
 * siempre fresco: la caché es por instancia y una vista previa vieja no puede
 * poner el precio.
 */

const PREFIJO = (tenantId: string) => `revendedoras:${tenantId}:`;
/** Últimos 9 dígitos: «+51 916 409 675» de una venta y «916409675» de la ficha son la misma. */
const claveDeTelefono = (t: string) => t.replace(/\D/g, "").slice(-9);
const centimos = (v: Parameters<typeof toNumOrZero>[0]) => Math.round(toNumOrZero(v) * 100);

export interface CandidataRevendedora {
  customerId: string;
  nombre: string;
  celular: string;
  pueblo: string;
  listaPrecio: string | null;
}

interface CompraDelMes {
  centimos: number;
  compras: number;
  ultima: Date | null;
}

function pueblo(c: { distrito: string | null; provincia: string | null; location: string }): string {
  return c.distrito?.trim() || c.provincia?.trim() || c.location.trim();
}

async function leerFlags(tenantId: string): Promise<Record<string, unknown>> {
  return SettingsDB.getFeatureFlags(tenantId);
}

/**
 * Lo que compró cada celular en [desde, hasta): ventas del POS + pedidos no
 * cancelados (ella paga adelantado: un pedido en curso ya es compra), sólo de
 * los celulares pedidos. La última compra es de toda la historia.
 */
async function comprasPorCelular(tenantId: string, celulares: string[], desde: Date, hasta: Date): Promise<Map<string, CompraDelMes>> {
  const claves = [...new Set(celulares.map(claveDeTelefono).filter((k) => k.length >= 6))];
  const out = new Map<string, CompraDelMes>();
  if (claves.length === 0) return out;
  const deEllas = { tenantId, OR: claves.map((k) => ({ customerPhone: { endsWith: k } })) };
  const enElMes = { createdAt: { gte: desde, lt: hasta } };
  /* Sólo lo que entra como ingreso (como el semáforo y las metas) y no borrado:
     un pedido web pendiente sin pagar subía a la revendedora al 25 % (revisión 20-10). */
  const pedidoQueCuenta = { status: { in: [...ESTADOS_PEDIDO_QUE_ENTRAN] }, deletedAt: null };
  const [ventas, pedidos, ventasUltima, pedidosUltima] = await withRlsTx(tenantId, (tx) =>
    Promise.all([
      tx.sale.groupBy({ by: ["customerPhone"], where: { ...deEllas, ...enElMes }, _count: { _all: true }, _sum: { total: true } }),
      tx.order.groupBy({ by: ["customerPhone"], where: { ...deEllas, ...enElMes, ...pedidoQueCuenta }, _count: { _all: true }, _sum: { total: true } }),
      tx.sale.groupBy({ by: ["customerPhone"], where: deEllas, _max: { createdAt: true } }),
      tx.order.groupBy({ by: ["customerPhone"], where: { ...deEllas, ...pedidoQueCuenta }, _max: { createdAt: true } }),
    ]),
  );
  const de = (tel: string | null) => {
    const k = claveDeTelefono(tel ?? "");
    if (!claves.includes(k)) return null;
    let a = out.get(k);
    if (!a) out.set(k, (a = { centimos: 0, compras: 0, ultima: null }));
    return a;
  };
  for (const r of [...ventas, ...pedidos]) {
    const a = de(r.customerPhone);
    if (a) { a.centimos += centimos(r._sum.total); a.compras += r._count._all; }
  }
  for (const r of [...ventasUltima, ...pedidosUltima]) {
    const a = de(r.customerPhone);
    const f = r._max.createdAt;
    if (a && f && (!a.ultima || f > a.ultima)) a.ultima = f;
  }
  return out;
}

export const RevendedorasDB = {
  /** Las reglas del negocio (de fábrica si no guardó nada). Caché 60 s; para cobrar, `configFresca`. */
  async config(tenantId: string): Promise<ConfigRevendedoras> {
    if (!tenantId) throw new Error("tenantId is required");
    return getOrSet(`${PREFIJO(tenantId)}config`, 60, async () => leerConfigRevendedoras(await leerFlags(tenantId)));
  },

  async configFresca(tenantId: string): Promise<ConfigRevendedoras> {
    if (!tenantId) throw new Error("tenantId is required");
    return leerConfigRevendedoras(await leerFlags(tenantId));
  },

  /** Pisa sólo la clave `revendedoras` de los flags (una sentencia; no revive lo que otro cambió). */
  async guardarConfig(tenantId: string, config: ConfigRevendedoras): Promise<void> {
    if (!tenantId) throw new Error("tenantId is required");
    await SettingsDB.pisarClavesFlags(tenantId, { [CLAVE_REVENDEDORAS]: config });
    invalidateByPrefix(PREFIJO(tenantId));
  },

  /** Las revendedoras con lo que compraron en el mes de Lima de `ahora`, su nivel y la meta. */
  async listar(tenantId: string, ahora: Date = new Date()): Promise<{ revendedoras: RevendedoraFila[]; resumen: ResumenRevendedoras }> {
    if (!tenantId) throw new Error("tenantId is required");
    const mes = mesDeLima(ahora);
    return getOrSet(`${PREFIJO(tenantId)}lista:${mes.clave}`, 30, async () => {
      const [flags, clientas] = await Promise.all([
        leerFlags(tenantId),
        withRlsTx(tenantId, (tx) =>
          tx.customer.findMany({
            where: { tenantId, listaPrecio: LISTA_REVENDEDORA },
            select: { id: true, name: true, phone: true, location: true, distrito: true, provincia: true },
            orderBy: { name: "asc" },
            take: 500,
          }),
        ),
      ]);
      const config = leerConfigRevendedoras(flags);
      const altas = leerAltas(flags);
      const compras = await comprasPorCelular(tenantId, clientas.map((c) => c.phone), mes.desde, mes.hasta);
      const revendedoras: RevendedoraFila[] = clientas.map((c) => {
        const k = compras.get(claveDeTelefono(c.phone));
        const comprado = (k?.centimos ?? 0) / 100;
        const alta = altas[c.id] ?? null;
        return {
          customerId: c.id,
          nombre: c.name,
          celular: c.phone,
          pueblo: pueblo(c),
          compradoMes: comprado,
          comprasMes: k?.compras ?? 0,
          ultimaCompra: k?.ultima ? k.ultima.toISOString() : null,
          nivel: nivelPorCompras(config, comprado),
          alta,
          sinCreditoHasta: alta ? sinCreditoHasta(alta, config.mesesSinCredito) : null,
        };
      });
      const vendido = revendedoras.reduce((s, r) => s + Math.round(r.compradoMes * 100), 0);
      return {
        revendedoras,
        resumen: {
          mes: mes.clave,
          activas: revendedoras.filter((r) => r.compradoMes > 0).length,
          total: revendedoras.length,
          meta: config.metaActivas,
          vendidoMes: vendido / 100,
        },
      };
    });
  },

  /** Clientas que todavía NO son revendedoras, por nombre o celular (para agregarlas). */
  async candidatas(tenantId: string, q: string): Promise<CandidataRevendedora[]> {
    if (!tenantId) throw new Error("tenantId is required");
    const texto = q.trim();
    const digitos = texto.replace(/\D/g, "");
    const noEs = { OR: [{ listaPrecio: null }, { listaPrecio: { not: LISTA_REVENDEDORA } }] };
    const busca = texto
      ? { OR: [{ name: { contains: texto, mode: "insensitive" as const } }, ...(digitos.length >= 3 ? [{ phone: { contains: digitos } }] : [])] }
      : {};
    const filas = await withRlsTx(tenantId, (tx) =>
      tx.customer.findMany({
        where: { tenantId, AND: [noEs, busca] },
        select: { id: true, name: true, phone: true, location: true, distrito: true, provincia: true, listaPrecio: true },
        orderBy: { updatedAt: "desc" },
        take: 20,
      }),
    );
    return filas.map((c) => ({ customerId: c.id, nombre: c.name, celular: c.phone, pueblo: pueblo(c), listaPrecio: c.listaPrecio }));
  },

  /**
   * Marca a la clienta como revendedora. El dueño va en el WHERE (`tenantId`):
   * una ficha de otro negocio da 0 filas = «no existe». Si ya lo era, no toca
   * su fecha de alta. `listaPrecio` anterior ("mayorista", "especial") se pisa.
   */
  async marcar(tenantId: string, customerId: string, hoy: string): Promise<"marcada" | "ya-era" | "no-existe"> {
    if (!tenantId) throw new Error("tenantId is required");
    const r = await withRlsTx(tenantId, (tx) =>
      tx.customer.updateMany({
        where: { id: customerId, tenantId, OR: [{ listaPrecio: null }, { listaPrecio: { not: LISTA_REVENDEDORA } }] },
        data: { listaPrecio: LISTA_REVENDEDORA },
      }),
    );
    if (r.count === 0) {
      const existe = await withRlsTx(tenantId, (tx) => tx.customer.count({ where: { id: customerId, tenantId, listaPrecio: LISTA_REVENDEDORA } }));
      return existe > 0 ? "ya-era" : "no-existe";
    }
    await SettingsDB.pisarSubclavesFlags(tenantId, CLAVE_ALTAS_REVENDEDORAS, { [customerId]: hoy });
    invalidateByPrefix(PREFIJO(tenantId));
    return "marcada";
  },

  /** La saca de revendedoras: vuelve a la lista «general» y se borra su fecha de alta. */
  async quitar(tenantId: string, customerId: string): Promise<boolean> {
    if (!tenantId) throw new Error("tenantId is required");
    const r = await withRlsTx(tenantId, (tx) =>
      tx.customer.updateMany({
        where: { id: customerId, tenantId, listaPrecio: LISTA_REVENDEDORA },
        data: { listaPrecio: "general" },
      }),
    );
    if (r.count === 0) return false;
    await SettingsDB.pisarSubclavesFlags(tenantId, CLAVE_ALTAS_REVENDEDORAS, { [customerId]: null });
    invalidateByPrefix(PREFIJO(tenantId));
    return true;
  },

  /** Productos vivos con su precio y costo DE LA BASE (`ids` vacío = todos, tope 500). */
  async productos(tenantId: string, ids?: number[]) {
    if (!tenantId) throw new Error("tenantId is required");
    const filas = await withRlsTx(tenantId, (tx) =>
      tx.product.findMany({
        where: { tenantId, deletedAt: null, ...(ids ? { id: { in: ids } } : { active: true }) },
        select: { id: true, name: true, barcode: true, sku: true, category: true, price: true, costPrice: true },
        orderBy: [{ category: "asc" }, { name: "asc" }],
        take: 500,
      }),
    );
    return filas.map((p) => {
      const costo = toNumOrZero(p.costPrice);
      return {
        productId: p.id,
        nombre: p.name,
        codigo: p.sku?.trim() || p.barcode?.trim() || null,
        categoria: p.category,
        precioCatalogo: toNumOrZero(p.price),
        costo: costo > 0 ? costo : null,
      };
    });
  },

  /** Las categorías de productos del negocio (para elegir cuáles son «ofertas»). */
  async categorias(tenantId: string): Promise<string[]> {
    if (!tenantId) throw new Error("tenantId is required");
    return getOrSet(`${PREFIJO(tenantId)}categorias`, 60, async () => {
      const filas = await withRlsTx(tenantId, (tx) =>
        tx.product.findMany({
          where: { tenantId, deletedAt: null },
          select: { category: true },
          distinct: ["category"],
          orderBy: { category: "asc" },
          take: 100,
        }),
      );
      return filas.map((f) => f.category.trim()).filter(Boolean);
    });
  },

  /** La lista de precios por nivel (caché corta: es para mirar, no cobra). */
  async precios(tenantId: string): Promise<{ config: ConfigRevendedoras; productos: ProductoPrecios[] }> {
    if (!tenantId) throw new Error("tenantId is required");
    return getOrSet(`${PREFIJO(tenantId)}precios`, 30, async () => {
      const [config, productos] = await Promise.all([RevendedorasDB.configFresca(tenantId), RevendedorasDB.productos(tenantId)]);
      return { config, productos: preciosPorNivel(config, productos) };
    });
  },

  /**
   * El pedido de una revendedora, cobrado por el servidor: precio y costo de la
   * base, reglas frescas y lo comprado en el mes (si viene la clienta). Un
   * producto que no es del negocio no entra (`faltan`).
   */
  async cotizar(
    tenantId: string,
    entrada: { customerId?: string | null; items: { productId: number; cantidad: number }[] },
    ahora: Date = new Date(),
  ): Promise<{ cotizacion: CotizacionRevendedora; faltan: number[]; revendedora: { nombre: string; celular: string } | null } | "no-es-revendedora"> {
    if (!tenantId) throw new Error("tenantId is required");
    const ids = [...new Set(entrada.items.map((i) => i.productId))];
    const [config, productos, clienta] = await Promise.all([
      RevendedorasDB.configFresca(tenantId),
      RevendedorasDB.productos(tenantId, ids),
      entrada.customerId
        ? withRlsTx(tenantId, (tx) =>
            tx.customer.findFirst({
              where: { id: entrada.customerId as string, tenantId, listaPrecio: LISTA_REVENDEDORA },
              select: { name: true, phone: true },
            }),
          )
        : Promise.resolve(null),
    ]);
    if (entrada.customerId && !clienta) return "no-es-revendedora";
    let compradoEnElMes = 0;
    if (clienta) {
      const mes = mesDeLima(ahora);
      const c = await comprasPorCelular(tenantId, [clienta.phone], mes.desde, mes.hasta);
      compradoEnElMes = (c.get(claveDeTelefono(clienta.phone))?.centimos ?? 0) / 100;
    }
    const porId = new Map(productos.map((p) => [p.productId, p]));
    const cantidades = new Map<number, number>();
    for (const i of entrada.items) cantidades.set(i.productId, (cantidades.get(i.productId) ?? 0) + i.cantidad);
    const lineas = [...cantidades].flatMap(([id, cantidad]) => {
      const p = porId.get(id);
      return p ? [{ ...p, cantidad }] : [];
    });
    return {
      cotizacion: cotizarPedido(config, { compradoEnElMes, lineas }),
      faltan: ids.filter((id) => !porId.has(id)),
      revendedora: clienta ? { nombre: clienta.name, celular: clienta.phone } : null,
    };
  },
};
