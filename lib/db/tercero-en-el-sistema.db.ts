import "server-only";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { checkPermission, type Resource, type Role } from "@/lib/auth/role-permissions";
import { canRoleSeeEnCadena, rolesDeLaCadena, veTodoElDrive, type CarpetaConRoles } from "@/lib/documents/doc-access";
import { leerVinculo, nombreDeOtro, type TipoTercero } from "@/lib/documentos/terceros-vinculo";
import { tagEntidad } from "@/lib/documentos/enlaces-entidad";
import { hrefDe } from "@/lib/admin/enlaces-panel";
import { isSpecializationEnabled } from "@/lib/specializations";
import { RRHH_GESTION } from "@/lib/rrhh/roles";
import { RUTAS_PANEL } from "@/lib/auth/roles-rutas-panel";
import type { AdminRole } from "@/lib/session";
import { formatCurrency } from "@/lib/currency";
import { DocumentsDB } from "@/lib/db/documents.db";
import { AdelantosDB } from "@/lib/db/adelantos.db";
import { GuiaPlataDB } from "@/lib/db/guia-plata.db";
import { ForestDirectorioDB } from "@/lib/db/forest-directorio.db";
import { ForestContratoDB } from "@/lib/db/forest-contrato.db";
import { SuppliersDB } from "@/lib/db/purchases.db";
import { CustomersDB } from "@/lib/db/customers.db";
import { ColaboradoresDB } from "@/lib/db/rrhh-colaboradores.db";
import { construirTrazabilidadProveedor } from "@/lib/forestal/proveedor-trazabilidad";
import {
  cuantos,
  detalleDeCuenta,
  fechaDia,
  hrefDeEtiqueta,
  m3,
  textoDeNeto,
  type BloqueEnElSistema,
  type TerceroEnElSistema,
} from "@/lib/documentos/tercero-en-el-sistema";

/** Quién ve DNI/RUC del tercero: los mismos que en Archivo › Terceros. */
const ROLES_VEN_DETALLE = new Set(["admin", "owner", "manager", "superadmin"]);
/** Las rutas del Libro CTP (directorio, contratos, trazabilidad) dejan pasar a estos. */
const ROLES_FORESTAL = new Set(["admin", "owner", "manager", "almacenero", "superadmin"]);

const ESTADO_COLABORADOR: Record<string, string> = {
  ACTIVO: "Activo",
  VACACIONES: "De vacaciones",
  LICENCIA: "De licencia",
  SUSPENDIDO: "Suspendido",
  CESADO: "Ya no trabaja contigo",
};

const puede = (role: string, recurso: Resource) => checkPermission(role as Role, recurso, "read");

/*
 * Plata y datos de clientes/compras: los MISMOS roles que la ruta de donde salen
 * (seguridad 24-10, ALTO: la matriz da `customers:read` también a cajero,
 * almacenero, repartidor y analista, y el almacenero veía «Te debe S/ 150» y el
 * teléfono mientras `/api/fiados` le da 403). La gestión pasa siempre, como en
 * `requireAdmin`.
 */
const GESTION = new Set(["admin", "owner", "manager"]);
const pasaRuta = (role: string, roles: readonly string[]) => GESTION.has(role) || roles.includes(role);
/** `/api/fiados`: admin y cajero. */
const veFiado = (role: string) => pasaRuta(role, ["admin", "cajero"]);
/** `/api/customers` (compras del cliente, su teléfono y su ficha). */
const veCliente = (role: string) => pasaRuta(role, RUTAS_PANEL["/api/customers"]);
/** `/api/purchases`: admin y almacenero. */
const veComprasProveedor = (role: string) => pasaRuta(role, ["admin", "almacenero"]);
const ultimos9 = (tel: string) => tel.replace(/\D/g, "").slice(-9);

/** Un bloque que falla no tumba los demás: se registra y se omite. */
async function bloque(etiqueta: string, fn: () => Promise<BloqueEnElSistema | null>): Promise<BloqueEnElSistema | null> {
  try {
    return await fn();
  } catch (err) {
    logger.warn("[documentos.en-el-sistema] un bloque no se pudo leer", { bloque: etiqueta, error: String(err) });
    return null;
  }
}

