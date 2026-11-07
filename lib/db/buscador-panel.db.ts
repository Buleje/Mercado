/**
 * Lecturas del buscador del panel (⌘K, `GET /api/search`). Cada método busca
 * UN grupo con «contiene» en la base y un tope chico: nada de traer el negocio
 * entero y filtrar en memoria (hasta el 28-10 cada tecla leía todos los
 * productos, clientes, pedidos y proveedores).
 *
 * Sólo lectura, sin caché (cada consulta es distinta) ni audit. `tenantId`
 * primero y en el WHERE de cada consulta. Qué grupo ve cada rol lo decide la
 * ruta con `lib/admin/busqueda-remota.ts`; acá no hay datos de plata del
 * personal (ni sueldo ni tarifa) y el documento del trabajador sólo entra al
 * filtro si la ruta lo pide (nivel RRHH completo).
 */
import "server-only";
import { prisma } from "@/lib/prisma";
import { withRlsTx } from "@/lib/prisma-rls";
import { normalizarCodigoContrato } from "@/lib/forestal/contratos";
import {
  LIMITE_PEDIDO,
  variantesDeNumero,
  type ClienteFila, type GuiaFila, type LoteFila, type ParteFila, type PedidoFila, type PermisoFila,
  type ProveedorFila, type TrabajadorFila, type TrozaFila,
} from "@/lib/admin/busqueda-remota";

/* Prisma no escapa los comodines de LIKE: «%%» o «__» traían los primeros de cada grupo (revisión 28-10). */
const sinComodines = (q: string) => q.replace(/[\\%_]/g, "\\$&");
const tiene = (q: string) => ({ contains: sinComodines(q) });
const contiene = (q: string) => ({ contains: sinComodines(q), mode: "insensitive" as const });
const num = (d: { toString(): string } | null | undefined) => (d == null ? null : Number(d.toString()));

function exigirTenant(tenantId: string): void {
  if (!tenantId) throw new Error("[buscador-panel] tenantId is required");
}

export interface ProductoBuscado { id: number; name: string; category: string; price: number; stock: number | null; stockMin: number | null }

