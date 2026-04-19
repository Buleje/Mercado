"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Check, X, Zap, Crown, ShoppingBag, Star,
  ChevronRight, Shield, Headphones, Globe, BarChart2,
  Package, Users, ShoppingCart, Building2,
} from "lucide-react";
import { PLANS, PLAN_ORDER, type PlanId, type PlanDef } from "@/lib/plans";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatLimit(n: number) {
  return n === -1 ? "Ilimitado" : n.toLocaleString("es-PE");
}

const PLAN_ICONS: Record<PlanId, React.ReactNode> = {
  free: <ShoppingBag className="w-6 h-6" />,
  pro: <Zap className="w-6 h-6" />,
  business: <Crown className="w-6 h-6" />,
  enterprise: <Star className="w-6 h-6" />,
};

const PLAN_GRADIENT: Record<PlanId, string> = {
  free: "from-gray-600 to-gray-500",
  pro: "from-emerald-600 to-indigo-600",
  business: "from-violet-600 to-purple-600",
  enterprise: "from-amber-500 to-orange-500",
};



const FEATURES = [
  { key: "products", label: "Productos", icon: <Package className="w-4 h-4" />, getter: (d: PlanDef) => formatLimit(d.limits.maxProducts) },
  { key: "users", label: "Usuarios admin", icon: <Users className="w-4 h-4" />, getter: (d: PlanDef) => formatLimit(d.limits.maxUsers) },
  { key: "orders", label: "Pedidos / mes", icon: <ShoppingCart className="w-4 h-4" />, getter: (d: PlanDef) => formatLimit(d.limits.maxOrdersPerMonth) },
  { key: "stores", label: "Tiendas", icon: <Building2 className="w-4 h-4" />, getter: (d: PlanDef) => formatLimit(d.limits.maxStores) },
  { key: "customDomain", label: "Dominio propio", icon: <Globe className="w-4 h-4" />, getter: (d: PlanDef) => d.limits.customDomain },
  { key: "analytics", label: "Analytics avanzado", icon: <BarChart2 className="w-4 h-4" />, getter: (d: PlanDef) => d.limits.advancedAnalytics },
  { key: "api", label: "Acceso API", icon: <Zap className="w-4 h-4" />, getter: (d: PlanDef) => d.limits.apiAccess },
  { key: "multiStore", label: "Multi-tienda", icon: <Building2 className="w-4 h-4" />, getter: (d: PlanDef) => d.limits.multiStore },
  { key: "priority", label: "Soporte prioritario", icon: <Headphones className="w-4 h-4" />, getter: (d: PlanDef) => d.limits.prioritySupport },
  { key: "whiteLabel", label: "White label", icon: <Shield className="w-4 h-4" />, getter: (d: PlanDef) => d.limits.whiteLabel },
  { key: "dedicated", label: "Soporte dedicado", icon: <Headphones className="w-4 h-4" />, getter: (d: PlanDef) => d.limits.dedicatedSupport },
  { key: "sla", label: "SLA garantizado", icon: <Shield className="w-4 h-4" />, getter: (d: PlanDef) => d.limits.sla },
];

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PricingPage() {
  const [annual, setAnnual] = useState(false);

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Hero */}
      <header className="relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,var(--tw-gradient-stops))] from-indigo-900/20 via-gray-950 to-gray-950" />
        <div className="relative max-w-7xl mx-auto px-6 pt-16 pb-10 text-center">
          <Link href="/" className="inline-flex items-center gap-2 text-indigo-400 text-sm font-medium hover:underline mb-6">
            <ChevronRight className="w-3 h-3 rotate-180" /> Volver a la tienda
          </Link>
          <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight mb-4">
            Planes y Precios
          </h1>
          <p className="text-gray-400 text-lg max-w-2xl mx-auto mb-8">
            Elige el plan perfecto para tu negocio. Todos incluyen POS, inventario, pedidos en línea y más.
            Crece a tu ritmo — actualiza o cambia cuando necesites.
          </p>

          {/* Billing toggle */}
          <div className="inline-flex items-center gap-3 bg-gray-900 border border-gray-800 rounded-full p-1.5">
            <button
              onClick={() => setAnnual(false)}
              className={`px-5 py-2 rounded-full text-sm font-semibold transition-all ${
                !annual ? "bg-indigo-600 text-white shadow-lg" : "text-gray-400 hover:text-white"
              }`}
            >
              Mensual
            </button>
            <button
              onClick={() => setAnnual(true)}
              className={`px-5 py-2 rounded-full text-sm font-semibold transition-all flex items-center gap-1.5 ${
                annual ? "bg-indigo-600 text-white shadow-lg" : "text-gray-400 hover:text-white"
              }`}
            >
              Anual
              <span className="text-[length:var(--ts-2xs)] bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded-full font-bold">
                -20%
              </span>
            </button>
          </div>
        </div>
      </header>

      {/* Plan cards */}
      <section className="max-w-7xl mx-auto px-6 pb-16">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {PLAN_ORDER.map((planId) => {
            const def = PLANS[planId];
            const isPopular = def.popular;
            const monthlyPrice = annual
              ? Math.round((def.priceYearly / 12) * 100) / 100
              : def.priceMonthly;

            return (
              <div
                key={planId}
                className={`relative bg-gray-900 border rounded-2xl p-6 flex flex-col transition-all hover:scale-[1.02] hover:shadow-xl ${
                  isPopular
                    ? "border-indigo-500 ring-2 ring-indigo-500/30 shadow-indigo-500/10 shadow-lg"
                    : "border-gray-800 hover:border-gray-700"
                }`}
              >
                {isPopular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-indigo-600 text-white text-xs font-bold px-4 py-1 rounded-full">
                    Más popular
                  </div>
                )}

                {/* Icon + Name */}
                <div className={`w-12 h-12 rounded-xl bg-linear-to-br ${PLAN_GRADIENT[planId]} flex items-center justify-center text-white mb-4`}>
                  {PLAN_ICONS[planId]}
                </div>
                <h3 className="text-xl font-bold text-white">{def.name}</h3>
                <p className="text-gray-500 text-sm mt-1 mb-4">{def.description}</p>

                {/* Price */}
                <div className="mb-6">
                  {def.priceMonthly === 0 ? (
                    <span className="text-4xl font-extrabold">Gratis</span>
                  ) : (
                    <div>
                      <span className="text-4xl font-extrabold">${Math.floor(monthlyPrice)}</span>
                      {monthlyPrice % 1 > 0 && (
                        <span className="text-xl font-bold text-gray-400">.{String(Math.round((monthlyPrice % 1) * 100)).padStart(2, "0")}</span>
                      )}
                      <span className="text-gray-500 text-sm">/mes</span>
                      {annual && def.priceMonthly > 0 && (
                        <p className="text-emerald-400 text-xs mt-1">
                          ${def.priceYearly}/año · Ahorras ${(def.priceMonthly * 12 - def.priceYearly).toFixed(0)}/año
                        </p>
                      )}
                    </div>
                  )}
                </div>

                {/* CTA */}
                <Link
                  href={planId === "enterprise" ? "/registro?plan=enterprise" : `/registro?plan=${planId}`}
                  className={`w-full py-3 rounded-xl text-center font-semibold text-sm transition-all ${
                    isPopular
                      ? "bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg"
                      : planId === "enterprise"
                        ? "bg-amber-600 hover:bg-amber-500 text-white"
                        : "bg-gray-800 hover:bg-gray-700 text-gray-200"
                  }`}
                >
                  {planId === "free" ? "Empezar gratis" : planId === "enterprise" ? "Contactar ventas" : `Elegir ${def.name}`}
                </Link>

                {/* Limits */}
                <div className="mt-6 space-y-3 border-t border-gray-800 pt-6 flex-1">
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Incluye:</p>
                  <div className="flex items-center gap-2 text-sm text-gray-300">
                    <Package className="w-3.5 h-3.5 text-gray-500" />
                    <span>{formatLimit(def.limits.maxProducts)} productos</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-gray-300">
                    <Users className="w-3.5 h-3.5 text-gray-500" />
                    <span>{formatLimit(def.limits.maxUsers)} usuarios</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-gray-300">
                    <ShoppingCart className="w-3.5 h-3.5 text-gray-500" />
                    <span>{formatLimit(def.limits.maxOrdersPerMonth)} pedidos/mes</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-gray-300">
                    <Building2 className="w-3.5 h-3.5 text-gray-500" />
                    <span>{formatLimit(def.limits.maxStores)} {def.limits.maxStores === 1 ? "tienda" : "tiendas"}</span>
                  </div>

                  {/* Feature flags */}
                  <div className="space-y-2 pt-2">
                    {[
                      { label: "Dominio propio", has: def.limits.customDomain },
                      { label: "Analytics avanzado", has: def.limits.advancedAnalytics },
                      { label: "Acceso API", has: def.limits.apiAccess },
                      { label: "Multi-tienda", has: def.limits.multiStore },
                      { label: "Soporte prioritario", has: def.limits.prioritySupport },
                      { label: "White label", has: def.limits.whiteLabel },
                      { label: "Soporte dedicado", has: def.limits.dedicatedSupport },
                      { label: "SLA garantizado", has: def.limits.sla },
                    ].map(({ label, has }) => (
                      <div key={label} className="flex items-center gap-2 text-sm">
                        {has ? (
                          <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        ) : (
                          <X className="w-3.5 h-3.5 text-gray-700 shrink-0" />
                        )}
                        <span className={has ? "text-gray-300" : "text-gray-600"}>{label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Comparison table */}
      <section className="max-w-7xl mx-auto px-6 pb-20">
        <h2 className="text-2xl font-bold text-center mb-8">Comparación detallada</h2>
        <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800">
                  <th className="text-left px-6 py-4 text-gray-400 font-semibold w-60">Característica</th>
                  {PLAN_ORDER.map((planId) => (
                    <th key={planId} className="text-center px-4 py-4">
                      <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-linear-to-r ${PLAN_GRADIENT[planId]} text-white`}>
                        {PLANS[planId].name}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800/50">
                {FEATURES.map((feat) => (
                  <tr key={feat.key} className="hover:bg-gray-800/30 transition-colors">
                    <td className="px-6 py-3.5 text-gray-300 flex items-center gap-2">
                      {feat.icon} {feat.label}
                    </td>
                    {PLAN_ORDER.map((planId) => {
                      const val = feat.getter(PLANS[planId]);
                      return (
                        <td key={planId} className="text-center px-4 py-3.5">
                          {typeof val === "boolean" ? (
                            val ? (
                              <Check className="w-4 h-4 text-emerald-400 mx-auto" />
                            ) : (
                              <X className="w-4 h-4 text-gray-700 mx-auto" />
                            )
                          ) : (
                            <span className="text-gray-200 font-medium">{val}</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="max-w-3xl mx-auto px-6 pb-20">
        <h2 className="text-2xl font-bold text-center mb-8">Preguntas frecuentes</h2>
        <div className="space-y-4">
          {[
            { q: "¿Puedo cambiar de plan en cualquier momento?", a: "Sí. Puedes actualizar o bajar de plan cuando quieras. Si bajas, se ajusta al final del período pagado." },
            { q: "¿El plan Gratis tiene limitaciones de tiempo?", a: "No. Puedes usar el plan Gratis indefinidamente. Es perfecto para empezar y probar la plataforma." },
            { q: "¿Qué métodos de pago aceptan?", a: "Aceptamos tarjetas Visa, Mastercard, American Express y transferencias bancarias para planes anuales." },
            { q: "¿Hay período de prueba para planes de pago?", a: "Sí, todos los planes de pago incluyen 14 días gratis. Sin compromiso — cancela antes si no te conviene." },
            { q: "¿Puedo tener múltiples tiendas?", a: "El plan Business soporta hasta 5 tiendas y Enterprise es ilimitado. Los planes Free y Pro incluyen una tienda." },
            { q: "¿Ofrecen descuento para pago anual?", a: "Sí, el pago anual tiene un 20% de descuento sobre el precio mensual." },
          ].map(({ q, a }) => (
            <details key={q} className="group bg-gray-900 border border-gray-800 rounded-xl">
              <summary className="px-6 py-4 cursor-pointer text-sm font-semibold text-gray-200 flex items-center justify-between">
                {q}
                <ChevronRight className="w-4 h-4 text-gray-500 group-open:rotate-90 transition-transform" />
              </summary>
              <p className="px-6 pb-4 text-sm text-gray-400">{a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* Footer CTA */}
      <section className="border-t border-gray-800 py-16 text-center px-6">
        <h2 className="text-2xl font-bold mb-3">¿Listo para empezar?</h2>
        <p className="text-gray-400 mb-6">Crea tu tienda gratis en minutos. Sin tarjeta de crédito.</p>
        <Link
          href="/registro?plan=free"
          className="inline-flex items-center gap-2 px-8 py-3.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl transition-colors shadow-lg"
        >
          Crear mi tienda gratis <ChevronRight className="w-4 h-4" />
        </Link>
      </section>
    </div>
  );
}
