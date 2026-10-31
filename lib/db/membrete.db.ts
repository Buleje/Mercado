import "server-only";
import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";
import { getOrSet, invalidate } from "@/lib/cache";
import { SettingsDB } from "@/lib/db/settings.db";
import { armarMembrete, type Membrete } from "@/lib/admin/membrete";
import { bajarLogoPng, type LogoPng } from "@/lib/admin/membrete-logo.server";

/**
 * MembreteDB — nombre, logo y contacto del negocio para los papeles del panel
 * (ADR-514: manda Ajustes › Datos del negocio, `Tenant` es el respaldo).
 *
 * Junta lo configurado (`Settings`) con lo registrado (`Tenant`). `tenantId`
 * SIEMPRE 1er parámetro. Nunca pone el nombre de la plataforma: sin dato, `null`.
 */

const TTL_MEMBRETE_S = 300;
/**
 * Bajo el prefijo `settings:<id>`: el `invalidateByPrefix` que hace
 * `SettingsDB.set` al guardar Ajustes (y el resto de las escrituras de
 * Settings) se lleva también el membrete, sin que nadie se acuerde de él.
 */
const claveMembrete = (tenantId: string) => `settings:${tenantId}:membrete`;

/** El logo en PNG que se sirve, con su ETag (huella de los bytes). */
export interface LogoPngServido extends LogoPng {
  etag: string;
}

const TTL_LOGO_MS = 6 * 60 * 60 * 1000;
/** Un logo que no carga se reintenta pronto: puede ser un corte del storage. */
const TTL_SIN_LOGO_MS = 2 * 60 * 1000;
const LOGOS_MAXIMOS = 100;
/**
 * En la memoria del proceso, no en la caché compartida: son bytes (con Redis
 * irían como JSON). La clave lleva la huella de la URL: cambiar el logo es otra
 * clave, el PNG viejo no se sirve aunque nadie lo invalide.
 */
const logos = new Map<string, { vence: number; valor: LogoPngServido | null }>();
const enCurso = new Map<string, Promise<LogoPngServido | null>>();

const huella = (texto: string | Buffer, largo: number) => createHash("sha256").update(texto).digest("hex").slice(0, largo);

async function logoEnCache(tenantId: string, logoUrl: string): Promise<LogoPngServido | null> {
  const clave = `${tenantId}:${huella(logoUrl, 24)}`;
  const guardado = logos.get(clave);
  if (guardado && guardado.vence > Date.now()) return guardado.valor;
  const pendiente = enCurso.get(clave);
  if (pendiente) return pendiente;

  const p = (async () => {
    try {
      const png = await bajarLogoPng(tenantId, logoUrl);
      const valor = png ? { ...png, etag: `"${huella(png.bytes, 20)}"` } : null;
      logos.delete(clave);
      logos.set(clave, { vence: Date.now() + (valor ? TTL_LOGO_MS : TTL_SIN_LOGO_MS), valor });
      while (logos.size > LOGOS_MAXIMOS) {
        const masViejo = logos.keys().next().value;
        if (masViejo === undefined) break;
        logos.delete(masViejo);
      }
      return valor;
    } finally {
      enCurso.delete(clave);
    }
  })();
  enCurso.set(clave, p);
  return p;
}

export const MembreteDB = {
  async del(tenantId: string): Promise<Membrete> {
    if (!tenantId) throw new Error("tenantId is required");
    return getOrSet<Membrete>(claveMembrete(tenantId), TTL_MEMBRETE_S, async () => {
      const [settings, tenant] = await Promise.all([
        SettingsDB.get(tenantId),
        // Primero por id; el slug sólo si no hay: "main" es a la vez el id de sesión
        // y el slug del negocio principal. Con `OR` y sin orden, un negocio cuyo slug
        // fuera igual al id de otro podía poner su nombre en los PDF de ese otro.
        prisma.tenant
          .findUnique({ where: { id: tenantId }, select: { name: true, logoUrl: true } })
          .then((t) => t ?? prisma.tenant.findUnique({ where: { slug: tenantId }, select: { name: true, logoUrl: true } })),
      ]);
      return armarMembrete(settings, tenant);
    });
  },

  /**
   * El logo del negocio en PNG (lado mayor ≤ 600 px) para jsPDF, pdf-lib o un
   * canvas, con su ETag. `null` si no tiene logo o no se pudo bajar/convertir.
   */
  async logoPng(tenantId: string): Promise<LogoPngServido | null> {
    if (!tenantId) throw new Error("tenantId is required");
    const { logoUrl } = await MembreteDB.del(tenantId);
    return logoUrl ? logoEnCache(tenantId, logoUrl) : null;
  },

  /**
   * Olvida el membrete y los logos de un negocio. Guardar Ajustes ya lo hace
   * solo (prefijo `settings:`); esto es para lo que escribe en `Tenant`
   * (nombre o logo desde el superadmin).
   */
  olvidar(tenantId: string): void {
    invalidate(claveMembrete(tenantId));
    for (const clave of logos.keys()) if (clave.startsWith(`${tenantId}:`)) logos.delete(clave);
  },
};
