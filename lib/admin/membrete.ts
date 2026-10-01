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
  };
}
