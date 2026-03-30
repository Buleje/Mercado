import type { Metadata } from "next";
import {
  Store, ShieldCheck, LayoutDashboard, Users, ShoppingCart,
  FileText, Truck, CreditCard, BarChart3,
  Globe, Package, UserPlus,
  Map, Receipt, Smartphone, Code,
  Crown, Palette, Boxes, MessageSquare, Zap,
  ExternalLink, Search, Heart, ChefHat,
} from "lucide-react";

export const metadata: Metadata = {
  title: "Panel de Control | Buleje ERP",
  description: "Centro de navegación del ecosistema Buleje — tienda, admin, SaaS, y más.",
};

// ── Tipos ────────────────────────────────────────────────────────────────────

type LinkItem = {
  label: string;
  href: string;
  description: string;
  icon: React.ReactNode;
  badge?: string;
  external?: boolean;
};

type Section = {
  title: string;
  description: string;
  color: string;
  bgColor: string;
  links: LinkItem[];
};

// ── Datos ────────────────────────────────────────────────────────────────────

const SECTIONS: Section[] = [
  {
    title: "Plataforma SaaS",
    description: "Marketing, registro y planes",
    color: "text-teal-600 dark:text-teal-400",
    bgColor: "bg-teal-50 dark:bg-teal-950/30 border-teal-200 dark:border-teal-800/40",
    links: [
      { label: "Landing SaaS", href: "/saas", description: "Pagina de marketing del servicio", icon: <Globe className="h-4 w-4" /> },
      { label: "Registro", href: "/registro", description: "Crear nueva tienda", icon: <UserPlus className="h-4 w-4" /> },
      { label: "Precios", href: "/pricing", description: "Planes y precios del servicio", icon: <CreditCard className="h-4 w-4" /> },
      { label: "Marketplace", href: "/marketplace", description: "Directorio de tiendas activas", icon: <Boxes className="h-4 w-4" /> },
    ],
  },
  {
    title: "SuperAdmin",
    description: "Gestion de la plataforma completa",
    color: "text-violet-600 dark:text-violet-400",
    bgColor: "bg-violet-50 dark:bg-violet-950/30 border-violet-200 dark:border-violet-800/40",
    links: [
      { label: "Dashboard SuperAdmin", href: "/superadmin", description: "Tenants, metricas, configuracion global", icon: <ShieldCheck className="h-4 w-4" />, badge: "Admin" },
      { label: "Login SuperAdmin", href: "/superadmin/login", description: "Acceso al panel de plataforma", icon: <Crown className="h-4 w-4" /> },
    ],
  },
  {
    title: "Admin de Tienda",
    description: "Panel de administracion del tenant activo",
    color: "text-blue-600 dark:text-blue-400",
    bgColor: "bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800/40",
    links: [
      { label: "Panel Admin", href: "/admin", description: "Dashboard principal de tu tienda", icon: <LayoutDashboard className="h-4 w-4" /> },
      { label: "Login Admin", href: "/admin/login", description: "Iniciar sesion en el admin", icon: <Users className="h-4 w-4" /> },
      { label: "CMS", href: "/admin/cms", description: "Gestionar paginas y contenido", icon: <FileText className="h-4 w-4" /> },
      { label: "POS Kiosk", href: "/admin/kiosk", description: "Punto de venta modo kiosk", icon: <ShoppingCart className="h-4 w-4" /> },
      { label: "POS Movil", href: "/admin/pos-mobile", description: "Punto de venta para celular", icon: <Smartphone className="h-4 w-4" /> },
      { label: "Webhooks", href: "/admin/webhook-queue", description: "Cola de webhooks pendientes", icon: <Zap className="h-4 w-4" /> },
    ],
  },
  {
    title: "Tienda Online",
    description: "La tienda publica que ven tus clientes",
    color: "text-emerald-600 dark:text-emerald-400",
    bgColor: "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800/40",
    links: [
      { label: "Inicio", href: "/", description: "Pagina principal de la tienda", icon: <Store className="h-4 w-4" /> },
      { label: "Catalogo", href: "/tienda", description: "Todos los productos", icon: <Package className="h-4 w-4" /> },
      { label: "Buscar", href: "/buscar", description: "Buscador de productos", icon: <Search className="h-4 w-4" /> },
      { label: "Recetas", href: "/recetas", description: "Ideas de recetas con tus productos", icon: <ChefHat className="h-4 w-4" /> },
      { label: "Mi Cuenta", href: "/cuenta", description: "Perfil y datos del cliente", icon: <Users className="h-4 w-4" /> },
      { label: "Mis Pedidos", href: "/mis-pedidos", description: "Historial de pedidos del cliente", icon: <Receipt className="h-4 w-4" /> },
      { label: "Delivery", href: "/delivery", description: "Mapa de cobertura y zonas", icon: <Map className="h-4 w-4" /> },
      { label: "Tracking", href: "/tracking", description: "Rastrear pedido en tiempo real", icon: <Truck className="h-4 w-4" /> },
    ],
  },
  {
    title: "Onboarding y Configuracion",
    description: "Configurar una tienda nueva paso a paso",
    color: "text-amber-600 dark:text-amber-400",
    bgColor: "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800/40",
    links: [
      { label: "Onboarding Wizard", href: "/onboarding", description: "Configurar marca, productos, clientes", icon: <Palette className="h-4 w-4" /> },
      { label: "Invitaciones", href: "/invite", description: "Aceptar invitacion a un equipo", icon: <MessageSquare className="h-4 w-4" /> },
    ],
  },
  {
    title: "Roles Especializados",
    description: "Portales para proveedores y repartidores",
    color: "text-orange-600 dark:text-orange-400",
    bgColor: "bg-orange-50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-800/40",
    links: [
      { label: "Portal Proveedor", href: "/supplier", description: "Gestion de catalogo y pedidos de proveedor", icon: <Boxes className="h-4 w-4" /> },
      { label: "App Delivery", href: "/delivery-app", description: "App para repartidores (pedidos asignados)", icon: <Truck className="h-4 w-4" /> },
    ],
  },
  {
    title: "Multi-Tenant (por slug)",
    description: "Acceso directo a tiendas especificas",
    color: "text-cyan-600 dark:text-cyan-400",
    bgColor: "bg-cyan-50 dark:bg-cyan-950/30 border-cyan-200 dark:border-cyan-800/40",
    links: [
      { label: "Tienda /t/{slug}", href: "/t/main", description: "Storefront de un tenant especifico", icon: <Store className="h-4 w-4" /> },
      { label: "Admin /t/{slug}/admin", href: "/t/main/admin", description: "Panel admin de un tenant especifico", icon: <LayoutDashboard className="h-4 w-4" /> },
      { label: "Tienda /t/{slug}/tienda", href: "/t/main/tienda", description: "Catalogo de un tenant especifico", icon: <Package className="h-4 w-4" /> },
    ],
  },
  {
    title: "Documentacion y Legal",
    description: "APIs, terminos y soporte",
    color: "text-gray-600 dark:text-gray-400",
    bgColor: "bg-gray-50 dark:bg-gray-900/50 border-gray-200 dark:border-gray-700/50",
    links: [
      { label: "API Docs", href: "/api-docs", description: "Documentacion interactiva de la API REST", icon: <Code className="h-4 w-4" /> },
      { label: "Acerca de", href: "/about", description: "Historia y mision de la marca", icon: <Heart className="h-4 w-4" /> },
      { label: "Terminos", href: "/terminos", description: "Terminos y condiciones del servicio", icon: <FileText className="h-4 w-4" /> },
      { label: "Privacidad", href: "/privacidad", description: "Politica de privacidad", icon: <ShieldCheck className="h-4 w-4" /> },
    ],
  },
];

