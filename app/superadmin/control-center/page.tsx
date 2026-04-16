"use client";

import { useState, useEffect } from "react";
import {
  LayoutDashboard, Building2, ShoppingBag, BarChart3, Activity, Settings,
  Store, ShieldCheck, Users, Package, CreditCard, Truck, ChefHat,
  Search, Heart, Globe, FileText, Terminal, ExternalLink, Copy, Check,
  HeartPulse, MonitorCheck, Eye, EyeOff, Trash2, LogIn, KeyRound,
} from "lucide-react";

// ── Link sections ─────────────────────────────────────────────────────────────

interface LinkItem {
  label: string;
  href: string;
  icon: React.ReactNode;
  desc: string;
  external?: boolean;
}

interface Section {
  title: string;
  color: string;
  bgColor: string;
  links: LinkItem[];
}

const SECTIONS: Section[] = [
  {
    title: "SuperAdmin (Plataforma SaaS)",
    color: "text-teal-600 dark:text-teal-400",
    bgColor: "bg-teal-50 dark:bg-teal-950/30",
    links: [
      { label: "Dashboard", href: "/superadmin/dashboard", icon: <LayoutDashboard className="w-4 h-4" />, desc: "Panel principal de la plataforma" },
      { label: "Tiendas (tenants)", href: "/superadmin/tenants", icon: <Building2 className="w-4 h-4" />, desc: "Gestionar todas las bodegas" },
      { label: "Marketplace", href: "/superadmin/stores", icon: <ShoppingBag className="w-4 h-4" />, desc: "Tiendas publicadas" },
      { label: "Analytics", href: "/superadmin/analytics", icon: <BarChart3 className="w-4 h-4" />, desc: "Métricas de toda la plataforma" },
      { label: "Actividad", href: "/superadmin/activity", icon: <Activity className="w-4 h-4" />, desc: "Log de auditoría global" },
      { label: "Config", href: "/superadmin/settings", icon: <Settings className="w-4 h-4" />, desc: "Configuración de plataforma" },
      { label: "Salud del sistema", href: "/superadmin/health", icon: <HeartPulse className="w-4 h-4" />, desc: "Estado de servicios y BD" },
    ],
  },
  {
    title: "Admin Panel (ERP Bodega)",
    color: "text-emerald-600 dark:text-emerald-400",
    bgColor: "bg-emerald-50 dark:bg-emerald-950/30",
    links: [
      { label: "Dashboard Admin", href: "/admin", icon: <LayoutDashboard className="w-4 h-4" />, desc: "Panel de administración" },
      { label: "POS Móvil", href: "/admin/pos-mobile", icon: <CreditCard className="w-4 h-4" />, desc: "Punto de venta táctil" },
      { label: "Kiosk", href: "/admin/kiosk", icon: <MonitorCheck className="w-4 h-4" />, desc: "Modo autoservicio" },
      { label: "CMS", href: "/admin/cms", icon: <FileText className="w-4 h-4" />, desc: "Gestión de contenido" },
    ],
  },
  {
    title: "Tienda (Storefront)",
    color: "text-emerald-600 dark:text-emerald-400",
    bgColor: "bg-emerald-50 dark:bg-emerald-950/30",
    links: [
      { label: "Inicio", href: "/", icon: <Store className="w-4 h-4" />, desc: "Página principal de la tienda" },
      { label: "Catálogo", href: "/tienda", icon: <Package className="w-4 h-4" />, desc: "Todos los productos" },
      { label: "Buscar", href: "/buscar", icon: <Search className="w-4 h-4" />, desc: "Buscador de productos" },
      { label: "Mis pedidos", href: "/mis-pedidos", icon: <ShoppingBag className="w-4 h-4" />, desc: "Historial de compras" },
      { label: "Mi cuenta", href: "/cuenta", icon: <Users className="w-4 h-4" />, desc: "Datos del cliente" },
      { label: "Puntos", href: "/puntos", icon: <Heart className="w-4 h-4" />, desc: "Programa de fidelidad" },
      { label: "Delivery", href: "/delivery", icon: <Truck className="w-4 h-4" />, desc: "Opciones de entrega" },
      { label: "Recetas", href: "/recetas", icon: <ChefHat className="w-4 h-4" />, desc: "Inspiración culinaria" },
    ],
  },
  {
    title: "Páginas SaaS / Público",
    color: "text-purple-600 dark:text-purple-400",
    bgColor: "bg-purple-50 dark:bg-purple-950/30",
    links: [
      { label: "Landing SaaS", href: "/saas", icon: <Globe className="w-4 h-4" />, desc: "Página de venta de la plataforma" },
      { label: "Pricing", href: "/pricing", icon: <CreditCard className="w-4 h-4" />, desc: "Planes y precios" },
      { label: "Marketplace público", href: "/marketplace", icon: <Store className="w-4 h-4" />, desc: "Directorio de bodegas" },
      { label: "Portal proveedor", href: "/supplier", icon: <Truck className="w-4 h-4" />, desc: "Acceso de proveedores" },
      { label: "App delivery", href: "/delivery-app", icon: <Truck className="w-4 h-4" />, desc: "App para repartidores" },
      { label: "Onboarding", href: "/onboarding", icon: <ShieldCheck className="w-4 h-4" />, desc: "Registro de nueva bodega" },
      { label: "API Docs", href: "/api-docs", icon: <Terminal className="w-4 h-4" />, desc: "Documentación de API" },
    ],
  },
];

