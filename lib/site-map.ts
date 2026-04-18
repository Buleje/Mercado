/**
 * Site Map — catalogo COMPLETO de rutas del proyecto (todas las paginas).
 *
 * Fuente de verdad unica para:
 *   - /superadmin/sitemap (directorio visual navegable)
 *   - /superadmin/control-center (link cards)
 *   - Documentacion interna + onboarding de devs
 *
 * Se actualiza manualmente al agregar rutas nuevas.
 *
 * Convencion:
 *   - `path` — URL sin query params, con `[param]` literal para dinamicas
 *   - `label` — nombre humano
 *   - `description` — proposito en 1 frase
 *   - `status` — "live" | "wip" | "legacy" | "beta" | "mock"
 *   - `audience` — para quién es la pagina
 *   - `auth` — "public" | "customer" | "admin" | "superadmin" | "supplier" | "driver"
 *   - `category` — grupo funcional (SiteCategoryId)
 *   - `tags` — palabras clave para search (opcional)
 */

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

/** Agrupacion principal de rutas en el sitemap visual. */
export type SiteCategoryId =
  | "superadmin"
  | "admin"
  | "store-public"
  | "marketplace"
  | "customer-account"
  | "landings"
  | "auth"
  | "tenant-subdomain"
  | "supplier"
  | "delivery"
  | "post-purchase"
  | "seo-zonas"
  | "cms-docs"
  | "design-system"
  | "dev-tools"
  | "errors";

export interface SiteRoute {
  /** URL pattern. `[param]` se reemplaza con `_` al abrir. */
  path: string;
  /** Nombre humano mostrado en el directorio. */
  label: string;
  /** Para qué sirve la ruta en 1 frase. */
  description: string;
  status: "live" | "wip" | "legacy" | "beta" | "mock";
  audience: string;
  auth: "public" | "customer" | "admin" | "superadmin" | "supplier" | "driver";
  /** Categoria funcional para agrupacion visual. */
  category: SiteCategoryId;
  /** Icono del DS (lucide name) — opcional. */
  icon?: string;
  /** Palabras clave extras para search (stock, fiado, punto-de-venta, ...). */
  tags?: string[];
}

/** Metadatos de una categoria — visible en el sitemap. */
export interface SiteCategory {
  id: SiteCategoryId;
  label: string;
  description: string;
  audience: string;
  icon: string;
}

// ────────────────────────────────────────────────────────────────────────────
// Categorías
// ────────────────────────────────────────────────────────────────────────────

export const SITE_CATEGORIES: SiteCategory[] = [
  {
    id: "superadmin",
    label: "SuperAdmin",
    description: "Panel de la plataforma Buleje",
    audience: "Platform admin (Brandon)",
    icon: "Gauge",
  },
  {
    id: "admin",
    label: "Admin Panel",
    description: "ERP para el dueño de la bodega",
    audience: "Dueño / cajero / almacenero",
    icon: "Store",
  },
  {
    id: "store-public",
    label: "Tienda pública",
    description: "Storefront del negocio individual",
    audience: "Compradores locales",
    icon: "ShoppingBag",
  },
  {
    id: "marketplace",
    label: "Marketplace",
    description: "Plataforma multi-vendor cross-tienda",
    audience: "Compradores + vendors",
    icon: "ShoppingCart",
  },
  {
    id: "customer-account",
    label: "Mi cuenta",
    description: "Portal del cliente comprador",
    audience: "Customers autenticados",
    icon: "User",
  },
  {
    id: "landings",
    label: "Landings",
    description: "Páginas de conversión y marketing",
    audience: "Leads y visitantes",
    icon: "Sparkles",
  },
  {
    id: "auth",
    label: "Autenticación",
    description: "Login, registro, setup inicial",
    audience: "Todos",
    icon: "Lock",
  },
  {
    id: "tenant-subdomain",
    label: "Multi-tenant",
    description: "Rutas por subdominio de tienda",
    audience: "Una tienda específica",
    icon: "Globe",
  },
  {
    id: "supplier",
    label: "Proveedores",
    description: "Portal B2B para mayoristas",
    audience: "Distribuidores",
    icon: "Truck",
  },
  {
    id: "delivery",
    label: "Delivery",
    description: "App de repartidores",
    audience: "Drivers",
    icon: "MapPin",
  },
  {
    id: "post-purchase",
    label: "Post-compra",
    description: "Recibos, tracking, gracias",
    audience: "Cliente post-checkout",
    icon: "CheckCircle2",
  },
  {
    id: "seo-zonas",
    label: "SEO zonas",
    description: "Páginas SEO hiperlocal por distrito",
    audience: "Google + long-tail",
    icon: "Map",
  },
  {
    id: "cms-docs",
    label: "CMS + Docs",
    description: "Contenido público dinámico",
    audience: "Público + developers",
    icon: "FileText",
  },
  {
    id: "design-system",
    label: "Design System",
    description: "Referencia viva — primitives, tokens, ilustraciones",
    audience: "Devs / designers",
    icon: "Palette",
  },
  {
    id: "dev-tools",
    label: "Dev tools",
    description: "Herramientas internas del equipo",
    audience: "Equipo Buleje",
    icon: "Wrench",
  },
  {
    id: "errors",
    label: "Errores / sistema",
    description: "Páginas de fallback",
    audience: "Cualquiera",
    icon: "AlertTriangle",
  },
];

