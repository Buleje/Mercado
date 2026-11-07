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
 *
 * ADR-514 (23-10): manda Ajustes › Datos del negocio; `Tenant` es sólo respaldo.
 * El título (`nombre`) es el nombre comercial; si no hay, la razón social; si
 * no, el nombre registrado. Nunca el de la plataforma: sin dato, `null` y el
 * documento decide.
 */

/** De dónde salió el logo: Ajustes › Datos del negocio o el registro del negocio (superadmin). */
export type FuenteLogo = "ajustes" | "registro";

export interface Membrete {
  /** El TÍTULO del documento: nombre comercial › razón social › nombre registrado (ADR-514). */
  nombre: string | null;
  /** El logo tal como se subió (puede ser WebP o SVG: jsPDF y pdf-lib no los leen; usar `logoPngUrl`). */
  logoUrl: string | null;
  telefono: string | null;
  direccion: string | null;
  /** RUC del negocio (`Settings.ruc`, si no el de SUNAT): lo pide el proveedor para facturarle. */
  ruc: string | null;
  /** El pie que el negocio escribió para sus comprobantes (`Settings.invoiceFooterText`). */
  pie: string | null;
  /** Razón social con que emite (`Settings.razonSocial`): la pide la boleta/factura. */
  razonSocial?: string | null;
  /** Correo del negocio (`Settings.businessEmail`): va en el pie del recibo. */
  correo?: string | null;
  /** El nombre comercial tal cual se escribió en Ajustes (`Settings.businessName`), sin respaldo. */
  nombreComercial?: string | null;
  /** WhatsApp de la tienda (`storeTheme.whatsapp`), aparte del teléfono. */
  whatsapp?: string | null;
  fuenteLogo?: FuenteLogo | null;
  /**
   * El mismo logo ya en PNG (lado mayor ≤ 600 px), servido por el panel
   * (`GET /api/admin/membrete/logo`): jsPDF, canvas y html-to-image lo cargan
   * del mismo sitio, sin CORS. `null` si no hay logo.
   */
  logoPngUrl?: string | null;
}

/** Los roles que imprimen papeles con el membrete (la ruta del membrete y la del logo). */
export const ROLES_MEMBRETE = ["admin", "owner", "manager", "cajero", "almacenero", "analista", "tienda_owner", "superadmin"] as const;

/** La ruta del logo en PNG. `v` cambia cuando cambia el logo: el navegador no sirve el viejo. */
export const RUTA_LOGO_PNG = "/api/admin/membrete/logo";

/** Huella corta y estable de un texto (djb2): sirve para versionar una URL, no para seguridad. */
export function huellaCorta(texto: string): string {
  let h = 5381;
  for (let i = 0; i < texto.length; i++) h = ((h << 5) + h + texto.charCodeAt(i)) >>> 0;
  return h.toString(36);
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
        razonSocial?: string | null;
        businessEmail?: string | null;
        /** La denominación que devolvió SUNAT: respaldo de la razón social. */
        sunatDenominacion?: string | null;
        /** Lo que se configuró para la tienda: `phone`, `whatsapp`, `address`. */
        storeTheme?: Record<string, unknown> | null;
      }
    | null
    | undefined,
  tenant: { name?: string | null; logoUrl?: string | null } | null | undefined,
): Membrete {
  const nombreComercial = limpio(settings?.businessName);
  const razonSocial = limpio(settings?.razonSocial) ?? limpio(settings?.sunatDenominacion);
  const logoAjustes = limpio(settings?.logoUrl);
  const logoUrl = logoAjustes ?? limpio(tenant?.logoUrl);
  return {
    nombre: nombreComercial ?? razonSocial ?? limpio(tenant?.name),
    logoUrl,
    telefono: limpio(settings?.businessPhone) ?? limpio(settings?.storeTheme?.phone) ?? limpio(settings?.storeTheme?.whatsapp),
    direccion: limpio(settings?.businessAddress) ?? limpio(settings?.storeTheme?.address),
    ruc: limpio(settings?.ruc) ?? limpio(settings?.sunatRuc),
    pie: limpio(settings?.invoiceFooterText),
    razonSocial,
    correo: limpio(settings?.businessEmail),
    nombreComercial,
    whatsapp: limpio(settings?.storeTheme?.whatsapp),
    fuenteLogo: logoUrl ? (logoAjustes ? "ajustes" : "registro") : null,
    logoPngUrl: logoUrl ? `${RUTA_LOGO_PNG}?v=${huellaCorta(logoUrl)}` : null,
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
