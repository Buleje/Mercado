import "server-only";
import { prisma } from "@/lib/prisma";
import { getOrSet, invalidate } from "@/lib/cache";
import { logActivity } from "@/lib/activity-logger";
import { logger } from "@/lib/logger";
import { cifrarSecreto, descifrarSecreto } from "@/lib/cripto-secretos";
import { esProveedorIa } from "@/lib/ia-proveedores/catalogo";
import type { EstadoProveedorIa, ProveedorConfigurado, ProveedorIaId } from "@/lib/ia-proveedores/tipos";

/**
 * IaProveedoresDB — los modelos de IA que el negocio conecta con SU clave
 * (Buleje IA, ADR-528). Tabla `TenantIaProveedor`.
 *
 * - La clave se guarda cifrada (`lib/cripto-secretos`, AES-GCM con
 *   `AUTH_SECRET`) y NUNCA sale de acá salvo por `conClave()`, que la usa el
 *   servidor para llamar al proveedor. Las vistas solo ven `claveFinal`.
 * - Un solo principal por negocio: los cambios de principal corren bajo un
 *   candado por negocio (`pg_advisory_xact_lock`), así dos altas a la vez no
 *   dejan dos principales.
 * - Caché: solo la lista PÚBLICA (sin cifrado) por 60 s; se invalida tras cada
 *   escritura. La fila con la clave se lee siempre de la base.
 */

const TTL = 60;
const claveCache = (tenantId: string) => `ia-proveedores:${tenantId}`;
const candado = (tenantId: string) => `ia-proveedor-principal:${tenantId}`;

type Fila = {
  id: string;
  proveedor: string;
  nombre: string;
  modelo: string;
  modeloVision: string | null;
  baseUrl: string | null;
  claveFinal: string;
  principal: boolean;
  activo: boolean;
  ultimaPrueba: Date | null;
  ultimoEstado: string | null;
};

const SELECT_PUBLICO = {
  id: true,
  proveedor: true,
  nombre: true,
  modelo: true,
  modeloVision: true,
  baseUrl: true,
  claveFinal: true,
  principal: true,
  activo: true,
  ultimaPrueba: true,
  ultimoEstado: true,
} as const;

function aPublico(f: Fila): ProveedorConfigurado {
  return {
    id: f.id,
    proveedor: (esProveedorIa(f.proveedor) ? f.proveedor : "personalizado") as ProveedorIaId,
    nombre: f.nombre,
    modelo: f.modelo,
    modeloVision: f.modeloVision,
    baseUrl: f.baseUrl,
    claveFinal: f.claveFinal,
    principal: f.principal,
    activo: f.activo,
    ultimaPrueba: f.ultimaPrueba ? f.ultimaPrueba.toISOString() : null,
    ultimoEstado: (f.ultimoEstado as EstadoProveedorIa | null) ?? null,
  };
}

/** Los últimos 4 de la clave, para reconocerla («…a9F2»). */
export function finalDeClave(clave: string): string {
  const limpia = clave.trim();
  return limpia.length >= 8 ? limpia.slice(-4) : "";
}

export interface AltaProveedor {
  proveedor: ProveedorIaId;
  nombre?: string;
  modelo: string;
  modeloVision?: string | null;
  baseUrl?: string | null;
  clave: string;
  principal?: boolean;
  ultimoEstado?: EstadoProveedorIa | null;
}

export interface CambiosProveedor {
  nombre?: string;
  modelo?: string;
  modeloVision?: string | null;
  baseUrl?: string | null;
  clave?: string;
  principal?: boolean;
  activo?: boolean;
  ultimoEstado?: EstadoProveedorIa | null;
}

export interface ProveedorConClave {
  config: ProveedorConfigurado;
  clave: string;
}

function auditar(tenantId: string, accion: string, detalle: string, id: string, usuario: string): void {
  logActivity(accion, "ia_proveedor", detalle, id, usuario, undefined, tenantId).catch((err) =>
    logger.error("[ia-proveedores] no se pudo auditar", { error: String(err), tenantId, accion }),
  );
}

