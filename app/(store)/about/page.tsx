import Link from "next/link";
import type { Metadata } from "next";
import {
  FlaskConical,
  ShoppingCart,
  BarChart3,
  Shield,
  Smartphone,
  Zap,
  Database,
  Code2,
  Globe,
  GitBranch,
  Package,
  CheckCircle2,
  Clock,
  ExternalLink,
} from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

export const metadata: Metadata = {
  title: "Acerca del Proyecto · Bodega San Martín",
  description:
    "Bodega San Martín es un proyecto de software e-commerce en versión beta activa. Stack moderno: Next.js, React, TypeScript, Prisma y más.",
};

const stack = [
  { name: "Next.js 15", desc: "App Router + RSC + Turbopack", color: "bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200" },
  { name: "React 19", desc: "Server & Client Components", color: "bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300" },
  { name: "TypeScript", desc: "Tipado estricto completo", color: "bg-sky-100 dark:bg-sky-900/30 text-sky-800 dark:text-sky-300" },
  { name: "Tailwind CSS 4", desc: "Utility-first + design tokens", color: "bg-teal-100 dark:bg-teal-900/30 text-teal-800 dark:text-teal-300" },
  { name: "Prisma 7", desc: "ORM type-safe + PostgreSQL", color: "bg-indigo-100 dark:bg-indigo-900/30 text-indigo-800 dark:text-indigo-300" },
  { name: "Framer Motion 12", desc: "Animaciones y transiciones", color: "bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-300" },
  { name: "Stripe", desc: "Pagos online seguros", color: "bg-violet-100 dark:bg-violet-900/30 text-violet-800 dark:text-violet-300" },
  { name: "Vercel / Edge", desc: "Hosting + Edge Runtime", color: "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300" },
  { name: "Sentry", desc: "Monitoreo de errores", color: "bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300" },
  { name: "Vitest + Playwright", desc: "Testing unitario y E2E", color: "bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300" },
];

const features = [
  { icon: ShoppingCart, title: "Tienda Completa", desc: "Catálogo con 500+ productos, carrito, quick-view, filtros avanzados, favoritos y comparador.", color: "text-indigo-500" },
  { icon: BarChart3, title: "Panel Admin 30+ módulos", desc: "POS, CRM, inventario, finanzas, logística, analytics BI, RRHH y mucho más.", color: "text-emerald-500" },
  { icon: Smartphone, title: "PWA + Modo Offline", desc: "Service Worker, manifest PWA, soporte installable en móviles.", color: "text-sky-500" },
  { icon: Shield, title: "Auth & Seguridad", desc: "Roles y permisos granulares, logs de auditoría, rate limiting, validaciones OWASP.", color: "text-amber-500" },
  { icon: Zap, title: "Performance Optimizada", desc: "RSC streaming, lazy loading, react-window, Lighthouse 75+, imágenes Next/Image.", color: "text-yellow-500" },
  { icon: Globe, title: "WhatsApp + Delivery", desc: "Pedidos por WhatsApp, tracking de envíos, rutas de delivery y horarios dinámicos.", color: "text-green-500" },
];

const timeline = [
  { version: "v1.0.0-beta", date: "Mar 18, 2026", status: "current", items: ["Lanzamiento beta público", "Tienda con 500+ productos", "Panel admin con 30 módulos", "Sistema de fidelización y cupones", "PWA + Service Worker", "E2E tests con Playwright"] },
  { version: "v1.1.0", date: "Próximamente", status: "planned", items: ["Checkout con Stripe integrado", "Notificaciones push", "Mejoras de accesibilidad (WCAG 2.1 AA)", "Redis cache para APIs frecuentes"] },
  { version: "v2.0.0", date: "Futuro", status: "future", items: ["Multi-tienda / multi-sede", "App móvil nativa (Capacitor)", "IA generativa para recomendaciones", "Panel analytics con IA"] },
];

