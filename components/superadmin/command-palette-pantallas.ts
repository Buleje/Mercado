/**
 * Todas las pantallas del superadmin para el Ctrl+K — fuente única (SUPMKT-4, 2026-10-09).
 *
 * Antes el buscador conocía 12 de las 50 pantallas (las 55 páginas menos login
 * y 4 que redirigen). Las pestañas de cada módulo salen de `ModuleTabs`
 * (mismo nombre que ves arriba de la pantalla); acá sólo se agregan las que no
 * son pestaña y las palabras con que las buscas. Un test compara esta lista
 * con las páginas de `app/superadmin`: una pantalla nueva sin entrada lo pone rojo.
 */

import {
  Activity,
  BookOpen,
  ChefHat,
  FileText,
  Gauge,
  ImageIcon,
  LayoutDashboard,
  Receipt,
  ShoppingBag,
  SlidersHorizontal,
  Truck,
  Webhook,
  type LucideIcon,
} from "@buleje/design-system/icons";
import {
  ANALYTICS_TABS,
  COMUNICACION_TABS,
  DISENO_TABS,
  FINANZAS_TABS,
  MARCA_TABS,
  MARKETPLACE_TABS,
  RETENCION_TABS,
  SALUD_TABS,
  SEGURIDAD_TABS,
  SETTINGS_TABS,
  TENANTS_TABS,
  VENDORS_TABS,
  type ModuleTab,
} from "./_shared/ModuleTabs";
import { sinTildes } from "@/lib/superadmin/buscar-negocio";

export interface PantallaSuperadmin {
  href: string;
  label: string;
  /** Módulo al que pertenece (se muestra a la derecha y también se busca). */
  grupo: string;
  icon: LucideIcon;
  keywords: string[];
}

const MODULOS: [string, ModuleTab[]][] = [
  ["Tiendas", TENANTS_TABS],
  ["Retención", RETENCION_TABS],
  ["Comunicación", COMUNICACION_TABS],
  ["Finanzas", FINANZAS_TABS],
  ["Analítica", ANALYTICS_TABS],
  ["Salud", SALUD_TABS],
  ["Marketplace", MARKETPLACE_TABS],
  ["Vendors", VENDORS_TABS],
  ["Marca", MARCA_TABS],
  ["Diseño", DISENO_TABS],
  ["Seguridad", SEGURIDAD_TABS],
  ["Ajustes", SETTINGS_TABS],
];

/** Pantallas que no son pestaña de ningún módulo. */
const SUELTAS: Omit<PantallaSuperadmin, "keywords">[] = [
  { href: "/superadmin/dashboard", label: "Dashboard", grupo: "Inicio", icon: LayoutDashboard },
  { href: "/superadmin/control-center", label: "Centro de control", grupo: "Inicio", icon: Gauge },
  { href: "/superadmin/activity", label: "Actividad", grupo: "Inicio", icon: Activity },
  { href: "/superadmin/documentos", label: "Mis documentos", grupo: "Inicio", icon: FileText },
  { href: "/superadmin/orders", label: "Pedidos", grupo: "Tiendas", icon: ShoppingBag },
  { href: "/superadmin/repartidores", label: "Repartidores", grupo: "Tiendas", icon: Truck },
  { href: "/superadmin/gastos", label: "Gastos", grupo: "Finanzas", icon: Receipt },
  { href: "/superadmin/rescue/reglas", label: "Reglas de rescate", grupo: "Retención", icon: SlidersHorizontal },
  { href: "/superadmin/marketplace/suppliers", label: "Proveedores del marketplace", grupo: "Marketplace", icon: Truck },
  { href: "/superadmin/marketplace/category-images", label: "Imágenes de categorías", grupo: "Marketplace", icon: ImageIcon },
  { href: "/superadmin/variant-catalog", label: "Catálogo de variantes", grupo: "Diseño", icon: BookOpen },
  { href: "/superadmin/recetario", label: "Recetario", grupo: "Diseño", icon: ChefHat },
  { href: "/superadmin/automations", label: "Automatizaciones", grupo: "Operaciones", icon: Webhook },
];

