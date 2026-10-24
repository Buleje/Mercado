// Avisos por correo de cada tienda (21-10): qué correos automáticos le llegan al
// dueño (Tenant.ownerEmail) y el interruptor del superadmin para pausarlos.
// Sin "server-only": lo comparten el endpoint, la lista de tiendas y la UI.
// Estado guardado en PlatformSetting `avisos-correo:<tenantId>`; sin fila = todo encendido.

export const TIPOS_AVISO_CORREO = ["pedidos", "stock", "reportes", "forestal", "cuenta"] as const;
export type TipoAvisoCorreo = (typeof TIPOS_AVISO_CORREO)[number];

export const AVISO_CORREO_INFO: Record<TipoAvisoCorreo, { nombre: string; descripcion: string }> = {
  pedidos: { nombre: "Pedidos y clientes", descripcion: "Cada pedido nuevo y los comprobantes de pago que manda un cliente" },
  stock: { nombre: "Stock bajo", descripcion: "Productos bajo el mínimo o que se agotan pronto (una vez al día)" },
  reportes: { nombre: "Reportes", descripcion: "Resumen de la semana y reporte del mes con PDF" },
  forestal: { nombre: "Plazos forestales", descripcion: "Vencimientos del libro de operaciones, guías y permisos" },
  cuenta: { nombre: "Cuenta y plan", descripcion: "Fin de la prueba gratis y avisos de la plataforma" },
};

/** Lo que se guarda en PlatformSetting `avisos-correo:<tenantId>`. */
export interface AvisosCorreoGuardado {
  /** Interruptor general: true = no sale ningún correo automático a la tienda. */
  pausado: boolean;
  /** Tipos apagados uno por uno (los demás salen). */
  apagados: TipoAvisoCorreo[];
}

/** Resumen que viaja en cada fila de GET /api/superadmin/tenants (`TenantRow.avisosCorreo`). */
export interface AvisosCorreoResumen {
  /** Correo que recibe los avisos (Tenant.ownerEmail); null o "" = no hay a quién mandar. */
  correo: string | null;
  esGmail: boolean;
  pausado: boolean;
  /** Tipos que hoy saldrían de verdad: 0 si está pausado o no hay correo. */
  activos: number;
  /** Tipos que aplican a esta tienda (forestal sólo cuenta en tiendas forestales). */
  total: number;
  /** Cuentas de Google conectadas en la Agenda (AgendaConexionGoogle con estado «activa»). */
  googleConectado: number;
}

export interface AvisoCorreoEstado {
  tipo: TipoAvisoCorreo;
  nombre: string;
  descripcion: string;
  /** Interruptor de este tipo (independiente del general). */
  activo: boolean;
  /** false = la tienda no usa ese módulo (p. ej. forestal en una bodega); se muestra atenuado. */
  aplica: boolean;
  /** Último envío registrado (ISO) o null si no hay registro. */
  ultimoEnvio: string | null;
}

/** GET /api/superadmin/tenants/[slug]/avisos-correo → { ok: true, avisos: AvisosCorreoDetalle }. */
export interface AvisosCorreoDetalle extends AvisosCorreoResumen {
  tipos: AvisoCorreoEstado[];
  google: { email: string; estado: string; ultimaSync: string | null }[];
  /** Settings.smtpUser si la tienda configuró su propio servidor de correo (hoy no se usa para enviar). */
  smtpPropio: string | null;
  cambiadoPor: string | null;
  cambiadoEn: string | null;
}

/** PATCH /api/superadmin/tenants/[slug]/avisos-correo (con CSRF) → { ok: true, avisos: AvisosCorreoDetalle }. */
export type AvisosCorreoPatch = { pausado: boolean } | { tipo: TipoAvisoCorreo; activo: boolean };

export function esCorreoGmail(correo: string | null | undefined): boolean {
  return !!correo && /@(gmail|googlemail)\.com$/i.test(correo.trim());
}

/** Un tipo de aviso tal como lo ve el dueño en su panel (sólo los que aplican a su negocio). */
export interface AvisoCorreoDeLaTienda {
  tipo: TipoAvisoCorreo;
  nombre: string;
  descripcion: string;
  activo: boolean;
  /** Último envío registrado (ISO) o null. */
  ultimoEnvio: string | null;
}

/**
 * GET/PATCH /api/admin/avisos-correo (24-10) → { ok: true, avisos: AvisosCorreoDeLaTienda }.
 * Lo que el dueño ve en Configuración › Datos del negocio: sin las cuentas de Google,
 * el servidor propio ni el usuario del superadmin que lo cambió.
 */
export interface AvisosCorreoDeLaTienda {
  /** Completo para el dueño y el admin; enmascarado para el encargado. null = no hay correo. */
  correo: string | null;
  pausado: boolean;
  /** Tipos que hoy saldrían de verdad: 0 si está pausado o no hay correo. */
  activos: number;
  total: number;
  tipos: AvisoCorreoDeLaTienda[];
  /** Sólo el dueño y el admin cambian los interruptores; el encargado los ve. */
  puedeCambiar: boolean;
  /** Último cambio: `por` = usuario del negocio, o null si lo cambió la plataforma. */
  cambio: { en: string; por: string | null } | null;
}

/** «brandon@gmail.com» → «b•••@gmail.com»: el encargado ve a qué casilla llegan, no la dirección. */
export function enmascararCorreo(correo: string | null | undefined): string | null {
  const limpio = correo?.trim();
  if (!limpio) return null;
  const arroba = limpio.lastIndexOf("@");
  if (arroba <= 0) return "•••";
  return `${limpio[0]}•••${limpio.slice(arroba)}`;
}
