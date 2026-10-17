/**
 * lib/admin/membrete.ts — con qué nombre, logo y contacto sale el negocio en
 * los papeles del panel (hoja semanal de asistencia, fotocheck).
 *
 * El nombre configurado (`Settings.businessName`) puede estar vacío: en el
 * negocio de Blas es "" y en `main` es null (medido 2026-09-14), así que los
 * PDF salían sin nombre. Entonces va el nombre con que se registró el negocio
 * (`Tenant.name`). Puro: lo usan la clase DB, la ruta y el cliente.
 *
 * El contacto igual: en Blas y mi-pollo `businessPhone`/`businessAddress` son ""
 * y la dirección vive en la tienda (`storeTheme.address`); sin ese respaldo el
 * dorso del fotocheck no decía a dónde devolverlo.
 */

export interface Membrete {
  nombre: string | null;
  logoUrl: string | null;
  telefono: string | null;
  direccion: string | null;
  /** RUC del negocio (`Settings.ruc`, si no el de SUNAT): lo pide el proveedor para facturarle. */
  ruc: string | null;
  /** El pie que el negocio escribió para sus comprobantes (`Settings.invoiceFooterText`). */
  pie: string | null;
}

/** El logo ya listo para jsPDF: PNG en data URL y su tamaño en píxeles, para respetar la proporción. */
export interface LogoPdf {
  dataUrl: string;
  ancho: number;
  alto: number;
}

const limpio = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

export function armarMembrete(
  settings:
    | {
        businessName?: string | null;
        logoUrl?: string | null;
        businessPhone?: string | null;
        businessAddress?: string | null;
        invoiceFooterText?: string | null;
        ruc?: string | null;
        sunatRuc?: string | null;
        /** Lo que se configuró para la tienda: `phone`, `whatsapp`, `address`. */
        storeTheme?: Record<string, unknown> | null;
      }
    | null
    | undefined,
  tenant: { name?: string | null; logoUrl?: string | null } | null | undefined,
): Membrete {
  return {
    nombre: limpio(settings?.businessName) ?? limpio(tenant?.name),
    logoUrl: limpio(settings?.logoUrl) ?? limpio(tenant?.logoUrl),
    telefono: limpio(settings?.businessPhone) ?? limpio(settings?.storeTheme?.phone) ?? limpio(settings?.storeTheme?.whatsapp),
    direccion: limpio(settings?.businessAddress) ?? limpio(settings?.storeTheme?.address),
    ruc: limpio(settings?.ruc) ?? limpio(settings?.sunatRuc),
    pie: limpio(settings?.invoiceFooterText),
  };
}

/** Lo que el cierre de un ticket o mensaje necesita del membrete. */
export type FirmaNegocio = Pick<Membrete, "nombre" | "direccion" | "pie">;

/**
 * Las últimas líneas de un ticket o recibo que recibe un cliente: el
 * agradecimiento, «Nombre — dirección» y el pie del negocio. Con pie, el pie
 * reemplaza al agradecimiento genérico (es lo que el dueño eligió decir al
 * final). Sin datos no sale ninguna marca: nunca el nombre de la plataforma.
 */
export function cierreDelNegocio(firma: FirmaNegocio | null | undefined, gracias: string): string[] {
  const nombre = limpio(firma?.nombre);
  const direccion = limpio(firma?.direccion);
  const pie = limpio(firma?.pie);
  const quien = [nombre, direccion].filter(Boolean).join(" — ");
  return [pie ? null : gracias, quien || null, pie].filter((l): l is string => !!l);
}

/** «Boleta — Musa»: el título con el nombre del negocio, o sólo el título. */
export function conNombreDelNegocio(titulo: string, firma: FirmaNegocio | null | undefined): string {
  const nombre = limpio(firma?.nombre);
  return nombre ? `${titulo} — ${nombre}` : titulo;
}