/** Palabras con que se busca cada pantalla (además de su nombre y su módulo). */
const PALABRAS: Record<string, string[]> = {
  "/superadmin/dashboard": ["home", "inicio", "resumen"],
  "/superadmin/control-center": ["panel", "control"],
  "/superadmin/activity": ["log", "historial"],
  "/superadmin/documentos": ["drive", "archivos"],
  "/superadmin/orders": ["ordenes", "ventas"],
  "/superadmin/repartidores": ["delivery", "motorizados"],
  "/superadmin/gastos": ["egresos", "costos"],
  "/superadmin/tenants": ["clientes", "empresas", "tenants", "negocios"],
  "/superadmin/tenants/growth": ["altas", "nuevos"],
  "/superadmin/tenants/usage": ["uso", "limites", "plan", "upgrade"],
  "/superadmin/tenants/onboarding": ["onboarding", "trabados", "primeros pasos"],
  "/superadmin/tenants/integrations": ["yape", "whatsapp", "conectar"],
  "/superadmin/tenants/map": ["ubicacion", "zonas"],
  "/superadmin/specializations": ["piezas", "a medida", "pagina propia", "especializaciones", "enchufes", "portada", "forestal"],
  "/superadmin/alerts": ["alertas", "churn", "en riesgo"],
  "/superadmin/rescue": ["rescate", "cola", "en riesgo", "abandono"],
  "/superadmin/rescue/reglas": ["automatico", "reglas"],
  "/superadmin/chat": ["mensajes", "conversaciones", "whatsapp"],
  "/superadmin/comunicados": ["anuncios", "difusion", "avisos"],
  "/superadmin/support": ["tickets", "ayuda"],
  "/superadmin/billing": ["facturacion", "stripe", "cobros", "suscripciones"],
  "/superadmin/pagos-pendientes": ["cobrar", "deudas"],
  "/superadmin/pagos-yape": ["yape", "comprobantes"],
  "/superadmin/analytics": ["reportes", "metricas", "kpi"],
  "/superadmin/feature-adoption": ["funciones", "uso"],
  "/superadmin/cohorts": ["retencion"],
  "/superadmin/intelligence": ["barrio", "zonas"],
  "/superadmin/health": ["estado", "monitoreo"],
  "/superadmin/slo": ["presupuesto de errores", "disponibilidad"],
  "/superadmin/dlq": ["cola muerta", "reintentos", "fallidos"],
  "/superadmin/tenant-errors": ["errores por negocio", "fallas", "bugs"],
  "/superadmin/marketplace": ["mercado", "vendor", "multi-tienda", "hub"],
  "/superadmin/stores": ["tiendas publicadas", "mercado"],
  "/superadmin/marketplace/suppliers": ["proveedor", "supplier", "aplicacion", "aprobacion"],
  "/superadmin/marketplace/category-images": ["categoria", "imagen", "foto", "marketplace grid"],
  "/superadmin/vendor-applications": ["solicitudes", "aprobar"],
  "/superadmin/banners": ["portada", "carrusel"],
  "/superadmin/banco-imagenes": ["fotos", "imagenes"],
  "/superadmin/plantilla": ["admin", "plantilla"],
  "/superadmin/variant-catalog": ["tallas", "colores"],
  "/superadmin/recetario": ["recetas", "cocina"],
  "/superadmin/automations": ["reglas", "flujos", "webhooks"],
  "/superadmin/security": ["accesos", "bloqueos", "waf"],
  "/superadmin/compliance": ["datos personales", "arco", "privacidad"],
  "/superadmin/audit-log": ["auditoria", "historial", "quien hizo"],
  "/superadmin/settings": ["ajustes", "preferencias", "config"],
  "/superadmin/configuracion": ["flags", "banderas", "integraciones"],
};

function armar(): PantallaSuperadmin[] {
  const vistas = new Set<string>();
  const out: PantallaSuperadmin[] = [];
  const sumar = (p: Omit<PantallaSuperadmin, "keywords">) => {
    if (vistas.has(p.href)) return;
    vistas.add(p.href);
    out.push({ ...p, keywords: PALABRAS[p.href] ?? [] });
  };
  for (const s of SUELTAS.slice(0, 4)) sumar(s);
  for (const [grupo, tabs] of MODULOS) for (const t of tabs) sumar({ href: t.href, label: t.label, grupo, icon: t.icon });
  for (const s of SUELTAS.slice(4)) sumar(s);
  return out;
}

export const PANTALLAS_SUPERADMIN: PantallaSuperadmin[] = armar();

/**
 * Pantallas que coinciden con lo escrito, mejores primero: el nombre que
 * empieza igual, después el nombre que lo contiene, después módulo/palabras.
 * Cada palabra escrita tiene que aparecer («errores negocio» encuentra «Errores negocios»).
 */
export function buscarPantallas(consulta: string, lista: PantallaSuperadmin[] = PANTALLAS_SUPERADMIN): PantallaSuperadmin[] {
  const q = sinTildes(consulta.trim());
  if (!q) return lista;
  const palabras = q.split(/\s+/);
  const puntuadas: { p: PantallaSuperadmin; puntos: number; i: number }[] = [];
  lista.forEach((p, i) => {
    const nombre = sinTildes(p.label);
    const todo = [nombre, sinTildes(p.grupo), ...p.keywords.map(sinTildes)].join(" ");
    if (!palabras.every((w) => todo.includes(w))) return;
    const puntos = nombre.startsWith(q) ? 3 : nombre.includes(q) ? 2 : 1;
    puntuadas.push({ p, puntos, i });
  });
  return puntuadas.sort((a, b) => b.puntos - a.puntos || a.i - b.i).map((x) => x.p);
}