export const IaProveedoresDB = {
  async listar(tenantId: string): Promise<ProveedorConfigurado[]> {
    return getOrSet(claveCache(tenantId), TTL, async () => {
      const filas = await prisma.tenantIaProveedor.findMany({
        where: { tenantId },
        select: SELECT_PUBLICO,
        orderBy: [{ principal: "desc" }, { createdAt: "asc" }],
      });
      return filas.map(aPublico);
    });
  },

  async obtener(tenantId: string, id: string): Promise<ProveedorConfigurado | null> {
    const f = await prisma.tenantIaProveedor.findFirst({ where: { tenantId, id }, select: SELECT_PUBLICO });
    return f ? aPublico(f) : null;
  },

  /**
   * Con la clave descifrada — SOLO para llamar al proveedor desde el servidor.
   * `id` ausente = el principal activo. `null` si no hay, o si la clave no se
   * puede descifrar (cambió `AUTH_SECRET`): se trata como «sin proveedor».
   */
  async conClave(tenantId: string, id?: string): Promise<ProveedorConClave | null> {
    const f = await prisma.tenantIaProveedor.findFirst({
      where: id ? { tenantId, id } : { tenantId, principal: true, activo: true },
      select: { ...SELECT_PUBLICO, claveCifrada: true },
      orderBy: { updatedAt: "desc" },
    });
    if (!f) return null;
    const clave = descifrarSecreto(f.claveCifrada);
    if (clave === null) {
      logger.warn("[ia-proveedores] la clave guardada no se pudo descifrar", { tenantId, id: f.id });
      return null;
    }
    return { config: aPublico(f), clave };
  },

  /** Alta. El primero del negocio queda principal aunque no se pida. */
  async crear(tenantId: string, datos: AltaProveedor, usuario: string): Promise<ProveedorConfigurado> {
    const claveCifrada = cifrarSecreto(datos.clave.trim());
    const fila = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${candado(tenantId)}))`;
      const hayPrincipal = (await tx.tenantIaProveedor.count({ where: { tenantId, principal: true } })) > 0;
      const principal = datos.principal === true || !hayPrincipal;
      if (principal && hayPrincipal) {
        await tx.tenantIaProveedor.updateMany({ where: { tenantId, principal: true }, data: { principal: false } });
      }
      return tx.tenantIaProveedor.create({
        data: {
          tenantId,
          proveedor: datos.proveedor,
          nombre: datos.nombre?.trim() ?? "",
          modelo: datos.modelo.trim(),
          modeloVision: datos.modeloVision?.trim() || null,
          baseUrl: datos.baseUrl?.trim() || null,
          claveCifrada,
          claveFinal: finalDeClave(datos.clave),
          principal,
          activo: true,
          ultimaPrueba: datos.ultimoEstado ? new Date() : null,
          ultimoEstado: datos.ultimoEstado ?? null,
          creadoPor: usuario,
        },
        select: SELECT_PUBLICO,
      });
    });
    invalidate(claveCache(tenantId));
    auditar(tenantId, "ia_proveedor_crear", `Conectó ${datos.proveedor} (${datos.modelo})${fila.principal ? " como principal" : ""}`, fila.id, usuario);
    return aPublico(fila);
  },

  /** PATCH parcial: ausente = no se toca; `null` en modeloVision/baseUrl = borrar. */
  async actualizar(tenantId: string, id: string, cambios: CambiosProveedor, usuario: string): Promise<ProveedorConfigurado | null> {
    const data: Record<string, unknown> = {};
    if (cambios.nombre !== undefined) data.nombre = cambios.nombre.trim();
    if (cambios.modelo !== undefined) data.modelo = cambios.modelo.trim();
    if (cambios.modeloVision !== undefined) data.modeloVision = cambios.modeloVision?.trim() || null;
    if (cambios.baseUrl !== undefined) data.baseUrl = cambios.baseUrl?.trim() || null;
    if (cambios.activo !== undefined) data.activo = cambios.activo;
    if (cambios.principal !== undefined) data.principal = cambios.principal;
    if (cambios.clave !== undefined) {
      data.claveCifrada = cifrarSecreto(cambios.clave.trim());
      data.claveFinal = finalDeClave(cambios.clave);
    }
    if (cambios.ultimoEstado !== undefined) {
      data.ultimoEstado = cambios.ultimoEstado;
      data.ultimaPrueba = new Date();
    }

    // Apagar el principal es como borrarlo para el asistente: otro activo toma su
    // lugar, o el negocio vuelve a la IA de la plataforma sin que nadie lo note.
    const apagaPrincipal = cambios.activo === false;
    const fila = await prisma.$transaction(async (tx) => {
      if (cambios.principal === true || apagaPrincipal) {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${candado(tenantId)}))`;
      }
      const antes = apagaPrincipal
        ? await tx.tenantIaProveedor.findFirst({ where: { tenantId, id }, select: { principal: true } })
        : null;
      // Un principal apagado deja de serlo (si no, quedarían dos al prender el otro).
      if (antes?.principal) data.principal = false;
      // Ownership en el WHERE: un id de otro negocio no cambia nada.
      const r = await tx.tenantIaProveedor.updateMany({ where: { tenantId, id }, data });
      if (r.count === 0) return null;
      if (cambios.principal === true) {
        await tx.tenantIaProveedor.updateMany({ where: { tenantId, principal: true, NOT: { id } }, data: { principal: false } });
      }
      if (antes?.principal) {
        const siguiente = await tx.tenantIaProveedor.findFirst({
          where: { tenantId, activo: true, NOT: { id } },
          orderBy: { createdAt: "desc" },
          select: { id: true },
        });
        if (siguiente) await tx.tenantIaProveedor.updateMany({ where: { tenantId, id: siguiente.id }, data: { principal: true } });
      }
      return tx.tenantIaProveedor.findFirst({ where: { tenantId, id }, select: SELECT_PUBLICO });
    });
    if (!fila) return null;
    invalidate(claveCache(tenantId));
    const campos = Object.keys(cambios).map((k) => (k === "clave" ? "clave (nueva)" : k)).join(", ");
    auditar(tenantId, "ia_proveedor_editar", `Cambió ${fila.proveedor}: ${campos}`, id, usuario);
    return aPublico(fila);
  },

  /** Borra. Si era el principal, el activo más reciente pasa a principal. */
  async borrar(tenantId: string, id: string, usuario: string): Promise<boolean> {
    const borrado = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${candado(tenantId)}))`;
      const antes = await tx.tenantIaProveedor.findFirst({ where: { tenantId, id }, select: { proveedor: true, principal: true } });
      if (!antes) return null;
      await tx.tenantIaProveedor.deleteMany({ where: { tenantId, id } });
      if (antes.principal) {
        const siguiente = await tx.tenantIaProveedor.findFirst({
          where: { tenantId, activo: true },
          orderBy: { updatedAt: "desc" },
          select: { id: true },
        });
        if (siguiente) await tx.tenantIaProveedor.updateMany({ where: { tenantId, id: siguiente.id }, data: { principal: true } });
      }
      return antes;
    });
    if (!borrado) return false;
    invalidate(claveCache(tenantId));
    auditar(tenantId, "ia_proveedor_borrar", `Quitó ${borrado.proveedor}${borrado.principal ? " (era el principal)" : ""}`, id, usuario);
    return true;
  },

  /** El resultado de la última prueba o llamada real (clave vencida, sin saldo…). */
  async anotarEstado(tenantId: string, id: string, estado: EstadoProveedorIa): Promise<void> {
    await prisma.tenantIaProveedor.updateMany({ where: { tenantId, id }, data: { ultimoEstado: estado, ultimaPrueba: new Date() } });
    invalidate(claveCache(tenantId));
  },
};