// ── Componentes ──────────────────────────────────────────────────────────────

function LinkCard({ item }: { item: LinkItem }) {
  return (
    <a
      href={item.href}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex items-start gap-3 p-3.5 rounded-xl border border-transparent hover:border-gray-200 dark:hover:border-gray-700 hover:bg-white dark:hover:bg-gray-800/60 transition-all duration-150"
    >
      <div className="h-9 w-9 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center shrink-0 group-hover:bg-primary/10 group-hover:text-primary transition-colors text-gray-500 dark:text-gray-400">
        {item.icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold text-gray-900 dark:text-white group-hover:text-primary transition-colors truncate">
            {item.label}
          </p>
          {item.badge && (
            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-violet-100 dark:bg-violet-900/40 text-violet-600 dark:text-violet-400">
              {item.badge}
            </span>
          )}
          {item.external && <ExternalLink className="h-3 w-3 text-gray-400 shrink-0" />}
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-1">{item.description}</p>
      </div>
    </a>
  );
}

function SectionCard({ section }: { section: Section }) {
  return (
    <div className={`rounded-2xl border p-5 space-y-3 ${section.bgColor}`}>
      <div>
        <h2 className={`text-base font-extrabold ${section.color}`}>{section.title}</h2>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{section.description}</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
        {section.links.map((link) => (
          <LinkCard key={link.href} item={link} />
        ))}
      </div>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function PanelPage() {
  const totalLinks = SECTIONS.reduce((acc, s) => acc + s.links.length, 0);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-background">
      {/* Header */}
      <header className="bg-gradient-to-r from-[#0f766e] to-[#065f46] text-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10 sm:py-14">
          <div className="flex items-center gap-4 mb-4">
            <div className="h-14 w-14 rounded-2xl bg-white/15 backdrop-blur flex items-center justify-center shadow-lg">
              <BarChart3 className="h-7 w-7 text-white" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">Centro de Control</h1>
              <p className="text-sm text-white/70 mt-0.5">Buleje ERP — Ecosistema completo</p>
            </div>
          </div>

          {/* Stats */}
          <div className="flex flex-wrap gap-4 mt-6">
            <div className="bg-white/10 backdrop-blur rounded-xl px-4 py-2.5">
              <p className="text-2xl font-extrabold">{SECTIONS.length}</p>
              <p className="text-xs text-white/60">Secciones</p>
            </div>
            <div className="bg-white/10 backdrop-blur rounded-xl px-4 py-2.5">
              <p className="text-2xl font-extrabold">{totalLinks}</p>
              <p className="text-xs text-white/60">Paginas</p>
            </div>
            <div className="bg-white/10 backdrop-blur rounded-xl px-4 py-2.5">
              <p className="text-2xl font-extrabold">SaaS</p>
              <p className="text-xs text-white/60">Multi-tenant</p>
            </div>
          </div>
        </div>
      </header>

      {/* Grid de secciones */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        {/* Quick access */}
        <div className="flex flex-wrap gap-2">
          {[
            { label: "Admin", href: "/admin", icon: <LayoutDashboard className="h-3.5 w-3.5" /> },
            { label: "Tienda", href: "/tienda", icon: <Store className="h-3.5 w-3.5" /> },
            { label: "SuperAdmin", href: "/superadmin", icon: <ShieldCheck className="h-3.5 w-3.5" /> },
            { label: "Registro", href: "/registro", icon: <UserPlus className="h-3.5 w-3.5" /> },
            { label: "SaaS", href: "/saas", icon: <Globe className="h-3.5 w-3.5" /> },
            { label: "API Docs", href: "/api-docs", icon: <Code className="h-3.5 w-3.5" /> },
          ].map((q) => (
            <a
              key={q.href}
              href={q.href}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-xs font-semibold text-gray-700 dark:text-gray-300 hover:border-primary hover:text-primary transition-colors shadow-sm"
            >
              {q.icon}
              {q.label}
            </a>
          ))}
        </div>

        {/* Secciones */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {SECTIONS.map((section) => (
            <SectionCard key={section.title} section={section} />
          ))}
        </div>

        {/* Footer */}
        <footer className="text-center pt-8 pb-4 border-t border-gray-200 dark:border-gray-800">
          <p className="text-xs text-gray-400 dark:text-gray-500">
            Buleje ERP — Sistema de gestion integral para bodegas y minimarkets
          </p>
          <p className="text-[10px] text-gray-300 dark:text-gray-600 mt-1">
            {totalLinks} paginas &middot; {SECTIONS.length} secciones &middot; Multi-tenant SaaS
          </p>
        </footer>
      </main>
    </div>
  );
}