/**
 * «De <tercero> en el sistema» (Esenciales › panel, Brandon 24-10): lo que el
 * tercero ligado a una carpeta (ADR-502, etiqueta de vínculo) ya tiene en los
 * otros módulos, en cifras y con el enlace al módulo. Sin schema: lee las
 * clases de cada módulo.
 *
 * Permisos: cada bloque pregunta a la MISMA matriz que su módulo — la cuenta,
 * al recurso `adelantos` (plata); compras, a `purchases`; clientes, a
 * `customers`; el Libro CTP, a sus roles y a la especialización. Lo que el
 * rol no ve se dice en `sinPermiso` («su cuenta»), sin cifras.
 */
export class TerceroEnElSistemaDB {
  /**
   * ¿La carpeta existe, el rol la ve y está ligada a esa clave? Es la puerta
   * del endpoint: sin carpeta visible ligada, no se responde nada del tercero.
   */
  static async carpetaLigada(tenantId: string, carpetaId: string, clave: string, role: string): Promise<boolean> {
    if (!tenantId) throw new Error("tenantId is required");
    const carpetas = await prisma.documentFolder.findMany({
      where: { tenantId },
      select: { id: true, parentId: true, allowedRoles: true, tags: true },
    });
    const carpeta = carpetas.find((c) => c.id === carpetaId);
    if (!carpeta || !carpeta.tags.some((t) => t.trim().toLowerCase() === clave)) return false;
    if (veTodoElDrive(role)) return true;
    const mapa = new Map<string, CarpetaConRoles>(carpetas.map((c) => [c.id, { parentId: c.parentId ?? null, allowedRoles: c.allowedRoles ?? [] }]));
    return canRoleSeeEnCadena(role, [], rolesDeLaCadena(carpetaId, mapa));
  }

  /** Sólo el nombre (el título del plegable, antes de abrirlo): una lectura, sin cifras. */
  static async nombre(tenantId: string, clave: string, role: string): Promise<{ clave: string; tipo: TipoTercero; nombre: string } | null> {
    if (!tenantId) throw new Error("tenantId is required");
    const v = leerVinculo(clave);
    if (!v) return null;
    const nombre = await (async (): Promise<string | null> => {
      switch (v.tipo) {
        case "comunidad":
          return (await ForestDirectorioDB.getParte(tenantId, v.id))?.nombre ?? null;
        case "persona":
          return (await AdelantosDB.getBeneficiario(tenantId, v.id))?.nombre ?? null;
        case "proveedor":
          return (await SuppliersDB.getById(tenantId, v.id))?.name ?? null;
        case "cliente": {
          const c = await CustomersDB.getByPhone(v.id, tenantId);
          // Sin nombre cargado no se usa el teléfono para quien no ve clientes (como `/api/customers`).
          return c ? c.name || (veCliente(role) ? c.phone : "Cliente") : null;
        }
        case "colaborador":
          return (await ColaboradoresDB.obtener(tenantId, v.id))?.nombre ?? null;
        case "otro":
          return nombreDeOtro(v.id);
      }
    })();
    return nombre ? { clave, tipo: v.tipo, nombre } : null;
  }

  static async resumen(tenantId: string, role: string, clave: string): Promise<TerceroEnElSistema | null> {
    if (!tenantId) throw new Error("tenantId is required");
    const v = leerVinculo(clave);
    if (!v) return null;
    const base = { clave, tipo: v.tipo, sinPermiso: [] as string[] };
    const veDetalle = ROLES_VEN_DETALLE.has(role);
    switch (v.tipo) {
      case "comunidad":
        return this.deComunidad(tenantId, role, v.id, base, veDetalle);
      case "persona":
        return this.dePersona(tenantId, role, v.id, base, veDetalle);
      case "proveedor":
        return this.deProveedor(tenantId, role, v.id, base, veDetalle);
      case "cliente":
        return this.deCliente(tenantId, role, v.id, base);
      case "colaborador":
        return this.deColaborador(tenantId, role, v.id, base, veDetalle);
      case "otro":
        return { ...base, nombre: nombreDeOtro(v.id), detalle: null, ficha: null, bloques: [] };
    }
  }