// ────────────────────────────────────────────────────────────────────────────
// Rutas
// ────────────────────────────────────────────────────────────────────────────

export const SITE_ROUTES: SiteRoute[] = [
  // ── SuperAdmin (plataforma) ─────────────────────────────────────────────
  { path: "/superadmin", label: "SuperAdmin home", description: "Entry point de la plataforma", status: "live", audience: "platform", auth: "superadmin", category: "superadmin", icon: "Gauge", tags: ["platform", "home"] },
  { path: "/superadmin/dashboard", label: "Dashboard global", description: "KPIs agregados de toda la plataforma", status: "live", audience: "platform", auth: "superadmin", category: "superadmin", icon: "LayoutDashboard", tags: ["kpi", "metrics", "analytics"] },
  { path: "/superadmin/control-center", label: "Centro de control", description: "Accesos rápidos + credenciales + salud", status: "live", audience: "platform", auth: "superadmin", category: "superadmin", icon: "Gauge", tags: ["hub", "quick-access"] },
  { path: "/superadmin/sitemap", label: "Sitemap", description: "Directorio visual de todas las rutas del proyecto", status: "live", audience: "platform", auth: "superadmin", category: "superadmin", icon: "Map", tags: ["directorio", "paginas", "rutas", "enlaces", "navegacion"] },
  { path: "/superadmin/tenants", label: "Tiendas (tenants)", description: "Gestión de todas las bodegas activas", status: "live", audience: "platform", auth: "superadmin", category: "superadmin", icon: "Building2", tags: ["tenants", "tiendas", "bodegas"] },
  { path: "/superadmin/stores", label: "Stores marketplace", description: "Listado de tiendas publicadas en marketplace", status: "live", audience: "platform", auth: "superadmin", category: "superadmin", icon: "ShoppingBag", tags: ["marketplace", "tiendas"] },
  { path: "/superadmin/marketplace/suppliers", label: "Suppliers", description: "Proveedores y marcas del marketplace", status: "live", audience: "platform", auth: "superadmin", category: "superadmin", icon: "Truck", tags: ["suppliers", "proveedores"] },
  { path: "/superadmin/analytics", label: "Analytics global", description: "Métricas cross-tenant y revenue", status: "live", audience: "platform", auth: "superadmin", category: "superadmin", icon: "BarChart3", tags: ["analytics", "revenue", "metrics"] },
  { path: "/superadmin/activity", label: "Activity log", description: "Auditoría cross-tenant de acciones", status: "live", audience: "platform", auth: "superadmin", category: "superadmin", icon: "Activity", tags: ["audit", "log", "actividad"] },
  { path: "/superadmin/health", label: "Salud del sistema", description: "Estado de servicios, BD y crons", status: "live", audience: "platform", auth: "superadmin", category: "superadmin", icon: "HeartPulse", tags: ["health", "slo", "uptime"] },
  { path: "/superadmin/security", label: "Seguridad", description: "Auditoría de seguridad y permisos", status: "live", audience: "platform", auth: "superadmin", category: "superadmin", icon: "ShieldCheck", tags: ["security", "permisos", "audit"] },
  { path: "/superadmin/settings", label: "Configuración", description: "Settings de plataforma", status: "live", audience: "platform", auth: "superadmin", category: "superadmin", icon: "Settings", tags: ["config", "settings"] },
  { path: "/superadmin/setup", label: "Setup pendiente", description: "Items de configuración inicial", status: "live", audience: "platform", auth: "superadmin", category: "superadmin", icon: "Wrench", tags: ["setup", "onboarding"] },
  { path: "/superadmin/vendor-applications", label: "Aplicaciones vendors", description: "Solicitudes de bodegas nuevas", status: "live", audience: "platform", auth: "superadmin", category: "superadmin", icon: "FileCheck", tags: ["applications", "vendors"] },
  { path: "/superadmin/recetario", label: "Recetario admin", description: "Gestión global del recetario marketplace", status: "live", audience: "platform", auth: "superadmin", category: "superadmin", icon: "ChefHat", tags: ["recipes", "recetas"] },
  { path: "/superadmin/roadmap", label: "Roadmap", description: "84+ iniciativas con progreso", status: "live", audience: "platform", auth: "superadmin", category: "superadmin", icon: "Map", tags: ["roadmap", "iniciativas"] },
  { path: "/superadmin/login", label: "SuperAdmin login", description: "Auth de la plataforma", status: "live", audience: "platform", auth: "public", category: "auth", icon: "LogIn", tags: ["login", "auth"] },

  // ── Admin panel (tenant) ────────────────────────────────────────────────
  { path: "/admin", label: "Admin home", description: "Hub unificado del dueño con KPIs y tabs", status: "live", audience: "dueño", auth: "admin", category: "admin", icon: "LayoutDashboard", tags: ["dashboard", "erp", "hub"] },
  { path: "/admin?tab=inventario", label: "Admin · Inventario", description: "Stock, reorder, proveedores", status: "live", audience: "dueño", auth: "admin", category: "admin", icon: "Package", tags: ["inventory", "stock"] },
  { path: "/admin?tab=ventas", label: "Admin · Ventas", description: "Pedidos, POS, reportes", status: "live", audience: "dueño", auth: "admin", category: "admin", icon: "ShoppingCart", tags: ["sales", "pos"] },
  { path: "/admin?tab=clientes", label: "Admin · Clientes", description: "CRM, fiado, puntos", status: "live", audience: "dueño", auth: "admin", category: "admin", icon: "Users", tags: ["customers", "crm"] },
  { path: "/admin?tab=marketing", label: "Admin · Marketing", description: "Cupones, campañas, WhatsApp", status: "live", audience: "dueño", auth: "admin", category: "admin", icon: "Megaphone", tags: ["marketing", "cupones"] },
  { path: "/admin?tab=finanzas", label: "Admin · Finanzas", description: "Caja, SUNAT, reportes", status: "live", audience: "dueño", auth: "admin", category: "admin", icon: "Banknote", tags: ["finance", "sunat"] },
  { path: "/admin/kiosk", label: "Kiosk mode", description: "Modo dedicado para tablet del negocio", status: "live", audience: "cajero", auth: "admin", category: "admin", icon: "Monitor", tags: ["kiosk", "tablet"] },
  { path: "/admin/pos-mobile", label: "POS móvil", description: "Punto de venta táctil en celular", status: "live", audience: "cajero", auth: "admin", category: "admin", icon: "CreditCard", tags: ["pos", "ventas"] },
  { path: "/admin/store-page", label: "Mi tienda personal", description: "Editor del storefront público", status: "live", audience: "dueño", auth: "admin", category: "admin", icon: "Store", tags: ["storefront", "branding"] },
  { path: "/admin/cms", label: "CMS pages", description: "Editor de páginas custom del sitio", status: "live", audience: "dueño", auth: "admin", category: "admin", icon: "FileText", tags: ["cms", "contenido"] },
  { path: "/admin/cms/pages/[id]", label: "Editor página CMS", description: "Editor WYSIWYG de una página", status: "live", audience: "dueño", auth: "admin", category: "admin", icon: "FileText", tags: ["cms", "editor"] },
  { path: "/admin/webhook-queue", label: "Webhook queue", description: "Cola de webhooks SUNAT pendientes", status: "live", audience: "ops", auth: "admin", category: "admin", icon: "Cable", tags: ["webhooks", "sunat"] },
  { path: "/admin/cron-dead-letters", label: "Cron dead letters", description: "Jobs en background que fallaron", status: "live", audience: "ops", auth: "admin", category: "admin", icon: "AlertTriangle", tags: ["cron", "jobs"] },
  { path: "/admin/login", label: "Admin login", description: "Auth del ERP", status: "live", audience: "dueño", auth: "public", category: "auth", icon: "LogIn", tags: ["login", "auth"] },

  // ── Tienda pública ──────────────────────────────────────────────────────
  { path: "/", label: "Home tienda", description: "Landing principal del negocio", status: "live", audience: "cliente", auth: "public", category: "store-public", icon: "Home", tags: ["home", "landing"] },
  { path: "/tienda", label: "Catálogo tienda", description: "Productos de la bodega individual", status: "live", audience: "cliente", auth: "public", category: "store-public", icon: "Package", tags: ["catalog", "productos"] },
  { path: "/tienda/[slug]", label: "Producto detalle", description: "Ficha individual de un producto", status: "live", audience: "cliente", auth: "public", category: "store-public", icon: "Tag", tags: ["product", "pdp"] },
  { path: "/tienda/categoria/[categoryId]", label: "Categoría tienda", description: "Productos agrupados por categoría", status: "live", audience: "cliente", auth: "public", category: "store-public", icon: "Tags", tags: ["category", "pcp"] },
  { path: "/buscar", label: "Búsqueda global", description: "Search de productos y recetas", status: "live", audience: "cliente", auth: "public", category: "store-public", icon: "Search", tags: ["search"] },
  { path: "/favoritos", label: "Favoritos", description: "Wishlist del comprador", status: "live", audience: "cliente", auth: "customer", category: "store-public", icon: "Heart", tags: ["wishlist", "favoritos"] },
  { path: "/recetas", label: "Recetario tienda", description: "Recetas publicadas por el bodegón", status: "live", audience: "cliente", auth: "public", category: "store-public", icon: "ChefHat", tags: ["recetas"] },
  { path: "/recetas/[id]", label: "Receta detalle", description: "Paso a paso de cocina", status: "live", audience: "cliente", auth: "public", category: "store-public", icon: "ChefHat", tags: ["recetas"] },
  { path: "/about", label: "Acerca de", description: "Historia de la bodega", status: "live", audience: "cliente", auth: "public", category: "store-public", icon: "Info", tags: ["about"] },
  { path: "/ayuda", label: "Centro de ayuda", description: "FAQs + WhatsApp soporte", status: "live", audience: "cliente", auth: "public", category: "store-public", icon: "HelpCircle", tags: ["ayuda", "faq", "soporte"] },
  { path: "/privacidad", label: "Privacidad", description: "Política de privacidad", status: "live", audience: "legal", auth: "public", category: "store-public", icon: "Shield", tags: ["legal"] },
  { path: "/terminos", label: "Términos y condiciones", description: "T&C del servicio", status: "live", audience: "legal", auth: "public", category: "store-public", icon: "FileText", tags: ["legal"] },

  // ── Marketplace (multi-vendor) ──────────────────────────────────────────
  { path: "/marketplace", label: "Marketplace home", description: "Catálogo cross-store", status: "live", audience: "cliente", auth: "public", category: "marketplace", icon: "ShoppingCart", tags: ["marketplace", "home"] },
  { path: "/marketplace/[slug]", label: "Tienda en marketplace", description: "Vitrina de una tienda específica", status: "live", audience: "cliente", auth: "public", category: "marketplace", icon: "Store", tags: ["vendor", "store"] },
  { path: "/marketplace/[slug]/producto/[productId]", label: "Producto marketplace", description: "Ficha de producto cross-vendor", status: "live", audience: "cliente", auth: "public", category: "marketplace", icon: "Tag", tags: ["product", "pdp"] },
  { path: "/marketplace/categoria/[slug]", label: "Categoría marketplace", description: "Productos por categoría global", status: "live", audience: "cliente", auth: "public", category: "marketplace", icon: "Tags", tags: ["category"] },
  { path: "/marketplace/buscar", label: "Búsqueda marketplace", description: "Search cross-vendor", status: "live", audience: "cliente", auth: "public", category: "marketplace", icon: "Search", tags: ["search"] },
  { path: "/marketplace/explorar", label: "Explorar", description: "Feed de descubrimiento por interés", status: "live", audience: "cliente", auth: "public", category: "marketplace", icon: "Compass", tags: ["explore", "feed"] },
  { path: "/marketplace/ofertas", label: "Ofertas", description: "Productos en descuento del día", status: "live", audience: "cliente", auth: "public", category: "marketplace", icon: "BadgePercent", tags: ["ofertas", "descuentos"] },
  { path: "/marketplace/comparar", label: "Comparador", description: "Comparar hasta 3 productos lado a lado", status: "live", audience: "cliente", auth: "public", category: "marketplace", icon: "Scale", tags: ["comparar", "comparador"] },
  { path: "/marketplace/en-vivo", label: "En vivo", description: "Streams de venta en directo", status: "beta", audience: "cliente", auth: "public", category: "marketplace", icon: "Video", tags: ["live", "streaming", "en-vivo"] },
  { path: "/marketplace/en-vivo/[liveId]", label: "Stream en vivo", description: "Detalle de un live con chat", status: "beta", audience: "cliente", auth: "public", category: "marketplace", icon: "Video", tags: ["live"] },
  { path: "/marketplace/gift-cards", label: "Gift cards", description: "Hub de tarjetas de regalo", status: "live", audience: "cliente", auth: "public", category: "marketplace", icon: "Gift", tags: ["gift", "regalo"] },
  { path: "/marketplace/gift-cards/comprar", label: "Comprar gift card", description: "Wizard de compra de gift card", status: "live", audience: "cliente", auth: "customer", category: "marketplace", icon: "Gift", tags: ["gift", "checkout"] },
  { path: "/marketplace/gift-cards/confirmacion", label: "Gift card comprada", description: "Confirmación post-compra", status: "live", audience: "cliente", auth: "customer", category: "marketplace", icon: "CheckCircle2", tags: ["gift", "confirmacion"] },
  { path: "/marketplace/recetas", label: "Recetas marketplace", description: "Recetario global cross-store", status: "live", audience: "cliente", auth: "public", category: "marketplace", icon: "ChefHat", tags: ["recetas"] },
  { path: "/marketplace/negocios", label: "Negocios marketplace", description: "Vitrina de bodegas registradas", status: "live", audience: "cliente", auth: "public", category: "marketplace", icon: "Building2", tags: ["negocios"] },
  { path: "/marketplace/favoritos", label: "Favoritos marketplace", description: "Wishlist cross-store", status: "live", audience: "cliente", auth: "customer", category: "marketplace", icon: "Heart", tags: ["wishlist"] },
  { path: "/marketplace/apply", label: "Apply wizard", description: "Wizard para aplicar como vendor", status: "live", audience: "vendors", auth: "public", category: "marketplace", icon: "FileCheck", tags: ["apply", "onboarding"] },
  { path: "/marketplace/registrar", label: "Registrar tienda", description: "Signup rápido de vendor", status: "live", audience: "vendors", auth: "public", category: "marketplace", icon: "UserPlus", tags: ["signup", "registrar"] },
  { path: "/marketplace/payment-result", label: "Resultado pago", description: "Callback de pasarela de pago", status: "live", audience: "cliente", auth: "customer", category: "marketplace", icon: "CreditCard", tags: ["payment"] },
  { path: "/marketplace/calificar-entrega", label: "Calificar entrega", description: "Rating post-delivery", status: "live", audience: "cliente", auth: "customer", category: "marketplace", icon: "Star", tags: ["rating", "delivery"] },
  { path: "/marketplace/repartidor", label: "Portal repartidor", description: "Dashboard del driver", status: "live", audience: "driver", auth: "driver", category: "delivery", icon: "Truck", tags: ["driver", "repartidor"] },
  { path: "/marketplace/repartidor/bienvenida", label: "Welcome repartidor", description: "Onboarding del driver", status: "live", audience: "driver", auth: "driver", category: "delivery", icon: "Truck", tags: ["onboarding"] },
  { path: "/marketplace/repartidor/ganancias", label: "Ganancias repartidor", description: "Earnings y payouts del driver", status: "live", audience: "driver", auth: "driver", category: "delivery", icon: "Banknote", tags: ["earnings"] },

  // ── Mi cuenta (customer) ────────────────────────────────────────────────
  { path: "/cuenta", label: "Mi cuenta", description: "Dashboard unificado del cliente", status: "live", audience: "cliente", auth: "customer", category: "customer-account", icon: "User", tags: ["cuenta", "perfil"] },
  { path: "/cuenta/pedidos", label: "Mis pedidos", description: "Historial + tracking activo", status: "live", audience: "cliente", auth: "customer", category: "customer-account", icon: "ShoppingBag", tags: ["pedidos", "orders"] },
  { path: "/cuenta/pedidos/[id]", label: "Pedido detalle", description: "Detalle de una orden", status: "live", audience: "cliente", auth: "customer", category: "customer-account", icon: "Receipt", tags: ["pedido", "orden"] },
  { path: "/cuenta/pedidos/[id]/seguimiento", label: "Seguimiento pedido", description: "Tracking en tiempo real del pedido", status: "live", audience: "cliente", auth: "customer", category: "customer-account", icon: "MapPin", tags: ["tracking", "seguimiento"] },
  { path: "/cuenta/pedidos/[id]/confirmacion", label: "Confirmación pedido", description: "Gracias post-checkout", status: "live", audience: "cliente", auth: "customer", category: "customer-account", icon: "CheckCircle2", tags: ["gracias", "confirmacion"] },
  { path: "/cuenta/suscripciones", label: "Suscripciones", description: "Planes recurrentes activos", status: "live", audience: "cliente", auth: "customer", category: "customer-account", icon: "Repeat", tags: ["suscripciones"] },
  { path: "/cuenta/gift-cards", label: "Mis gift cards", description: "Gift cards compradas y recibidas", status: "live", audience: "cliente", auth: "customer", category: "customer-account", icon: "Gift", tags: ["gift"] },
  { path: "/cuenta/cupones", label: "Mis cupones", description: "Cupones canjeables disponibles", status: "live", audience: "cliente", auth: "customer", category: "customer-account", icon: "Ticket", tags: ["cupones"] },
  { path: "/cuenta/socio-buleje", label: "Socio Buleje", description: "Programa de membresía premium", status: "live", audience: "cliente", auth: "customer", category: "customer-account", icon: "Crown", tags: ["socio", "membresia"] },
  { path: "/cuenta/direcciones", label: "Direcciones", description: "Libro de direcciones de envío", status: "live", audience: "cliente", auth: "customer", category: "customer-account", icon: "MapPin", tags: ["direcciones", "envio"] },
  { path: "/cuenta/pagos", label: "Métodos de pago", description: "Tarjetas y wallets guardadas", status: "live", audience: "cliente", auth: "customer", category: "customer-account", icon: "CreditCard", tags: ["pagos"] },
  { path: "/cuenta/preferencias", label: "Preferencias", description: "Configuración de cuenta y comunicaciones", status: "live", audience: "cliente", auth: "customer", category: "customer-account", icon: "Settings", tags: ["preferencias"] },
  { path: "/cuenta/notificaciones", label: "Notificaciones", description: "Centro de notificaciones del cliente", status: "live", audience: "cliente", auth: "customer", category: "customer-account", icon: "Bell", tags: ["notificaciones"] },
  // Rutas legacy alias (mantienen back-compat)
  { path: "/mis-pedidos", label: "Mis pedidos (legacy)", description: "Alias legacy → /cuenta/pedidos", status: "legacy", audience: "cliente", auth: "customer", category: "customer-account", icon: "ShoppingBag", tags: ["legacy", "pedidos"] },
  { path: "/mi-credito", label: "Mi fiado / crédito", description: "Portal transparencia fiado digital", status: "live", audience: "cliente", auth: "customer", category: "customer-account", icon: "Wallet", tags: ["fiado", "credito"] },
  { path: "/puntos", label: "Mis puntos", description: "Programa de fidelidad Bronce/Plata/Oro", status: "live", audience: "cliente", auth: "customer", category: "customer-account", icon: "Star", tags: ["puntos", "loyalty"] },

  // ── Landings (funnels de conversión) ────────────────────────────────────
  { path: "/descubri", label: "Descubrí", description: "Landing de descubrimiento para compradores", status: "live", audience: "leads", auth: "public", category: "landings", icon: "Compass", tags: ["descubri", "landing"] },
  { path: "/vender", label: "Vender en Buleje", description: "Landing para atraer vendors", status: "live", audience: "leads", auth: "public", category: "landings", icon: "TrendingUp", tags: ["vender", "vendor"] },
  { path: "/vender/registro", label: "Registro vendor", description: "Form de signup para nuevo vendor", status: "live", audience: "vendors", auth: "public", category: "landings", icon: "UserPlus", tags: ["vendor", "signup"] },
  { path: "/vender/registro/completo", label: "Registro completo", description: "Confirmación de alta vendor", status: "live", audience: "vendors", auth: "public", category: "landings", icon: "CheckCircle2", tags: ["vendor", "confirmacion"] },
  { path: "/vender/mi-tienda", label: "Mi tienda (vendor)", description: "Landing onboarding del vendor", status: "live", audience: "vendors", auth: "admin", category: "landings", icon: "Store", tags: ["vendor"] },
  { path: "/socio-buleje", label: "Socio Buleje", description: "Landing del programa de membresía", status: "live", audience: "leads", auth: "public", category: "landings", icon: "Crown", tags: ["socio", "membresia"] },
  { path: "/asistente", label: "Asistente Buleje", description: "Landing del asistente IA de compras", status: "live", audience: "leads", auth: "public", category: "landings", icon: "Sparkles", tags: ["asistente", "ai"] },
  { path: "/comprar-invitado", label: "Comprar como invitado", description: "Checkout express sin registro", status: "live", audience: "leads", auth: "public", category: "landings", icon: "UserCheck", tags: ["guest", "checkout"] },
  { path: "/guias", label: "Guías", description: "Índice de guías para bodegueros", status: "live", audience: "leads", auth: "public", category: "landings", icon: "BookOpen", tags: ["guias"] },
  { path: "/guias/[slug]", label: "Guía detalle", description: "Guía individual paso a paso", status: "live", audience: "leads", auth: "public", category: "landings", icon: "BookOpen", tags: ["guia"] },
  { path: "/negocios", label: "Para negocios", description: "Landing B2B para dueños de bodega", status: "live", audience: "leads", auth: "public", category: "landings", icon: "Building2", tags: ["b2b", "negocios"] },
  { path: "/planes", label: "Planes de pago", description: "Pricing del cliente comprador", status: "live", audience: "leads", auth: "public", category: "landings", icon: "CreditCard", tags: ["pricing"] },
  { path: "/pricing", label: "Pricing SaaS", description: "Planes y precios de la plataforma", status: "live", audience: "leads", auth: "public", category: "landings", icon: "DollarSign", tags: ["pricing", "saas"] },
  { path: "/plataforma", label: "Plataforma", description: "Feature showcase de Buleje SaaS", status: "live", audience: "leads", auth: "public", category: "landings", icon: "Layers", tags: ["features", "saas"] },
  { path: "/saas", label: "SaaS landing", description: "Landing page principal del SaaS", status: "live", audience: "leads", auth: "public", category: "landings", icon: "Sparkles", tags: ["saas"] },

  // ── Auth ────────────────────────────────────────────────────────────────
  { path: "/onboarding", label: "Onboarding wizard", description: "Setup inicial post-signup", status: "live", audience: "nuevos", auth: "public", category: "auth", icon: "UserPlus", tags: ["onboarding"] },
  { path: "/setup", label: "Setup wizard", description: "Configuración inicial de tienda", status: "live", audience: "nuevos", auth: "public", category: "auth", icon: "Wrench", tags: ["setup"] },
  { path: "/signup", label: "Signup", description: "Alta general de usuario", status: "live", audience: "nuevos", auth: "public", category: "auth", icon: "UserPlus", tags: ["signup"] },
  { path: "/registro", label: "Registro", description: "Signup alternativo (marketing)", status: "live", audience: "nuevos", auth: "public", category: "auth", icon: "UserPlus", tags: ["registro", "signup"] },
  { path: "/invite", label: "Invitación", description: "Aceptar invitación referral", status: "live", audience: "nuevos", auth: "public", category: "auth", icon: "Mail", tags: ["invite", "referral"] },
  { path: "/panel", label: "Panel genérico", description: "Panel multi-role (auto-detect)", status: "wip", audience: "usuarios", auth: "customer", category: "auth", icon: "LayoutDashboard", tags: ["panel"] },

  // ── Post-compra ─────────────────────────────────────────────────────────
  { path: "/pedido/[id]", label: "Pedido detalle público", description: "Detalle de orden accesible por link", status: "live", audience: "cliente", auth: "customer", category: "post-purchase", icon: "Receipt", tags: ["pedido"] },
  { path: "/pedido/[id]/gracias", label: "Gracias post-compra", description: "Thank-you page con ilustración", status: "live", audience: "cliente", auth: "customer", category: "post-purchase", icon: "PartyPopper", tags: ["gracias"] },
  { path: "/pedido/[id]/recibo", label: "Recibo pedido", description: "Recibo imprimible del pedido", status: "live", audience: "cliente", auth: "customer", category: "post-purchase", icon: "Receipt", tags: ["recibo"] },
  { path: "/venta/[id]/recibo", label: "Recibo venta (admin)", description: "Recibo imprimible del admin", status: "live", audience: "admin", auth: "admin", category: "post-purchase", icon: "Receipt", tags: ["recibo", "admin"] },
  { path: "/tracking", label: "Tracking público", description: "Rastreo de pedido por link", status: "live", audience: "cliente", auth: "public", category: "post-purchase", icon: "MapPin", tags: ["tracking"] },
  { path: "/tracking/[orderId]", label: "Tracking por orderId", description: "Tracking detallado con mapa", status: "live", audience: "cliente", auth: "public", category: "post-purchase", icon: "MapPin", tags: ["tracking"] },

  // ── SEO zonas ───────────────────────────────────────────────────────────
  { path: "/zona/[ciudad]", label: "Zona ciudad", description: "Cobertura de ventas por ciudad", status: "live", audience: "SEO", auth: "public", category: "seo-zonas", icon: "Map", tags: ["seo", "zona"] },
  { path: "/zona/[ciudad]/[categoria]", label: "Zona + categoría", description: "Productos de una categoría en una ciudad", status: "live", audience: "SEO", auth: "public", category: "seo-zonas", icon: "Map", tags: ["seo", "zona"] },
  { path: "/zona/[ciudad]/distrito/[distrito]", label: "Distrito", description: "Cobertura hiperlocal por distrito", status: "live", audience: "SEO", auth: "public", category: "seo-zonas", icon: "MapPin", tags: ["seo", "distrito"] },
  { path: "/zona/[ciudad]/distrito/[distrito]/[categoria]", label: "Distrito + categoría", description: "Long-tail SEO categoría por distrito", status: "live", audience: "SEO", auth: "public", category: "seo-zonas", icon: "MapPin", tags: ["seo"] },
  { path: "/zona/[ciudad]/producto/[slug]", label: "Producto por zona", description: "Página SEO individual por ciudad", status: "live", audience: "SEO", auth: "public", category: "seo-zonas", icon: "Tag", tags: ["seo"] },

  // ── Multi-tenant (tenant subdomain) ─────────────────────────────────────
  { path: "/t/[slug]", label: "Tenant home", description: "Home de una tienda por subdominio", status: "live", audience: "cliente", auth: "public", category: "tenant-subdomain", icon: "Globe", tags: ["tenant", "subdomain"] },
  { path: "/t/[slug]/tienda", label: "Tienda por tenant", description: "Catálogo de una tienda vía subdominio", status: "live", audience: "cliente", auth: "public", category: "tenant-subdomain", icon: "Store", tags: ["tenant"] },
  { path: "/t/[slug]/admin", label: "Admin por tenant", description: "Admin con subdominio explícito", status: "live", audience: "dueño", auth: "admin", category: "tenant-subdomain", icon: "LayoutDashboard", tags: ["tenant", "admin"] },
  { path: "/t/[slug]/seguimiento", label: "Seguimiento por tenant", description: "Tracking sobre subdominio de tienda", status: "live", audience: "cliente", auth: "public", category: "tenant-subdomain", icon: "MapPin", tags: ["tenant", "tracking"] },

  // ── Supplier ────────────────────────────────────────────────────────────
  { path: "/supplier", label: "Supplier home", description: "Entry point del proveedor", status: "live", audience: "supplier", auth: "supplier", category: "supplier", icon: "Truck", tags: ["supplier"] },
  { path: "/supplier/dashboard", label: "Dashboard supplier", description: "KPIs del proveedor B2B", status: "live", audience: "supplier", auth: "supplier", category: "supplier", icon: "LayoutDashboard", tags: ["supplier"] },
  { path: "/supplier/catalogo", label: "Catálogo supplier", description: "Catálogo B2B del proveedor", status: "live", audience: "supplier", auth: "supplier", category: "supplier", icon: "Package", tags: ["supplier", "b2b"] },
  { path: "/supplier/registrar", label: "Registrar supplier", description: "Signup de proveedor", status: "live", audience: "supplier", auth: "public", category: "auth", icon: "UserPlus", tags: ["supplier", "signup"] },

  // ── Delivery app ────────────────────────────────────────────────────────
  { path: "/delivery", label: "Delivery login", description: "Portal del repartidor", status: "live", audience: "driver", auth: "driver", category: "delivery", icon: "Truck", tags: ["delivery"] },
  { path: "/delivery-app", label: "Delivery app", description: "Home de la app del repartidor", status: "live", audience: "driver", auth: "driver", category: "delivery", icon: "Smartphone", tags: ["delivery", "app"] },
  { path: "/delivery-app/pedido/[id]", label: "Pedido driver", description: "Detalle de pickup + entrega", status: "live", audience: "driver", auth: "driver", category: "delivery", icon: "MapPin", tags: ["delivery"] },
  { path: "/delivery/[partnerId]", label: "Portal partner delivery", description: "Dashboard de partner logístico", status: "live", audience: "driver", auth: "driver", category: "delivery", icon: "Truck", tags: ["delivery", "partner"] },

  // ── CMS + Docs ──────────────────────────────────────────────────────────
  { path: "/cms/[slug]", label: "CMS page", description: "Página custom creada por dueño", status: "live", audience: "publico", auth: "public", category: "cms-docs", icon: "FileText", tags: ["cms"] },
  { path: "/api-docs", label: "API docs", description: "Documentación pública de la API", status: "live", audience: "developers", auth: "public", category: "cms-docs", icon: "Code", tags: ["api", "docs"] },

  // ── Design System (demos) ───────────────────────────────────────────────
  { path: "/design-system", label: "Hub Design System", description: "Tokens + íconos + 12 charts", status: "live", audience: "dev", auth: "public", category: "design-system", icon: "Palette", tags: ["ds", "tokens"] },
  { path: "/design-system/admin", label: "DS · Admin UX", description: "5 primitives del admin", status: "live", audience: "dev", auth: "public", category: "design-system", icon: "LayoutDashboard", tags: ["ds", "admin"] },
  { path: "/design-system/customer", label: "DS · Customer journey", description: "5 primitives del journey", status: "live", audience: "dev", auth: "public", category: "design-system", icon: "User", tags: ["ds", "customer"] },
  { path: "/design-system/a11y", label: "DS · A11y + Perf", description: "4 a11y + 3 perf primitives", status: "live", audience: "dev", auth: "public", category: "design-system", icon: "ShieldCheck", tags: ["ds", "a11y"] },
  { path: "/design-system/illustrations", label: "DS · Ilustraciones", description: "Las 33 ilustraciones Buleje", status: "live", audience: "dev", auth: "public", category: "design-system", icon: "Image", tags: ["ds", "illustrations"] },
  { path: "/design-system/charts-v2", label: "DS · Charts v2", description: "Biblioteca de gráficos", status: "live", audience: "dev", auth: "public", category: "design-system", icon: "BarChart3", tags: ["ds", "charts"] },
  { path: "/design-system/pucallpa", label: "DS · Pucallpa locals", description: "10 ilustraciones amazónicas", status: "live", audience: "dev", auth: "public", category: "design-system", icon: "Palm", tags: ["ds", "pucallpa"] },

  // ── Errores / sistema ───────────────────────────────────────────────────
  { path: "/not-found", label: "404 Not found", description: "Página no encontrada (con ilustración BrujulaPerdida)", status: "live", audience: "cualquiera", auth: "public", category: "errors", icon: "AlertCircle", tags: ["404", "error"] },
  { path: "/offline", label: "Offline", description: "Sin conexión (PWA fallback)", status: "live", audience: "cualquiera", auth: "public", category: "errors", icon: "WifiOff", tags: ["offline", "pwa"] },
];

