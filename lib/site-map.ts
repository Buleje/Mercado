/**
 * Site Map — catalogo COMPLETO de rutas del proyecto (101 paginas).
 *
 * Fuente de verdad unica para el superadmin Control Center y documentacion
 * interna. Se actualiza manualmente al agregar rutas nuevas.
 *
 * Convencion:
 *   - `path` — URL sin query params, con `[param]` literal para dinamicas
 *   - `label` — nombre humano
 *   - `description` — proposito en 1 frase
 *   - `status` — "live" | "wip" | "legacy" (a migrar)
 *   - `audience` — para quién es la pagina
 *   - `auth` — "public" | "customer" | "admin" | "superadmin" | "supplier" | "driver"
 */

export interface SiteRoute {
  path: string;
  label: string;
  description: string;
  status: "live" | "wip" | "legacy";
  audience: string;
  auth: "public" | "customer" | "admin" | "superadmin" | "supplier" | "driver";
}

export interface SiteCategory {
  id: string;
  label: string;
  description: string;
  audience: string;
  routes: SiteRoute[];
}

export const SITE_MAP: SiteCategory[] = [
  {
    id: "store-customer",
    label: "Tienda (cliente final)",
    description: "Paginas que ve un cliente comprando",
    audience: "Compradores/vecinos",
    routes: [
      { path: "/", label: "Landing home", description: "Home de la tienda del negocio", status: "live", audience: "cliente", auth: "public" },
      { path: "/tienda", label: "Catalogo tienda", description: "Productos de la bodega individual", status: "live", audience: "cliente", auth: "public" },
      { path: "/tienda/[slug]", label: "Producto detalle", description: "Ficha de un producto", status: "live", audience: "cliente", auth: "public" },
      { path: "/tienda/categoria/[categoryId]", label: "Categoria", description: "Productos por categoria", status: "live", audience: "cliente", auth: "public" },
      { path: "/recetas", label: "Recetario tienda", description: "Recetas del bodegon", status: "live", audience: "cliente", auth: "public" },
      { path: "/recetas/[id]", label: "Receta detalle", description: "Paso a paso de cocina", status: "live", audience: "cliente", auth: "public" },
      { path: "/buscar", label: "Busqueda global", description: "Busqueda productos/recetas", status: "live", audience: "cliente", auth: "public" },
      { path: "/cuenta", label: "Mi cuenta", description: "Perfil + pedidos + puntos + favoritos (unificada)", status: "live", audience: "cliente", auth: "customer" },
      { path: "/mis-pedidos", label: "Mis pedidos", description: "Historial + tracking activo", status: "live", audience: "cliente", auth: "customer" },
      { path: "/mi-credito", label: "Mi credito/fiado", description: "Portal transparencia fiado digital", status: "live", audience: "cliente", auth: "customer" },
      { path: "/puntos", label: "Mis puntos", description: "Programa fidelidad Bronce/Plata/Oro", status: "live", audience: "cliente", auth: "customer" },
      { path: "/favoritos", label: "Favoritos", description: "Productos guardados", status: "live", audience: "cliente", auth: "customer" },
      { path: "/tracking", label: "Tracking publico", description: "Rastreo pedido por link", status: "live", audience: "cliente", auth: "public" },
      { path: "/delivery", label: "Delivery login", description: "Portal repartidor", status: "live", audience: "driver", auth: "driver" },
      { path: "/about", label: "Acerca de", description: "Historia de la bodega", status: "live", audience: "cliente", auth: "public" },
      { path: "/ayuda", label: "Centro de ayuda", description: "FAQs + WhatsApp soporte", status: "live", audience: "cliente", auth: "public" },
      { path: "/privacidad", label: "Privacidad", description: "Politica de privacidad", status: "live", audience: "legal", auth: "public" },
      { path: "/terminos", label: "Terminos y condiciones", description: "T&C del servicio", status: "live", audience: "legal", auth: "public" },
      { path: "/planes", label: "Planes precios", description: "Pricing page SaaS", status: "live", audience: "leads", auth: "public" },
      { path: "/negocios", label: "Para negocios", description: "Landing B2B para dueños bodega", status: "live", audience: "leads", auth: "public" },
    ],
  },
  {
    id: "zona-seo",
    label: "SEO hiperlocal (zonas)",
    description: "Paginas generadas por distrito/categoria Pucallpa",
    audience: "Google + clientes locales",
    routes: [
      { path: "/zona/[ciudad]", label: "Zona ciudad", description: "Cobertura por ciudad", status: "live", audience: "SEO", auth: "public" },
      { path: "/zona/[ciudad]/[categoria]", label: "Zona + categoria", description: "Productos de una categoria en una ciudad", status: "live", audience: "SEO", auth: "public" },
      { path: "/zona/[ciudad]/distrito/[distrito]", label: "Distrito", description: "Cobertura hiperlocal ADR-060", status: "live", audience: "SEO", auth: "public" },
      { path: "/zona/[ciudad]/distrito/[distrito]/[categoria]", label: "Distrito + categoria", description: "Long tail SEO", status: "live", audience: "SEO", auth: "public" },
      { path: "/zona/[ciudad]/producto/[slug]", label: "Producto por zona", description: "SEO individual producto", status: "live", audience: "SEO", auth: "public" },
    ],
  },
  {
    id: "marketplace",
    label: "Marketplace (multi-tienda)",
    description: "Plataforma publica con todas las bodegas",
    audience: "Compradores + vendors",
    routes: [
      { path: "/marketplace", label: "Marketplace home", description: "Catalogo cross-store", status: "live", audience: "cliente", auth: "public" },
      { path: "/marketplace/[slug]", label: "Tienda en marketplace", description: "Vitrina de una tienda", status: "live", audience: "cliente", auth: "public" },
      { path: "/marketplace/[slug]/producto/[productId]", label: "Producto marketplace", description: "Ficha producto", status: "live", audience: "cliente", auth: "public" },
      { path: "/marketplace/recetas", label: "Recetas marketplace", description: "Recetario global", status: "live", audience: "cliente", auth: "public" },
      { path: "/marketplace/negocios", label: "Negocios marketplace", description: "Vitrina bodegas", status: "live", audience: "cliente", auth: "public" },
      { path: "/marketplace/favoritos", label: "Favoritos marketplace", description: "Wishlist cross-store", status: "live", audience: "cliente", auth: "customer" },
      { path: "/marketplace/apply", label: "Apply wizard", description: "Wizard onboarding bodega", status: "live", audience: "vendors", auth: "public" },
      { path: "/marketplace/registrar", label: "Registrar tienda", description: "Signup vendor", status: "live", audience: "vendors", auth: "public" },
      { path: "/marketplace/payment-result", label: "Resultado pago", description: "Callback pasarela pago", status: "live", audience: "cliente", auth: "customer" },
      { path: "/marketplace/calificar-entrega", label: "Calificar entrega", description: "Rating post-delivery", status: "live", audience: "cliente", auth: "customer" },
      { path: "/marketplace/mi-cuenta", label: "Mi cuenta marketplace", description: "Dashboard cliente multi-tienda", status: "live", audience: "cliente", auth: "customer" },
      { path: "/marketplace/mi-cuenta/pedidos", label: "Pedidos marketplace", description: "Historial cross-store", status: "live", audience: "cliente", auth: "customer" },
      { path: "/marketplace/mi-cuenta/direcciones", label: "Direcciones", description: "Libro de direcciones", status: "live", audience: "cliente", auth: "customer" },
      { path: "/marketplace/mi-cuenta/cupones", label: "Cupones", description: "Cupones canjeables", status: "live", audience: "cliente", auth: "customer" },
      { path: "/marketplace/mi-cuenta/favoritos", label: "Favoritos", description: "Wishlist detail", status: "live", audience: "cliente", auth: "customer" },
      { path: "/marketplace/repartidor", label: "Portal repartidor", description: "Dashboard repartidor", status: "live", audience: "driver", auth: "driver" },
      { path: "/marketplace/repartidor/bienvenida", label: "Welcome repartidor", description: "Onboarding driver", status: "live", audience: "driver", auth: "driver" },
      { path: "/marketplace/repartidor/ganancias", label: "Ganancias repartidor", description: "Earnings + payouts", status: "live", audience: "driver", auth: "driver" },
    ],
  },
  {
    id: "admin",
    label: "Admin (dueño de bodega)",
    description: "Panel del dueño — consolidado en 5 hubs JTBD",
    audience: "Dueño negocio",
    routes: [
      { path: "/admin", label: "Admin home", description: "Hub unificado Resumen con TodayHub", status: "live", audience: "dueño", auth: "admin" },
      { path: "/admin/login", label: "Admin login", description: "Auth admin", status: "live", audience: "dueño", auth: "public" },
      { path: "/admin/kiosk", label: "Kiosk mode", description: "Modo dedicado para tablet del negocio", status: "live", audience: "cajero", auth: "admin" },
      { path: "/admin/pos-mobile", label: "POS Mobile", description: "Punto de venta en celular", status: "live", audience: "cajero", auth: "admin" },
      { path: "/admin/store-page", label: "Personalizar tienda", description: "Editor storefront", status: "live", audience: "dueño", auth: "admin" },
      { path: "/admin/cms", label: "CMS pages", description: "Editor de paginas custom", status: "live", audience: "dueño", auth: "admin" },
      { path: "/admin/cms/pages/[id]", label: "Editor pagina CMS", description: "Detail editor", status: "live", audience: "dueño", auth: "admin" },
      { path: "/admin/webhook-queue", label: "Webhook queue", description: "Cola de webhooks SUNAT", status: "live", audience: "ops", auth: "admin" },
      { path: "/admin/cron-dead-letters", label: "Cron dead letters", description: "Jobs fallidos", status: "live", audience: "ops", auth: "admin" },
    ],
  },
  {
    id: "superadmin",
    label: "Superadmin (plataforma)",
    description: "Panel de la plataforma Buleje",
    audience: "Platform admin (Brandon)",
    routes: [
      { path: "/superadmin", label: "Superadmin home", description: "Entry point", status: "live", audience: "platform", auth: "superadmin" },
      { path: "/superadmin/login", label: "Superadmin login", description: "Auth plataforma", status: "live", audience: "platform", auth: "public" },
      { path: "/superadmin/dashboard", label: "Dashboard global", description: "KPIs plataforma", status: "live", audience: "platform", auth: "superadmin" },
      { path: "/superadmin/control-center", label: "Control Center", description: "Hub operaciones + site map", status: "live", audience: "platform", auth: "superadmin" },
      { path: "/superadmin/tenants", label: "Tenants", description: "Gestion de tiendas activas", status: "live", audience: "platform", auth: "superadmin" },
      { path: "/superadmin/stores", label: "Stores", description: "Listado tiendas cross-plataforma", status: "live", audience: "platform", auth: "superadmin" },
      { path: "/superadmin/analytics", label: "Analytics global", description: "Metricas agregadas", status: "live", audience: "platform", auth: "superadmin" },
      { path: "/superadmin/activity", label: "Activity log", description: "Auditoria cross-tenant", status: "live", audience: "platform", auth: "superadmin" },
      { path: "/superadmin/health", label: "Health", description: "Health de sistema", status: "live", audience: "platform", auth: "superadmin" },
      { path: "/superadmin/security", label: "Security", description: "Auditoria seguridad", status: "live", audience: "platform", auth: "superadmin" },
      { path: "/superadmin/settings", label: "Settings", description: "Configuracion plataforma", status: "live", audience: "platform", auth: "superadmin" },
      { path: "/superadmin/setup", label: "Setup wizard", description: "Configuracion inicial", status: "live", audience: "platform", auth: "superadmin" },
      { path: "/superadmin/integraciones", label: "Integraciones", description: "APIs terceros", status: "live", audience: "platform", auth: "superadmin" },
      { path: "/superadmin/marketplace/suppliers", label: "Suppliers", description: "Proveedores del marketplace", status: "live", audience: "platform", auth: "superadmin" },
      { path: "/superadmin/recetario", label: "Recetario admin", description: "Gestion recetas marketplace", status: "live", audience: "platform", auth: "superadmin" },
      { path: "/superadmin/roadmap", label: "Roadmap", description: "Iniciativas en progreso", status: "live", audience: "platform", auth: "superadmin" },
      { path: "/superadmin/project-intel", label: "Project Intel", description: "Auditoria tecnica del codigo", status: "live", audience: "platform", auth: "superadmin" },
    ],
  },
  {
    id: "supplier",
    label: "Supplier (proveedores)",
    description: "Portal para proveedores B2B",
    audience: "Distribuidores/mayoristas",
    routes: [
      { path: "/supplier", label: "Supplier home", description: "Entry point proveedor", status: "live", audience: "supplier", auth: "supplier" },
      { path: "/supplier/dashboard", label: "Supplier dashboard", description: "KPIs del proveedor", status: "live", audience: "supplier", auth: "supplier" },
      { path: "/supplier/catalogo", label: "Catalogo supplier", description: "Mi catalogo B2B", status: "live", audience: "supplier", auth: "supplier" },
      { path: "/supplier/registrar", label: "Registrar supplier", description: "Signup proveedor", status: "live", audience: "supplier", auth: "public" },
    ],
  },
  {
    id: "delivery",
    label: "Delivery (repartidores)",
    description: "App para repartidores",
    audience: "Repartidores",
    routes: [
      { path: "/delivery-app", label: "Delivery app", description: "Home repartidor", status: "live", audience: "driver", auth: "driver" },
      { path: "/delivery-app/pedido/[id]", label: "Detalle pedido driver", description: "Pickup + entrega", status: "live", audience: "driver", auth: "driver" },
      { path: "/delivery/[partnerId]", label: "Delivery partner", description: "Portal partner delivery", status: "live", audience: "driver", auth: "driver" },
      { path: "/tracking/[orderId]", label: "Tracking pedido", description: "Tracking publico por link", status: "live", audience: "cliente", auth: "public" },
    ],
  },
  {
    id: "tenant-subdomain",
    label: "Tenant multi-tenant (t/[slug])",
    description: "Subdominio por tienda",
    audience: "Cliente de una tienda especifica",
    routes: [
      { path: "/t/[slug]", label: "Tenant home", description: "Home por subdomain", status: "live", audience: "cliente", auth: "public" },
      { path: "/t/[slug]/tienda", label: "Tienda por tenant", description: "Catalogo con subdomain", status: "live", audience: "cliente", auth: "public" },
      { path: "/t/[slug]/admin", label: "Admin por tenant", description: "Admin con subdomain", status: "live", audience: "dueño", auth: "admin" },
    ],
  },
  {
    id: "onboarding-marketing",
    label: "Onboarding + Marketing",
    description: "Funnels de conversion",
    audience: "Leads + nuevos usuarios",
    routes: [
      { path: "/onboarding", label: "Onboarding wizard", description: "Setup inicial usuario", status: "live", audience: "nuevos", auth: "public" },
      { path: "/saas", label: "SaaS landing", description: "Landing SaaS products", status: "live", audience: "leads", auth: "public" },
      { path: "/pricing", label: "Pricing", description: "Plan pricing", status: "live", audience: "leads", auth: "public" },
      { path: "/plataforma", label: "Plataforma", description: "Feature showcase", status: "live", audience: "leads", auth: "public" },
      { path: "/registro", label: "Registro", description: "Signup general", status: "live", audience: "nuevos", auth: "public" },
      { path: "/setup", label: "Setup wizard", description: "Post-signup setup", status: "live", audience: "nuevos", auth: "public" },
      { path: "/signup", label: "Signup", description: "Alta usuario", status: "live", audience: "nuevos", auth: "public" },
      { path: "/invite", label: "Invite", description: "Aceptar invitacion referral", status: "live", audience: "nuevos", auth: "public" },
      { path: "/panel", label: "Panel generico", description: "Panel multi-role", status: "wip", audience: "usuarios", auth: "customer" },
    ],
  },
  {
    id: "post-purchase",
    label: "Post-compra (pedidos)",
    description: "Flow despues del checkout",
    audience: "Cliente post-compra",
    routes: [
      { path: "/pedido/[id]", label: "Pedido detalle", description: "Detail de orden", status: "live", audience: "cliente", auth: "customer" },
      { path: "/pedido/[id]/gracias", label: "Gracias post-compra", description: "Thank you page", status: "live", audience: "cliente", auth: "customer" },
      { path: "/pedido/[id]/recibo", label: "Recibo pedido", description: "Recibo imprimible", status: "live", audience: "cliente", auth: "customer" },
      { path: "/venta/[id]/recibo", label: "Recibo venta", description: "Recibo admin", status: "live", audience: "admin", auth: "admin" },
    ],
  },
  {
    id: "cms-docs",
    label: "CMS + Documentacion",
    description: "Contenido publico dinamico",
    audience: "Publico + leads",
    routes: [
      { path: "/cms/[slug]", label: "CMS page", description: "Pagina custom CMS (publica)", status: "live", audience: "publico", auth: "public" },
      { path: "/api-docs", label: "API docs", description: "Documentacion API publica", status: "live", audience: "developers", auth: "public" },
    ],
  },
  {
    id: "design-system",
    label: "Design System (demos)",
    description: "Referencia viva del sistema de diseño v4",
    audience: "Devs/designers internos",
    routes: [
      { path: "/design-system", label: "Hub design system", description: "Tokens + iconos + 12 charts", status: "live", audience: "dev", auth: "public" },
      { path: "/design-system/admin", label: "Admin UX demo", description: "5 primitives UX admin", status: "live", audience: "dev", auth: "public" },
      { path: "/design-system/customer", label: "Customer journey demo", description: "5 primitives journey", status: "live", audience: "dev", auth: "public" },
      { path: "/design-system/a11y", label: "A11y + Perf demo", description: "4 a11y + 3 perf primitives", status: "live", audience: "dev", auth: "public" },
      { path: "/design-system/illustrations", label: "20 ilustraciones", description: "Illustration system v2", status: "live", audience: "dev", auth: "public" },
    ],
  },
  {
    id: "special",
    label: "Especiales (errores, offline)",
    description: "Paginas de sistema",
    audience: "Cualquiera",
    routes: [
      { path: "/not-found", label: "404 Not found", description: "Pagina no encontrada (con ilustracion BrujulaPerdida)", status: "live", audience: "cualquiera", auth: "public" },
      { path: "/offline", label: "Offline", description: "Sin conexion (PWA)", status: "live", audience: "cualquiera", auth: "public" },
    ],
  },
];

/** Total de rutas en el proyecto */
export const TOTAL_ROUTES = SITE_MAP.reduce((sum, cat) => sum + cat.routes.length, 0);

/** Helpers para contadores por categoria */
export function getRoutesByAuth(auth: SiteRoute["auth"]) {
  return SITE_MAP.flatMap((cat) => cat.routes).filter((r) => r.auth === auth);
}

export function getRoutesByStatus(status: SiteRoute["status"]) {
  return SITE_MAP.flatMap((cat) => cat.routes).filter((r) => r.status === status);
}