  /** Papeles de otras carpetas con la etiqueta del tercero (o de sus permisos). */
  private static async papeles(tenantId: string, role: string, tags: string[], rotulo: string): Promise<BloqueEnElSistema | null> {
    const { total, porTag } = await DocumentsDB.contarPorTags(tenantId, tags, role);
    if (total === 0) return null;
    const tag = tags.find((t) => (porTag[t] ?? 0) > 0) ?? tags[0];
    return { id: "papeles", titulo: "Papeles con su etiqueta", cifra: cuantos(total, "papel", "papeles"), href: hrefDeEtiqueta(tag, rotulo), enlace: "Ver en el Archivo" };
  }

  /** La cuenta de Adelantos de una persona sin parte del directorio: el neto de la matriz de saldos. */
  private static async cuentaDeBeneficiario(tenantId: string, beneficiarioId: string): Promise<BloqueEnElSistema | null> {
    const b = (await AdelantosDB.listBeneficiarios(tenantId)).find((x) => x.id === beneficiarioId);
    if (!b) return null;
    const neto = b.neto.PEN ?? 0;
    return {
      id: "cuenta",
      titulo: "Su cuenta de adelantos",
      ...textoDeNeto(neto),
      detalle: b.adelantosAbiertos > 0 ? cuantos(b.adelantosAbiertos, "adelanto abierto", "adelantos abiertos") : undefined,
      href: hrefDe("cuenta-adelantos", `benef:${beneficiarioId}`) ?? undefined,
      enlace: "Ver su cuenta",
    };
  }

  private static async deComunidad(
    tenantId: string,
    role: string,
    id: string,
    base: { clave: string; tipo: TipoTercero; sinPermiso: string[] },
    veDetalle: boolean,
  ): Promise<TerceroEnElSistema | null> {
    const parte = await ForestDirectorioDB.getParte(tenantId, id);
    if (!parte) return null;
    const forestal = ROLES_FORESTAL.has(role) && (await isSpecializationEnabled(tenantId, "spec:forestal:ctp-libro"));
    const ficha = forestal ? hrefDe("parte", id) : null;
    const contratos = forestal
      ? (await ForestContratoDB.list(tenantId, { incluirInactivos: true }).catch((err: unknown) => {
          logger.warn("[documentos.en-el-sistema] no leyó los permisos", { error: String(err) });
          return [];
        })).filter((c) => c.titularId === id)
      : [];

    const [cuenta, permisos, guias, papeles] = await Promise.all([
      puede(role, "adelantos")
        ? bloque("cuenta", async () => {
            const r = await GuiaPlataDB.resumenPersona(tenantId, id);
            if (!r) return null;
            return {
              id: "cuenta",
              titulo: "Su cuenta",
              ...textoDeNeto(r.neto),
              detalle: detalleDeCuenta(r.deAdelantos, r.porGuias),
              href: hrefDe("cuenta-adelantos", `parte:${id}`) ?? undefined,
              enlace: "Ver su cuenta",
            };
          })
        : Promise.resolve(null),
      forestal && contratos.length > 0
        ? bloque("permisos", async () => {
            const vigentes = contratos.filter((c) => c.estado === "vigente");
            const proximo = vigentes.map((c) => c.vigenciaHasta).filter((f): f is string => !!f).sort()[0];
            const partes = [cuantos(vigentes.length, "vigente", "vigentes"), proximo ? `vence el ${fechaDia(proximo)}` : ""].filter(Boolean);
            const uno = contratos.length === 1 ? hrefDe("permiso", contratos[0].id) : null;
            return {
              id: "permisos",
              titulo: "Permisos y contratos",
              cifra: cuantos(contratos.length, "permiso", "permisos"),
              detalle: partes.join(" · "),
              tono: vigentes.length > 0 ? "bien" : "neutro",
              href: (uno ?? ficha) ?? undefined,
              enlace: uno ? "Ver el permiso" : "Ver en su ficha",
            };
          })
        : Promise.resolve(null),
      forestal
        ? bloque("guias", async () => {
            const t = await ForestDirectorioDB.trazabilidadProveedor(tenantId, parte.nombre);
            const { balance } = construirTrazabilidadProveedor(t.ingresos, t.consumos, t.corridas, t.despachos);
            if (balance.guias === 0) return null;
            return {
              id: "guias",
              titulo: "Guías (GTF) en el libro",
              cifra: cuantos(balance.guias, "guía", "guías"),
              detalle: `${m3(balance.ingresadoM3)} ingresados · ${m3(balance.enPatioM3)} en el patio`,
              href: ficha ?? undefined,
              enlace: "Ver en su ficha",
            };
          })
        : Promise.resolve(null),
      bloque("papeles", () =>
        this.papeles(tenantId, role, [base.clave, ...contratos.map((c) => tagEntidad("permiso", c.codigo))], parte.nombre),
      ),
    ]);
    if (!puede(role, "adelantos")) base.sinPermiso.push("su cuenta");
    if (!forestal) base.sinPermiso.push("sus permisos y guías");
    return {
      ...base,
      nombre: parte.nombre,
      detalle: veDetalle && parte.docNumero ? `${parte.docTipo ?? "Doc."} ${parte.docNumero}` : null,
      ficha: ficha ? { href: ficha, texto: "Ver su ficha" } : null,
      bloques: [cuenta, permisos, guias, papeles].filter((b): b is BloqueEnElSistema => !!b),
    };
  }

