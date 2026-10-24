// Correos de la PLATAFORMA (23-10): los que no van al dueño de una tienda sino al correo
// de la plataforma (SMTP_USER / NOTIFY_EMAIL / CACAO_DIGEST_EMAIL / SUPERADMIN_NOTIFY_EMAIL).
// Sin "server-only": lo comparten el endpoint y la pantalla del superadmin.
// Estado en PlatformSetting `avisos-correo:plataforma`; sin fila = todo encendido.

export const TIPOS_CORREO_PLATAFORMA = [
  "cacao",
  "carritos",
  "reposicion",
  "resumen",
  "caja",
  "stock",
  "pedidos",
  "superadmin",
] as const;
export type TipoCorreoPlataforma = (typeof TIPOS_CORREO_PLATAFORMA)[number];

export const CORREO_PLATAFORMA_INFO: Record<TipoCorreoPlataforma, { nombre: string; descripcion: string }> = {
  cacao: { nombre: "Precio del cacao", descripcion: "Cada mañana (7:00) el precio del cacao con su gráfico" },
  carritos: { nombre: "Carritos abandonados", descripcion: "Cada vez que un cliente deja su carrito sin comprar" },
  reposicion: { nombre: "Reposición de productos", descripcion: "Lista de productos por reponer, agrupada por proveedor" },
  resumen: { nombre: "Resumen diario de ventas", descripcion: "Lo vendido en el día, los productos más vendidos y cómo pagaron" },
  caja: { nombre: "Cierre de caja", descripcion: "Un resumen cada vez que se cierra una caja" },
  stock: { nombre: "Stock bajo (resumen general)", descripcion: "Copia de los productos bajo el mínimo de todas las tiendas" },
  pedidos: { nombre: "Pedidos de tiendas sin correo", descripcion: "Pedidos de tiendas que no tienen correo del dueño: el aviso te llega a ti" },
  superadmin: { nombre: "Alertas de la plataforma", descripcion: "Fallos del sistema, pedidos atrasados y documentos por vencer" },
};

/** Lo que se guarda en PlatformSetting `avisos-correo:plataforma`. */
export interface CorreosPlataformaGuardado {
  /** true = no sale ningún correo de la plataforma. */
  pausado: boolean;
  apagados: TipoCorreoPlataforma[];
}

export interface CorreoPlataformaEstado {
  tipo: TipoCorreoPlataforma;
  nombre: string;
  descripcion: string;
  /** Interruptor de este tipo (independiente del general). */
  activo: boolean;
  /** A qué correo llega hoy; null = no hay ninguno configurado (no sale). */
  destino: string | null;
}

export interface TiendaCorreoEstado {
  id: string;
  slug: string;
  name: string;
  correo: string | null;
  pausado: boolean;
  activos: number;
  total: number;
}

/** GET /api/superadmin/avisos-correo-plataforma?correo= → { ok: true, ...CorreosPlataformaDetalle }. */
export interface CorreosPlataformaDetalle {
  pausado: boolean;
  tipos: CorreoPlataformaEstado[];
  /** El correo consultado (por defecto, el de la plataforma). */
  consulta: string | null;
  /** Tipos de la plataforma que van a ese correo. */
  tiposALaConsulta: TipoCorreoPlataforma[];
  /** Tiendas cuyo ownerEmail es ese correo. */
  tiendas: TiendaCorreoEstado[];
  cambiadoPor: string | null;
  cambiadoEn: string | null;
}

export type CorreosPlataformaPatch = { pausado: boolean } | { tipo: TipoCorreoPlataforma; activo: boolean };