export default function AboutPage() {
  return (
    <>
      <Header />
      <main className="pt-20 sm:pt-24 min-h-screen bg-background" id="main-content">

        {/* Hero */}
        <section className="relative overflow-hidden py-16 sm:py-24"
          style={{ background: "linear-gradient(135deg, #1e1b4b 0%, #312e81 50%, #4f46e5 100%)" }}>
          <div className="absolute inset-0 opacity-10" style={{ backgroundImage: "radial-gradient(circle at 20% 50%, #818cf8 0%, transparent 50%), radial-gradient(circle at 80% 20%, #c084fc 0%, transparent 40%)" }} />
          <div className="relative mx-auto max-w-4xl px-4 sm:px-6 text-center">
            <div className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold mb-6 bg-amber-400/20 text-amber-200 border border-amber-400/30">
              <FlaskConical className="h-4 w-4" />
              Proyecto en desarrollo · Versión 1 Beta
            </div>
            <h1 className="text-3xl sm:text-5xl font-extrabold text-white leading-tight mb-4">
              Bodega San Martín<br />
              <span className="text-indigo-300">E-commerce Platform</span>
            </h1>
            <p className="text-lg text-white/70 max-w-2xl mx-auto mb-8">
              Plataforma de comercio electrónico full-stack construida con tecnologías modernas.
              Actualmente en versión beta activa — algunas funciones pueden estar en construcción.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <Link href="/tienda"
                className="inline-flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-bold bg-white text-indigo-700 hover:bg-white/90 transition-all shadow-lg">
                <ShoppingCart className="h-4 w-4" /> Ver Tienda
              </Link>
              <Link href="/admin"
                className="inline-flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-bold bg-white/10 text-white border border-white/20 hover:bg-white/20 transition-all">
                <BarChart3 className="h-4 w-4" /> Panel Admin
              </Link>
            </div>
          </div>
        </section>

        {/* Status Banner */}
        <div className="bg-amber-50 dark:bg-amber-950/30 border-y border-amber-200 dark:border-amber-700/30">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 py-3 flex flex-wrap items-center justify-center gap-4 text-sm">
            <span className="flex items-center gap-1.5 font-semibold text-amber-700 dark:text-amber-400">
              <Clock className="h-4 w-4" /> Estado actual:
              <span className="rounded-full px-2.5 py-0.5 bg-amber-500 text-white text-xs font-bold">Beta Activa</span>
            </span>
            <span className="text-amber-600 dark:text-amber-500">·</span>
            <span className="text-amber-700/80 dark:text-amber-400/80">Última build: 18 de marzo, 2026</span>
            <span className="text-amber-600 dark:text-amber-500">·</span>
            <Link href="/admin?tab=changelog" className="flex items-center gap-1 text-amber-700 dark:text-amber-400 hover:underline font-medium">
              Ver changelog <ExternalLink className="h-3 w-3" />
            </Link>
          </div>
        </div>

        {/* Features */}
        <section className="py-16 sm:py-20">
          <div className="mx-auto max-w-7xl px-4 sm:px-6">
            <h2 className="text-2xl sm:text-3xl font-extrabold text-foreground text-center mb-3">Funcionalidades</h2>
            <p className="text-muted text-center mb-10 max-w-xl mx-auto">Todo lo que incluye la plataforma en su versión beta actual.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {features.map((f) => (
                <div key={f.title}
                  className="rounded-2xl border border-gray-200 dark:border-card-border bg-white dark:bg-card p-6 hover:shadow-md transition-shadow">
                  <f.icon className={`h-6 w-6 mb-3 ${f.color}`} />
                  <h3 className="font-bold text-foreground mb-1.5">{f.title}</h3>
                  <p className="text-sm text-muted leading-relaxed">{f.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Tech Stack */}
        <section className="py-16 sm:py-20 bg-gray-50 dark:bg-surface/30">
          <div className="mx-auto max-w-7xl px-4 sm:px-6">
            <div className="flex items-center gap-2 mb-3 justify-center">
              <Code2 className="h-5 w-5 text-primary" />
              <h2 className="text-2xl sm:text-3xl font-extrabold text-foreground">Stack Tecnológico</h2>
            </div>
            <p className="text-muted text-center mb-10 max-w-xl mx-auto">Tecnologías modernas que potencian la plataforma.</p>
            <div className="flex flex-wrap justify-center gap-3">
              {stack.map((tech) => (
                <div key={tech.name}
                  className={`flex items-center gap-2 rounded-xl px-4 py-2.5 border border-transparent ${tech.color}`}>
                  <span className="font-bold text-sm">{tech.name}</span>
                  <span className="text-xs opacity-70 hidden sm:block">· {tech.desc}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Roadmap */}
        <section className="py-16 sm:py-20">
          <div className="mx-auto max-w-3xl px-4 sm:px-6">
            <div className="flex items-center gap-2 mb-3 justify-center">
              <GitBranch className="h-5 w-5 text-primary" />
              <h2 className="text-2xl sm:text-3xl font-extrabold text-foreground">Roadmap</h2>
            </div>
            <p className="text-muted text-center mb-10">Evolución planificada del proyecto.</p>
            <div className="space-y-6">
              {timeline.map((entry) => (
                <div key={entry.version}
                  className={`rounded-2xl border p-6 ${
                    entry.status === "current"
                      ? "border-indigo-300 dark:border-indigo-700 bg-indigo-50 dark:bg-indigo-950/30"
                      : entry.status === "planned"
                        ? "border-gray-200 dark:border-card-border bg-white dark:bg-card"
                        : "border-dashed border-gray-200 dark:border-card-border bg-transparent"
                  }`}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold ${
                        entry.status === "current" ? "bg-indigo-600 text-white" :
                        entry.status === "planned" ? "bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200" :
                        "bg-gray-100 dark:bg-gray-800 text-gray-500"
                      }`}>
                        {entry.version}
                      </span>
                      {entry.status === "current" && (
                        <span className="flex items-center gap-1 text-xs text-indigo-600 dark:text-indigo-400 font-semibold">
                          <span className="h-1.5 w-1.5 rounded-full bg-indigo-500 animate-pulse inline-block" />
                          Actual
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-muted font-medium">{entry.date}</span>
                  </div>
                  <ul className="space-y-1.5">
                    {entry.items.map((item) => (
                      <li key={item} className="flex items-start gap-2 text-sm text-muted">
                        <CheckCircle2 className={`h-4 w-4 shrink-0 mt-0.5 ${entry.status === "current" ? "text-indigo-500" : "text-gray-300 dark:text-gray-600"}`} />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="py-12 bg-linear-to-r from-indigo-600 to-violet-600 text-white text-center">
          <div className="mx-auto max-w-2xl px-4 sm:px-6">
            <Package className="h-10 w-10 mx-auto mb-3 opacity-80" />
            <h2 className="text-2xl font-extrabold mb-2">¿Tienes feedback?</h2>
            <p className="text-white/70 mb-6 text-sm">Estamos en beta y cada opinión cuenta para mejorar el proyecto.</p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <Link href="/tienda"
                className="inline-flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-bold bg-white text-indigo-700 hover:bg-white/90 transition-all shadow-md">
                <ShoppingCart className="h-4 w-4" /> Explorar la tienda
              </Link>
              <Link href="/admin?tab=changelog"
                className="inline-flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-bold bg-white/15 border border-white/25 hover:bg-white/25 transition-all">
                <Database className="h-4 w-4" /> Ver changelog
              </Link>
            </div>
          </div>
        </section>

      </main>
      <Footer />
    </>
  );
}
