"use client";

import { useState } from "react";
import {
  Play, ExternalLink, Copy, Check,
  LayoutDashboard, Store, ShoppingCart, BarChart3, Package,
  Users, Truck, Shield, CreditCard, BookOpen,
  Receipt, Brain,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Demo fijo permanente — siempre va a /t/demo ─────────────────────────────

const DEMO_SLUG = "demo";
const DEMO_ADMIN = `/t/${DEMO_SLUG}/admin`;
const DEMO_STORE = `/t/${DEMO_SLUG}`;

const DEMO_LINKS = [
  { label: "Panel Admin", desc: "Dashboard, ventas, inventario, reportes, IA", icon: <LayoutDashboard className="h-4 w-4" />, href: DEMO_ADMIN, color: "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600" },
  { label: "Tienda Online", desc: "La tienda que ven tus clientes con delivery", icon: <Store className="h-4 w-4" />, href: DEMO_STORE, color: "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600" },
  { label: "POS / Caja", desc: "Punto de venta con Yape, efectivo y Plin", icon: <ShoppingCart className="h-4 w-4" />, href: `${DEMO_ADMIN}`, color: "bg-teal-50 dark:bg-teal-950/30 text-teal-600" },
  { label: "Catalogo", desc: "30 productos en 10 categorias con precios", icon: <Package className="h-4 w-4" />, href: `/t/${DEMO_SLUG}/tienda`, color: "bg-orange-50 dark:bg-orange-950/30 text-orange-600" },
];

const DATA_INCLUDED = [
  { icon: <Package className="h-3.5 w-3.5" />, text: "30 productos reales", color: "text-teal-400" },
  { icon: <Users className="h-3.5 w-3.5" />, text: "10 clientes registrados", color: "text-emerald-400" },
  { icon: <ShoppingCart className="h-3.5 w-3.5" />, text: "25 pedidos con tracking", color: "text-violet-400" },
  { icon: <Receipt className="h-3.5 w-3.5" />, text: "15 ventas POS con ticket", color: "text-emerald-400" },
  { icon: <Truck className="h-3.5 w-3.5" />, text: "4 proveedores + 6 compras", color: "text-orange-400" },
  { icon: <CreditCard className="h-3.5 w-3.5" />, text: "5 fiados activos", color: "text-pink-400" },
  { icon: <BarChart3 className="h-3.5 w-3.5" />, text: "10 gastos operativos", color: "text-amber-400" },
  { icon: <BookOpen className="h-3.5 w-3.5" />, text: "6 lotes con vencimiento", color: "text-cyan-400" },
  { icon: <Brain className="h-3.5 w-3.5" />, text: "IA + reportes + alertas", color: "text-rose-400" },
  { icon: <Shield className="h-3.5 w-3.5" />, text: "Plan Enterprise completo", color: "text-yellow-400" },
];

export default function SaasDemoLauncher() {
  const [copied, setCopied] = useState(false);

  const copyCredentials = () => {
    navigator.clipboard.writeText("Usuario: demo\nClave: demo1234");
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <section className="py-20 sm:py-28 bg-gradient-to-b from-gray-900 to-gray-950 text-white overflow-hidden">
      <div className="max-w-5xl mx-auto px-4 sm:px-6">
        {/* Header */}
        <div className="text-center mb-10">
          <span className="inline-flex items-center gap-1.5 bg-teal-500/20 text-teal-400 text-xs font-bold uppercase tracking-wider px-3.5 py-1.5 rounded-full mb-4">
            <Play className="h-3 w-3" /> Demo en vivo
          </span>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold">
            Entra y explora el sistema completo
          </h2>
          <p className="text-gray-400 mt-3 max-w-2xl mx-auto">
            Una tienda ficticia con datos reales: productos, clientes, pedidos, ventas, fiados, compras, gastos y mas.
            Plan Enterprise con todo habilitado. Sin registro. Entra directo.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Izquierda: datos incluidos + credenciales */}
          <div className="space-y-6">
            {/* Datos incluidos */}
            <div className="space-y-2">
              <p className="text-xs font-bold uppercase tracking-wider text-gray-500">Datos precargados</p>
              <div className="grid grid-cols-2 gap-2">
                {DATA_INCLUDED.map((d) => (
                  <div key={d.text} className="flex items-center gap-2 bg-white/5 rounded-xl px-3 py-2.5 hover:bg-white/10 transition-colors">
                    <span className={d.color}>{d.icon}</span>
                    <span className="text-xs text-gray-300">{d.text}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Credenciales */}
            <div className="bg-white/10 backdrop-blur rounded-2xl p-5 border border-white/10">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-bold uppercase tracking-wider text-teal-400">Credenciales de acceso</p>
                <button
                  onClick={copyCredentials}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/10 text-xs font-medium text-gray-300 hover:bg-white/20 transition-colors"
                >
                  {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                  {copied ? "Copiado" : "Copiar"}
                </button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-black/30 rounded-xl p-3">
                  <p className="text-[10px] text-gray-500 uppercase">Usuario</p>
                  <p className="text-sm font-mono font-bold text-white">demo</p>
                </div>
                <div className="bg-black/30 rounded-xl p-3">
                  <p className="text-[10px] text-gray-500 uppercase">Clave</p>
                  <p className="text-sm font-mono font-bold text-white">demo1234</p>
                </div>
              </div>
              <p className="text-[10px] text-gray-500 mt-2">
                Demo permanente — los datos se mantienen siempre disponibles
              </p>
            </div>
          </div>

          {/* Derecha: links de acceso */}
          <div className="space-y-4">
            <p className="text-xs font-bold uppercase tracking-wider text-gray-500">Entrar al demo</p>

            {DEMO_LINKS.map((link) => (
              <a
                key={link.href + link.label}
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-4 p-5 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 hover:border-teal-500/40 hover:scale-[1.01] transition-all group"
              >
                <div className={cn("h-12 w-12 rounded-xl flex items-center justify-center shrink-0", link.color)}>
                  {link.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-base font-bold text-white group-hover:text-teal-400 transition-colors">{link.label}</p>
                  <p className="text-xs text-gray-400">{link.desc}</p>
                </div>
                <ExternalLink className="h-4 w-4 text-gray-500 group-hover:text-teal-400 transition-colors shrink-0" />
              </a>
            ))}

            {/* CTA registro */}
            <div className="text-center pt-4 border-t border-white/10">
              <p className="text-sm text-gray-400 mb-3">Te gusto? Crea tu propia tienda en 2 minutos.</p>
              <a
                href="/registro"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-teal-500 to-emerald-600 text-white font-bold text-sm hover:opacity-90 transition-all shadow-lg shadow-teal-500/20"
              >
                Crear mi tienda gratis
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