  private static async dePersona(
    tenantId: string,
    role: string,
    id: string,
    base: { clave: string; tipo: TipoTercero; sinPermiso: string[] },
    veDetalle: boolean,
  ): Promise<TerceroEnElSistema | null> {
    const b = await AdelantosDB.getBeneficiario(tenantId, id);
    if (!b) return null;
    const veCuenta = puede(role, "adelantos");
    if (!veCuenta) base.sinPermiso.push("su cuenta");
    const [cuenta, papeles] = await Promise.all([
      veCuenta ? bloque("cuenta", () => this.cuentaDeBeneficiario(tenantId, id)) : Promise.resolve(null),
      bloque("papeles", () => this.papeles(tenantId, role, [base.clave], b.nombre)),
    ]);
    return {
      ...base,
      nombre: b.nombre,
      detalle: veDetalle ? (b.documento ?? null) : null,
      ficha: null,
      bloques: [cuenta, papeles].filter((x): x is BloqueEnElSistema => !!x),
    };
  }

  private static async deProveedor(
    tenantId: string,
    role: string,
    id: string,
    base: { clave: string; tipo: TipoTercero; sinPermiso: string[] },
    veDetalle: boolean,
  ): Promise<TerceroEnElSistema | null> {
    const s = await SuppliersDB.getById(tenantId, id);
    if (!s) return null;
    const veCompras = veComprasProveedor(role);
    if (!veCompras) base.sinPermiso.push("sus compras");
    const ficha = puede(role, "suppliers") ? hrefDe("proveedor", s.id) : null;
    const [compras, papeles] = await Promise.all([
      veCompras
        ? bloque("compras", async () => {
            const a = await prisma.purchaseOrder.aggregate({
              where: { tenantId, supplierId: s.id, status: { in: ["pendiente", "recibido", "parcial"] } },
              _count: { _all: true },
              _sum: { total: true },
              _max: { createdAt: true },
            });
            if (a._count._all === 0) return null;
            const ultima = a._max.createdAt ? `la última el ${fechaDia(a._max.createdAt)}` : "";
            return {
              id: "compras",
              titulo: "Órdenes de compra",
              cifra: cuantos(a._count._all, "orden", "órdenes"),
              detalle: [`${formatCurrency(Number(a._sum.total ?? 0))} en total`, ultima].filter(Boolean).join(" · "),
              href: hrefDe("proveedor", s.id) ?? undefined,
              enlace: "Ver en Compras",
            };
          })
        : Promise.resolve(null),
      bloque("papeles", () => this.papeles(tenantId, role, [base.clave], s.name)),
    ]);
    return {
      ...base,
      nombre: s.name,
      detalle: veDetalle && s.ruc ? `RUC ${s.ruc}` : null,
      ficha: ficha ? { href: ficha, texto: "Ver su ficha" } : null,
      bloques: [compras, papeles].filter((x): x is BloqueEnElSistema => !!x),
    };
  }