export const BuscadorPanelDB = {
  async productos(tenantId: string, q: string): Promise<ProductoBuscado[]> {
    exigirTenant(tenantId);
    const rows = await prisma.product.findMany({
      where: { tenantId, deletedAt: null, OR: [{ name: contiene(q) }, { category: contiene(q) }, { barcode: tiene(q) }, { sku: contiene(q) }] },
      select: { id: true, name: true, category: true, price: true, stock: true, stockMin: true },
      orderBy: [{ active: "desc" }, { name: "asc" }],
      take: LIMITE_PEDIDO,
    });
    return rows.map((p) => ({ ...p, price: Number(p.price) }));
  },

  async clientes(tenantId: string, q: string): Promise<ClienteFila[]> {
    exigirTenant(tenantId);
    return withRlsTx(tenantId, (tx) => tx.customer.findMany({
      where: { tenantId, OR: [{ name: contiene(q) }, { phone: tiene(q) }, { location: contiene(q) }] },
      select: { phone: true, name: true, location: true },
      orderBy: { updatedAt: "desc" },
      take: LIMITE_PEDIDO,
    }));
  },

  /** `porTelefono` sólo para quien ve clientes: el cajero no busca pedidos por el celular del cliente. */
  async pedidos(tenantId: string, q: string, porTelefono = false): Promise<PedidoFila[]> {
    exigirTenant(tenantId);
    const rows = await withRlsTx(tenantId, (tx) => tx.order.findMany({
      where: {
        tenantId, deletedAt: null,
        OR: [{ id: contiene(q) }, { customerName: contiene(q) }, ...(porTelefono ? [{ customerPhone: tiene(q) }] : []), { items: { some: { name: contiene(q) } } }],
      },
      select: { id: true, customerName: true, total: true, createdAt: true, status: true },
      orderBy: { createdAt: "desc" },
      take: LIMITE_PEDIDO,
    }));
    return rows.map((o) => ({ ...o, total: Number(o.total), status: String(o.status) }));
  },

  async proveedores(tenantId: string, q: string): Promise<ProveedorFila[]> {
    exigirTenant(tenantId);
    return prisma.supplier.findMany({
      where: { tenantId, OR: [{ name: contiene(q) }, { phone: tiene(q) }, { ruc: tiene(q) }] },
      select: { id: true, name: true, phone: true, ruc: true },
      orderBy: { name: "asc" },
      take: LIMITE_PEDIDO,
    });
  },

  /**
   * Las guías con ese N°: las que llegaron (WoodEntry), las del LO-TH
   * (ForestGtf) y las salidas del Libro CTP (una fila por guía: sus líneas se
   * suman). `conLoth`/`conCtp` = libros encendidos en el negocio.
   */
  async guias(tenantId: string, q: string, libros: { conCtp: boolean; conLoth: boolean }): Promise<GuiaFila[]> {
    exigirTenant(tenantId);
    const gtf = { OR: variantesDeNumero(q).map((v) => ({ gtfNumber: contiene(v) })) };
    const [ingresos, emitidas, salidas] = await Promise.all([
      libros.conCtp
        ? prisma.woodEntry.findMany({
            where: { tenantId, deletedAt: null, ...gtf },
            select: { id: true, gtfNumber: true, gtfDate: true, entryDate: true, providerName: true, volumeM3: true, status: true, contratoId: true },
            orderBy: { entryDate: "desc" },
            take: LIMITE_PEDIDO,
          })
        : [],
      /* La ruta de guías del LO-TH abre con cualquiera de los dos libros (la bandeja del CTP las lee). */
      prisma.forestGtf.findMany({
        where: { tenantId, deletedAt: null, ...gtf },
        select: { id: true, gtfNumber: true, gtfDate: true, createdAt: true, titularName: true, volumenTotalM3: true, status: true },
        orderBy: { createdAt: "desc" },
        take: LIMITE_PEDIDO,
      }),
      libros.conCtp
        ? prisma.forestCtpEntry.findMany({
            where: { tenantId, deletedAt: null, section: "despacho", status: { not: "anulado" }, ...gtf },
            select: { id: true, gtfNumber: true, entryDate: true, destino: true, titularNombre: true, quantity: true, unit: true },
            orderBy: { entryDate: "desc" },
            take: 30,
          })
        : [],
    ]);
    const porGuia = new Map<string, GuiaFila>();
    for (const s of salidas) {
      if (!s.gtfNumber) continue;
      const m3 = s.unit == null || s.unit === "m3" ? num(s.quantity) ?? 0 : 0;
      const previa = porGuia.get(s.gtfNumber);
      if (previa) previa.volumenM3 = (previa.volumenM3 ?? 0) + m3;
      else porGuia.set(s.gtfNumber, { id: s.id, origen: "salida", gtfNumber: s.gtfNumber, quien: s.destino ?? s.titularNombre, fecha: s.entryDate, volumenM3: m3, anulada: false });
    }
    return [
      ...ingresos.map((e): GuiaFila => ({
        id: e.id, origen: "ingreso", gtfNumber: e.gtfNumber, quien: e.providerName, fecha: e.gtfDate ?? e.entryDate,
        volumenM3: num(e.volumeM3), anulada: e.status === "anulado" || e.status === "rechazado", contratoId: e.contratoId,
      })),
      ...emitidas.map((g): GuiaFila => ({
        id: g.id, origen: "loth", gtfNumber: g.gtfNumber, quien: g.titularName, fecha: g.gtfDate ?? g.createdAt,
        volumenM3: num(g.volumenTotalM3), anulada: g.status === "anulada",
      })),
      ...porGuia.values(),
    ];
  },

  /** Por codificación, código de planta o árbol exacto: el mismo criterio que `WoodEntriesDB.buscarTrozas`. */
  async trozas(tenantId: string, q: string): Promise<TrozaFila[]> {
    exigirTenant(tenantId);
    const rows = await prisma.woodEntryTroza.findMany({
      where: {
        tenantId,
        OR: [{ codificacion: contiene(q) }, { codigoPlanta: contiene(q) }, { arbolCodigo: { equals: q, mode: "insensitive" } }],
        entry: { deletedAt: null, status: { notIn: ["anulado", "rechazado"] } },
      },
      select: {
        id: true, codificacion: true, codigoPlanta: true, especieComun: true, consumidaEnId: true, despachadaEnId: true,
        entry: { select: { gtfNumber: true, speciesCommonName: true } },
        loteAserrio: { select: { code: true, deletedAt: true } },
      },
      orderBy: [{ createdAt: "desc" }, { orden: "asc" }],
      take: LIMITE_PEDIDO,
    });
    return rows.map((t) => {
      const lote = t.loteAserrio && !t.loteAserrio.deletedAt ? t.loteAserrio.code : null;
      return {
        id: t.id, codificacion: t.codificacion, codigoPlanta: t.codigoPlanta,
        especie: t.especieComun ?? t.entry.speciesCommonName, gtfNumber: t.entry.gtfNumber, loteCodigo: lote,
        estado: t.despachadaEnId ? "despachada" : t.consumidaEnId ? "consumida" : lote ? "lote" : "patio",
      };
    });
  },

  async permisos(tenantId: string, q: string): Promise<PermisoFila[]> {
    exigirTenant(tenantId);
    /* Normalizado puede quedar vacío («%%» → ""), y `contains: ""` trae todos (revisión 28-10). */
    const norma = normalizarCodigoContrato(q);
    return prisma.forestContrato.findMany({
      where: { tenantId, deletedAt: null, OR: [...(norma.length >= 2 ? [{ codigoNorm: tiene(norma) }] : []), { alias: contiene(q) }, { titularNombre: contiene(q) }] },
      select: { id: true, codigo: true, alias: true, titularNombre: true, tipo: true, vigenciaHasta: true, estado: true },
      orderBy: [{ isActive: "desc" }, { createdAt: "desc" }],
      take: LIMITE_PEDIDO,
    });
  },

  /**
   * Los permisos de las guías y Anexos 04 encontrados: «0000071» trae la guía,
   * su anexo y el permiso con que salió, aunque el código del permiso no tenga
   * esos dígitos. Por id (el ingreso lo guarda) o por código (el anexo lo anota).
   */
  async permisosRelacionados(tenantId: string, ids: readonly string[], codigos: readonly string[]): Promise<PermisoFila[]> {
    exigirTenant(tenantId);
    const normas = [...new Set(codigos.map(normalizarCodigoContrato).filter(Boolean))].slice(0, 20);
    const unicos = [...new Set(ids.filter(Boolean))].slice(0, 20);
    if (normas.length === 0 && unicos.length === 0) return [];
    return prisma.forestContrato.findMany({
      where: { tenantId, deletedAt: null, OR: [...(unicos.length ? [{ id: { in: unicos } }] : []), ...(normas.length ? [{ codigoNorm: { in: normas } }] : [])] },
      select: { id: true, codigo: true, alias: true, titularNombre: true, tipo: true, vigenciaHasta: true, estado: true },
      take: LIMITE_PEDIDO,
    });
  },

  async lotes(tenantId: string, q: string): Promise<LoteFila[]> {
    exigirTenant(tenantId);
    const rows = await prisma.forestLoteAserrio.findMany({
      where: { tenantId, deletedAt: null, OR: [{ code: contiene(q) }, { permiso: contiene(q) }, { ordenProduccion: contiene(q) }] },
      select: { id: true, code: true, speciesCommon: true, status: true, permiso: true, fechaApertura: true },
      orderBy: { fechaApertura: "desc" },
      take: LIMITE_PEDIDO,
    });
    return rows.map((l) => ({ id: l.id, code: l.code, especie: l.speciesCommon, status: l.status, permiso: l.permiso, fechaApertura: l.fechaApertura }));
  },

  async partes(tenantId: string, q: string): Promise<ParteFila[]> {
    exigirTenant(tenantId);
    return prisma.forestParty.findMany({
      where: { tenantId, deletedAt: null, OR: [{ nombre: contiene(q) }, { docNumero: tiene(q) }] },
      select: { id: true, nombre: true, roles: true, docTipo: true, docNumero: true },
      orderBy: { nombre: "asc" },
      take: LIMITE_PEDIDO,
    });
  },

  /** Nombre y apodo; el documento sólo con `conDocumento` (RRHH completo: admin y dueño). Sin plata. */
  async trabajadores(tenantId: string, q: string, conDocumento: boolean): Promise<TrabajadorFila[]> {
    exigirTenant(tenantId);
    const rows = await prisma.colaborador.findMany({
      where: {
        tenantId, deletedAt: null,
        OR: [{ nombre: contiene(q) }, { apodo: contiene(q) }, ...(conDocumento ? [{ documento: tiene(q) }] : [])],
      },
      select: { id: true, nombre: true, apodo: true, estado: true, puesto: { select: { nombre: true } } },
      orderBy: [{ estado: "asc" }, { nombre: "asc" }],
      take: LIMITE_PEDIDO,
    });
    return rows.map((c) => ({ id: c.id, nombre: c.nombre, apodo: c.apodo, puesto: c.puesto?.nombre ?? null, estado: String(c.estado) }));
  },
};
