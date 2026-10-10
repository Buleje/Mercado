/**
 * Las secciones de Configuración (`?tab=config&vista=<id>`).
 *
 * Eran 20 tarjetas sueltas, y 36 de sus 91 campos se guardaban sin que nada
 * del sistema los leyera (auditoría 2026-10-04). Quedan 8, agrupadas por lo
 * que el dueño viene a hacer; `buscar` son las palabras de los campos de
 * adentro, para que «yape» o «igv» encuentren la sección aunque no la nombren.
 *
 * El bloque se llama `TABS` a propósito: `admin-subvistas-sincronizadas` lee
 * sus `id:` y exige que coincidan con `VISTAS_POR_MODULO.config`.
 */
import {
  Crown, DollarSign, Layers, Monitor, Settings, Store, Truck, User,
} from "@buleje/design-system/icons";

export type SeccionAjustes =
  | "negocio" | "cobros" | "delivery" | "tienda"
  | "plan" | "equipo" | "panel" | "sistema";

export interface SeccionMeta {
  id: SeccionAjustes;
  label: string;
  grupo: "Tu negocio" | "Cuenta" | "Tu panel";
  icon: React.ComponentType<{ className?: string }>;
  desc: string;
  buscar: string;
}

export const TABS: readonly SeccionMeta[] = [
  { id: "negocio", label: "Datos del negocio", grupo: "Tu negocio", icon: Store, desc: "Nombre, RUC, contacto, ubicación, logo y redes", buscar: "modo tienda pedidos whatsapp checkout razon social ruc correo telefono direccion mapa ubicacion horario descripcion logo portada banner imagen facebook instagram tiktok redes moneda" },
  { id: "cobros", label: "Cobros y comprobantes", grupo: "Tu negocio", icon: DollarSign, desc: "Efectivo, Yape, Plin, transferencia, caja, IGV y conexión con SUNAT", buscar: "pago pagos yape plin transferencia banco cuenta efectivo qr caja alerta exceso cierre hora descuento maximo tope cajero igv impuesto sunat emisor ruc denominacion factura boleta series comprobante nubefact token conexion modo oficial produccion" },
  { id: "delivery", label: "Delivery", grupo: "Tu negocio", icon: Truck, desc: "Zonas, tarifas y envío gratis", buscar: "zona zonas tarifa envio envios gratis minutos reparto entrega" },
  { id: "tienda", label: "Tienda web", grupo: "Tu negocio", icon: Monitor, desc: "Colores, secciones del inicio, menú y modo vacaciones", buscar: "colores color slogan apariencia tema marca secciones inicio menu navegacion vacaciones mantenimiento cerrado tienda web pagina" },
  { id: "plan", label: "Plan", grupo: "Cuenta", icon: Crown, desc: "Tu plan, el uso del mes, dominio propio, pagos y qué incluye cada nivel", buscar: "plan suscripcion pagar precio limite mejorar uso productos usuarios pedidos funcionalidades dominio personalizado dns portal facturacion stripe mercado pago tarjeta niveles basico pro enterprise max" },
  { id: "equipo", label: "Usuarios y acceso", grupo: "Cuenta", icon: User, desc: "Usuarios, roles, contraseña, sesión y dispositivos", buscar: "equipo usuarios roles permisos contraseña clave sesion dispositivos login seguridad acceso mi perfil" },
  { id: "panel", label: "Mi panel", grupo: "Tu panel", icon: Layers, desc: "Módulos, barra lateral, accesos directos y pestaña por defecto", buscar: "modulos ocultar activar barra lateral orden reordenar accesos directos favoritos atajos navegacion pestaña defecto" },
  { id: "sistema", label: "Sistema", grupo: "Tu panel", icon: Settings, desc: "Preferencias, velocidad de tu tienda, salud técnica, actividad y colas", buscar: "lenguaje vocabulario simple tecnico tutorial bienvenida respaldo backup descargar copia preferencias velocidad rendimiento historial salud soporte dispositivo almacenamiento actividad auditoria registro quien hizo colas cron webhook stripe" },
];

export const IDS_AJUSTES = TABS.map((s) => s.id) as readonly SeccionAjustes[];

export const GRUPOS_AJUSTES = ["Tu negocio", "Cuenta", "Tu panel"] as const;

/** minúsculas y sin tildes: «Contraseña» y «contrasena» tienen que encontrarse. */
function normalizar(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

/** Las secciones donde aparece CADA palabra buscada (título, descripción o campos). */
export function filtrarSecciones(consulta: string): readonly SeccionMeta[] {
  const palabras = normalizar(consulta).split(/\s+/).filter(Boolean);
  if (palabras.length === 0) return TABS;
  return TABS.filter((s) => {
    const texto = normalizar(`${s.label} ${s.desc} ${s.buscar}`);
    return palabras.every((p) => texto.includes(p));
  });
}