  private static async deCliente(
    tenantId: string,
    role: string,
    id: string,
    base: { clave: string; tipo: TipoTercero; sinPermiso: string[] },
  ): Promise<TerceroEnElSistema | null> {
    const c = await CustomersDB.getByPhone(id, tenantId);
    if (!c) return null;
    const veDatos = veCliente(role);
    const veDeuda = veFiado(role);
    if (!veDeuda) base.sinPermiso.push("su fiado");
    if (!veDatos) base.sinPermiso.push("sus compras");
    const [fiado, compras, papeles] = await Promise.all([
      veDeuda
        ? bloque("fiado", async () => {
            const f = (await CustomersDB.deudaDeFiados(tenantId)).get(c.phone);
            if (!f || f.deuda <= 0) return null;
            return {
              id: "fiado",
              titulo: "Fiado",
              cifra: `Te debe ${formatCurrency(f.deuda)}`,
              detalle: f.vencido > 0 ? `${formatCurrency(f.vencido)} vencido` : undefined,
              tono: "atencion",
              href: hrefDe("cliente", c.phone) ?? undefined,
              enlace: "Ver en Clientes",
            };
          })
        : Promise.resolve(null),
      veDatos
        ? bloque("compras", async () => {
            const k = (await CustomersDB.comprasPorCliente(tenantId)).get(ultimos9(c.phone));
            if (!k || k.compras === 0) return null;
            return {
              id: "compras",
              titulo: "Sus compras",
              cifra: cuantos(k.compras, "compra", "compras"),
              detalle: [`${formatCurrency(k.gastado)} gastado`, k.ultimaCompra ? `la última el ${fechaDia(k.ultimaCompra)}` : ""].filter(Boolean).join(" · "),
              href: hrefDe("cliente", c.phone) ?? undefined,
              enlace: "Ver en Clientes",
            };
          })
        : Promise.resolve(null),
      bloque("papeles", () => this.papeles(tenantId, role, [base.clave], c.name || (veDatos ? c.phone : "Cliente"))),
    ]);
    const ficha = veDatos ? hrefDe("cliente", c.phone) : null;
    return {
      ...base,
      // Sin nombre cargado, el teléfono no se usa de nombre para quien no ve clientes.
      nombre: c.name || (veDatos ? c.phone : "Cliente"),
      detalle: veDatos ? c.phone : null,
      ficha: ficha ? { href: ficha, texto: "Ver su ficha" } : null,
      bloques: [fiado, compras, papeles].filter((x): x is BloqueEnElSistema => !!x),
    };
  }

  private static async deColaborador(
    tenantId: string,
    role: string,
    id: string,
    base: { clave: string; tipo: TipoTercero; sinPermiso: string[] },
    veDetalle: boolean,
  ): Promise<TerceroEnElSistema | null> {
    const c = await ColaboradoresDB.obtener(tenantId, id);
    if (!c) return null;
    const veRrhh = RRHH_GESTION.includes(role as AdminRole);
    const veCuenta = !!c.beneficiarioId && puede(role, "adelantos");
    if (!veRrhh) base.sinPermiso.push("su ficha de personal");
    if (c.beneficiarioId && !veCuenta) base.sinPermiso.push("su cuenta");
    const ficha = veRrhh ? hrefDe("colaborador", c.id) : null;
    const [cuenta, papeles] = await Promise.all([
      veCuenta && c.beneficiarioId ? bloque("cuenta", () => this.cuentaDeBeneficiario(tenantId, c.beneficiarioId as string)) : Promise.resolve(null),
      bloque("papeles", () => this.papeles(tenantId, role, [...new Set([base.clave, tagEntidad("colaborador", c.id)])], c.nombre)),
    ]);
    const puesto: BloqueEnElSistema | null = veRrhh
      ? {
          id: "puesto",
          titulo: "En el equipo",
          cifra: c.puesto?.nombre ?? "Sin puesto",
          detalle: [ESTADO_COLABORADOR[c.estado] ?? c.estado, c.fechaIngreso ? `desde el ${fechaDia(c.fechaIngreso)}` : ""].filter(Boolean).join(" · "),
          tono: c.estado === "ACTIVO" ? "bien" : "neutro",
          href: ficha ?? undefined,
          enlace: "Ver en Personal",
        }
      : null;
    return {
      ...base,
      nombre: c.nombre,
      detalle: veDetalle ? (c.documento ?? null) : null,
      ficha: ficha ? { href: ficha, texto: "Ver su ficha" } : null,
      bloques: [puesto, cuenta, papeles].filter((x): x is BloqueEnElSistema => !!x),
    };
  }
}