// ── Credentials ───────────────────────────────────────────────────────────────

interface Credential {
  label: string;
  username: string;
  password: string;
  url: string;
  badge: string;
  badgeColor: string;
}

const CREDENTIALS: Credential[] = [
  { label: "SuperAdmin", username: "platform", password: "Buleje2026", url: "/superadmin/login", badge: "Platform", badgeColor: "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400" },
  { label: "Admin", username: "admin", password: "Admin2026", url: "/admin/login", badge: "Admin", badgeColor: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" },
  { label: "Cajero", username: "cajero", password: "Cajero2026", url: "/admin/login", badge: "Cajero", badgeColor: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" },
  { label: "Almacenero", username: "almacen", password: "Almacen2026", url: "/admin/login", badge: "Almacén", badgeColor: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" },
  { label: "Demo Admin", username: "demo", password: "demo1234", url: "/t/demo/admin", badge: "Demo", badgeColor: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400" },
];

// ── Clipboard helper ──────────────────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <button onClick={copy} className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors" title="Copiar">
      {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5 text-gray-400" />}
    </button>
  );
}

// ── Health status widget ──────────────────────────────────────────────────────

function HealthStatus() {
  const [status, setStatus] = useState<"loading" | "ok" | "degraded" | "error">("loading");
  const [latency, setLatency] = useState<number>(0);

  useEffect(() => {
    const check = async () => {
      const start = Date.now();
      try {
        const res = await fetch("/api/health");
        setLatency(Date.now() - start);
        if (res.ok) {
          const data = await res.json();
          setStatus(data.status === "ok" ? "ok" : "degraded");
        } else {
          setStatus("error");
        }
      } catch {
        setLatency(Date.now() - start);
        setStatus("error");
      }
    };
    check();
  }, []);

  const colors = {
    loading: "bg-gray-200 dark:bg-gray-700",
    ok: "bg-green-400 dark:bg-green-500",
    degraded: "bg-amber-400 dark:bg-amber-500",
    error: "bg-red-400 dark:bg-red-500",
  };
  const labels = { loading: "Verificando...", ok: "Todo funcionando", degraded: "Degradado", error: "Con errores" };

  return (
    <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
      <span className={`w-2.5 h-2.5 rounded-full ${colors[status]} ${status === "loading" ? "animate-pulse" : ""}`} />
      <span>{labels[status]}</span>
      {latency > 0 && <span className="text-xs text-gray-400 dark:text-gray-600">({latency}ms)</span>}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

function SavedTenantCredentials() {
  const [credentials, setCredentials] = useState<Array<{ slug: string; username: string; password: string; savedAt: string }>>([]);
  const [showPasswords, setShowPasswords] = useState(false);

  useEffect(() => {
    // Load all stored tenant credentials from localStorage
    const creds: typeof credentials = [];
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith("sa-cred-")) {
          const slug = key.replace("sa-cred-", "");
          const val = localStorage.getItem(key);
          if (val) {
            const parsed = JSON.parse(val) as { username: string; password: string; savedAt?: string };
            creds.push({ slug, username: parsed.username, password: parsed.password, savedAt: parsed.savedAt ?? "" });
          }
        }
      }
    } catch { /* silent */ }
    setCredentials(creds.sort((a, b) => a.slug.localeCompare(b.slug)));
  }, []);

  const handleDelete = (slug: string) => {
    if (!window.confirm(`¿Eliminar credenciales guardadas de "${slug}"?`)) return;
    try { localStorage.removeItem(`sa-cred-${slug}`); } catch { /* silent */ }
    setCredentials((prev) => prev.filter((c) => c.slug !== slug));
  };

  const handleLogin = (slug: string) => {
    window.open(`/admin/login?tenant=${encodeURIComponent(slug)}&auto=1`, "_blank");
  };

  if (credentials.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-2xl p-6">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white uppercase tracking-wider mb-3 flex items-center gap-2">
          <KeyRound className="w-4 h-4 text-emerald-600" />
          Credenciales de Tiendas
        </h3>
        <p className="text-sm text-gray-400">No hay credenciales guardadas. Guarda credenciales desde el módulo Tiendas → Detalle de cada tienda.</p>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-2xl p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
          <KeyRound className="w-4 h-4 text-emerald-600" />
          Credenciales de Tiendas ({credentials.length})
        </h3>
        <button
          type="button"
          onClick={() => setShowPasswords((v) => !v)}
          className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
        >
          {showPasswords ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
          {showPasswords ? "Ocultar" : "Mostrar"} contraseñas
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 dark:border-gray-800">
              <th className="text-left py-2 px-3 text-xs font-medium text-gray-500 uppercase">Tienda</th>
              <th className="text-left py-2 px-3 text-xs font-medium text-gray-500 uppercase">Usuario</th>
              <th className="text-left py-2 px-3 text-xs font-medium text-gray-500 uppercase">Contraseña</th>
              <th className="text-left py-2 px-3 text-xs font-medium text-gray-500 uppercase">Guardada</th>
              <th className="text-center py-2 px-3 text-xs font-medium text-gray-500 uppercase">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50 dark:divide-gray-800/50">
            {credentials.map((c) => (
              <tr key={c.slug} className="hover:bg-gray-50 dark:hover:bg-gray-900/50 transition-colors">
                <td className="py-2.5 px-3">
                  <span className="font-semibold text-gray-900 dark:text-white">{c.slug}</span>
                </td>
                <td className="py-2.5 px-3 font-mono text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
                  {c.username} <CopyButton text={c.username} />
                </td>
                <td className="py-2.5 px-3 font-mono text-gray-700 dark:text-gray-300">
                  <span className="flex items-center gap-1.5">
                    {showPasswords ? c.password : "••••••••"} <CopyButton text={c.password} />
                  </span>
                </td>
                <td className="py-2.5 px-3 text-xs text-gray-400">
                  {c.savedAt ? new Date(c.savedAt).toLocaleDateString("es-PE") : "—"}
                </td>
                <td className="py-2.5 px-3">
                  <div className="flex items-center justify-center gap-1">
                    <button
                      type="button"
                      onClick={() => handleLogin(c.slug)}
                      className="p-1.5 rounded-lg text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 transition-colors"
                      title="Iniciar sesión como esta tienda"
                    >
                      <LogIn className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(c.slug)}
                      className="p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                      title="Eliminar credenciales guardadas"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function ControlCenterPage() {
  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Centro de Control</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Accesos rápidos a todas las secciones de la plataforma</p>
        </div>
        <HealthStatus />
      </div>

      {/* Credentials */}
      <div className="bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-2xl p-6">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white uppercase tracking-wider mb-4 flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-teal-600" />
          Credenciales de acceso
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 dark:border-gray-800">
                <th className="text-left py-2 px-3 text-xs font-medium text-gray-500 uppercase">Rol</th>
                <th className="text-left py-2 px-3 text-xs font-medium text-gray-500 uppercase">Usuario</th>
                <th className="text-left py-2 px-3 text-xs font-medium text-gray-500 uppercase">Contraseña</th>
                <th className="text-left py-2 px-3 text-xs font-medium text-gray-500 uppercase">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-800/50">
              {CREDENTIALS.map((c) => (
                <tr key={c.username} className="hover:bg-gray-50 dark:hover:bg-gray-900/50 transition-colors">
                  <td className="py-2.5 px-3">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${c.badgeColor}`}>
                      {c.badge}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 font-mono text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
                    {c.username} <CopyButton text={c.username} />
                  </td>
                  <td className="py-2.5 px-3 font-mono text-gray-700 dark:text-gray-300">
                    <span className="flex items-center gap-1.5">
                      {c.password} <CopyButton text={c.password} />
                    </span>
                  </td>
                  <td className="py-2.5 px-3">
                    <a
                      href={c.url}
                      target="_blank"
                      rel="noopener"
                      className="inline-flex items-center gap-1 text-teal-600 dark:text-teal-400 hover:underline text-xs font-medium"
                    >
                      Entrar <ExternalLink className="w-3 h-3" />
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Saved tenant credentials */}
      <SavedTenantCredentials />

      {/* Link sections */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {SECTIONS.map((section) => (
          <div
            key={section.title}
            className="bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-2xl overflow-hidden"
          >
            <div className={`px-6 py-3 ${section.bgColor} border-b border-gray-100 dark:border-gray-800`}>
              <h3 className={`text-sm font-semibold ${section.color} uppercase tracking-wider`}>
                {section.title}
              </h3>
            </div>
            <div className="p-2">
              {section.links.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  target={link.external ? "_blank" : undefined}
                  rel={link.external ? "noopener" : undefined}
                  className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-900/50 transition-colors group"
                >
                  <div className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center shrink-0 text-gray-500 dark:text-gray-400 group-hover:text-teal-600 dark:group-hover:text-teal-400 transition-colors">
                    {link.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-900 dark:text-white truncate">{link.label}</div>
                    <div className="text-xs text-gray-400 dark:text-gray-600 truncate">{link.desc}</div>
                  </div>
                  <ExternalLink className="w-3.5 h-3.5 text-gray-300 dark:text-gray-700 group-hover:text-gray-500 transition-colors shrink-0" />
                </a>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