// ────────────────────────────────────────────────────────────────────────────
// Legacy shape — SITE_MAP (agrupado por categoria) — mantiene compatibilidad
// con control-center que lo consume.
// ────────────────────────────────────────────────────────────────────────────

export interface LegacySiteCategory {
  id: string;
  label: string;
  description: string;
  audience: string;
  routes: Array<{
    path: string;
    label: string;
    description: string;
    status: "live" | "wip" | "legacy";
    audience: string;
    auth: SiteRoute["auth"];
  }>;
}

/** Conversión a la forma legacy agrupada por category. */
export const SITE_MAP: LegacySiteCategory[] = SITE_CATEGORIES.map((cat) => ({
  id: cat.id,
  label: cat.label,
  description: cat.description,
  audience: cat.audience,
  routes: SITE_ROUTES.filter((r) => r.category === cat.id).map((r) => ({
    path: r.path,
    label: r.label,
    description: r.description,
    // Normalizar a tipo legacy: beta/mock → wip
    status: (r.status === "beta" || r.status === "mock") ? ("wip" as const) : r.status,
    audience: r.audience,
    auth: r.auth,
  })),
}));

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

/** Total de rutas en el proyecto. */
export const TOTAL_ROUTES = SITE_ROUTES.length;

/** Rutas por nivel de auth. */
export function getRoutesByAuth(auth: SiteRoute["auth"]) {
  return SITE_ROUTES.filter((r) => r.auth === auth);
}

/** Rutas por estado. */
export function getRoutesByStatus(status: SiteRoute["status"]) {
  return SITE_ROUTES.filter((r) => r.status === status);
}

/** Rutas por categoría. */
export function getRoutesByCategory(category: SiteCategoryId) {
  return SITE_ROUTES.filter((r) => r.category === category);
}

/** Metadata de una categoría por id. */
export function getCategory(id: SiteCategoryId): SiteCategory | undefined {
  return SITE_CATEGORIES.find((c) => c.id === id);
}
