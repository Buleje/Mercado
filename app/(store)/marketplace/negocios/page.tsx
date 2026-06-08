import type { Metadata } from "next";
import Link from "next/link";
import {
  BarChart3, Box, CreditCard, FileText, Globe, MessageCircle,
  Package, Percent, Shield, ShoppingCart, Smartphone, Star,
  TrendingUp, Truck, Users, Wallet, Zap, Check, ArrowRight,
  Coins, Timer, TrendingDown, Trophy,
  type LucideIcon,
} from "lucide-react";
import BusinessMarquee from "@/components/negocios/BusinessMarquee";
import BusinessTabsShowcase from "@/components/negocios/BusinessTabsShowcase";
import ROICalculator from "@/components/negocios/ROICalculator";

export const metadata: Metadata = {
  title: "Buleje para Negocios — Software ERP para Bodegas del Perú",
  description:
    "Sistema completo para tu bodega: inventario, POS, delivery, fiado digital, facturación SUNAT y marketplace. Empieza gratis.",
};

const FEATURES = [
  { icon: ShoppingCart, title: "Punto de Venta (POS)", desc: "Vende rápido desde el mostrador. Escanea, cobra y genera boletas en segundos." },
  { icon: Package, title: "Inventario Inteligente", desc: "Stock en tiempo real, alertas de bajo stock, vencimientos y mermas controladas." },
  { icon: Truck, title: "Delivery Integrado", desc: "Recibe pedidos online, asigna repartidores y trackea entregas en vivo." },
  { icon: CreditCard, title: "Fiado Digital", desc: "Credito a clientes controlado. Saldos, limites, recordatorios automaticos por WhatsApp." },
  { icon: FileText, title: "Facturacion SUNAT", desc: "Boletas y facturas electronicas directas a SUNAT. Guias de remision incluidas." },
  { icon: Globe, title: "Tu Tienda Online", desc: "Pagina web propia con catálogo, carrito y pasarela de pago. Lista en minutos." },
  { icon: BarChart3, title: "Analytics y Reportes", desc: "Dashboard con ventas diarias, productos top, margen de ganancia y tendencias." },
  { icon: Users, title: "Gestión de Clientes", desc: "Base de datos de clientes, historial de compras, puntos de fidelidad y segmentacion." },
  { icon: MessageCircle, title: "WhatsApp Business", desc: "Notificaciones automaticas: pedidos, fiados, promociones y cumpleanos por WhatsApp." },
  { icon: Percent, title: "Promociones y Cupones", desc: "Ofertas relampago, cupones de descuento, combos y programa de referidos." },
  { icon: Shield, title: "Multi-usuario y Roles", desc: "Cajeros, administradores y repartidores con permisos separados. Turnos y arqueo de caja." },
  { icon: Smartphone, title: "Funciona en Celular", desc: "App web responsiva. Administra tu bodega desde cualquier dispositivo, en cualquier lugar." },
];

const BENEFITS: { Icon: LucideIcon; title: string; desc: string }[] = [
  { Icon: Coins, title: "Aumenta tus ventas", desc: "Clientes compran 24/7 desde su celular. Delivery amplía tu zona de cobertura." },
  { Icon: Timer, title: "Ahorrá tiempo", desc: "Automatizá cobros, inventario y reportes. Lo que antes tomaba horas, ahora es 1 click." },
  { Icon: TrendingDown, title: "Reduce pérdidas", desc: "Control de vencimientos, mermas y fiados. Sabes exactamente cuánto ganás y cuánto perdés." },
  { Icon: Trophy, title: "Competí con los grandes", desc: "Tu bodega con la misma tecnología que las cadenas. Presencia online profesional." },
];

const PLANS = [
  {
    name: "Gratis",
    price: "S/0",
    period: "para siempre",
    desc: "Perfecto para empezar a digitalizar tu bodega",
    popular: false,
    features: [
      "Hasta 100 productos",
      "Punto de venta básico",
      "1 usuario",
      "Pagina de tienda online",
      "Reportes basicos",
      "Soporte por WhatsApp",
    ],
    cta: "Empezar gratis",
    href: "/marketplace/apply",
  },
  {
    name: "Pro",
    price: "S/49",
    period: "/mes",
    desc: "Todo lo que necesitas para crecer tu negocio",
    popular: true,
    features: [
      "Productos ilimitados",
      "POS completo + facturación SUNAT",
      "Hasta 5 usuarios con roles",
      "Delivery integrado",
      "Fiado digital + recordatorios",
      "Analytics avanzados",
      "WhatsApp Business automatico",
      "Cupones y promociones",
      "Soporte prioritario",
    ],
    cta: "Empezar prueba gratis",
    href: "/marketplace/apply?plan=pro",
  },
  {
    name: "Business",
    price: "S/149",
    period: "/mes",
    desc: "Para bodegas con alto volumen y multiples sucursales",
    popular: false,
    features: [
      "Todo de Pro, mas:",
      "Sucursales ilimitadas",
      "Usuarios ilimitados",
      "API para integraciones",
      "Marca blanca (tu dominio)",
      "Soporte dedicado + onboarding",
      "Reportes personalizados",
      "SLA 99.9% uptime",
    ],
    cta: "Contactar ventas",
    href: "https://wa.me/51929340532?text=Hola%2C%20quiero%20información%20del%20plan%20Business",
  },
];

const TESTIMONIALS = [
  { name: "Carlos M.", business: "Bodega El Amigo", text: "Antes perdia plata en fiados que no cobraba. Ahora todo esta controlado y mis clientes pagan a tiempo.", rating: 5 },
  { name: "Maria S.", business: "Minimarket Santa Rosa", text: "El delivery me trajo clientes de toda la zona. Mis ventas subieron 40% el primer mes.", rating: 5 },
  { name: "Pedro L.", business: "Bodega Don Pedro", text: "La facturación electrónica me ahorra 2 horas diarias. Ya no tengo que ir a la SUNAT.", rating: 5 },
];

export default function NegociosPage() {
  return (
    <>
      {/* ── HERO ── */}
      <section className="py-16 sm:py-20 bg-white dark:bg-[var(--surface-canvas)]">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 text-center">
          <span className="inline-flex items-center gap-2 text-xs font-medium text-[var(--text-tertiary)] bg-[var(--surface-sunken)] dark:bg-[var(--surface-sunken)] rounded-full px-4 py-1.5 mb-6">
            <Zap className="h-3.5 w-3.5" />
            Software ERP + Marketplace
          </span>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black text-[var(--text-primary)] dark:text-white leading-tight tracking-tight">
            Tu bodega, <span className="text-primary">digital</span>
          </h1>
          <p className="mt-6 text-lg sm:text-xl text-[var(--text-tertiary)] dark:text-[var(--text-tertiary)] max-w-2xl mx-auto leading-relaxed">
            El sistema completo para administrar y hacer crecer tu bodega. Inventario, ventas, delivery, fiado y facturación — todo en un solo lugar.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mt-10">
            <Link
              href="/marketplace/apply"
              className="inline-flex items-center gap-2 bg-primary text-white font-bold text-base px-8 py-4 rounded-xl hover:bg-primary-dark transition-all"
            >
              Empezar gratis
              <ArrowRight className="h-5 w-5" />
            </Link>
            <Link
              href="https://wa.me/51929340532?text=Hola%2C%20quiero%20una%20demo%20de%20Buleje"
              className="inline-flex items-center gap-2 border border-gray-300 dark:border-[var(--rule-base)] text-[var(--text-secondary)] dark:text-[var(--text-tertiary)] font-semibold text-base px-8 py-4 rounded-xl hover:bg-[var(--surface-sunken)] dark:hover:bg-gray-800 transition-all"
            >
              <MessageCircle className="h-5 w-5" />
              Pedir demo
            </Link>
          </div>
          <p className="mt-6 text-sm text-[var(--text-tertiary)]">Sin tarjeta de credito. Configura en 5 minutos.</p>
        </div>
      </section>

      {/* ── SOCIAL PROOF: marquee de logos ── */}
      <BusinessMarquee />

      {/* ── TABS SHOWCASE: 4 features principales con mockup interactivo ── */}
      <section className="py-16 sm:py-20 bg-white dark:bg-[var(--surface-canvas)]">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <span className="inline-flex items-center gap-1.5 bg-primary/10 text-primary text-xs font-bold rounded-full px-3 py-1 mb-4">
              <Zap className="h-3.5 w-3.5" />
              Todo en un solo panel
            </span>
            <h2 className="text-3xl sm:text-4xl font-black text-[var(--text-primary)] dark:text-white">
              Mira cómo funciona
            </h2>
            <p className="mt-3 text-[var(--text-tertiary)] dark:text-[var(--text-tertiary)] max-w-xl mx-auto">
              Tocá cada feature para ver el mockup real. Son los mismos paneles que
              usan 500+ bodegas hoy.
            </p>
          </div>
          <BusinessTabsShowcase />
        </div>
      </section>

      {/* ── CALCULADORA ROI ── */}
      <ROICalculator />

      {/* ── QUE INCLUYE ── */}
      <section className="py-16 sm:py-20 bg-[var(--surface-sunken)] dark:bg-[var(--surface-canvas)]/50">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <span className="inline-flex items-center gap-1.5 bg-[var(--surface-sunken)] dark:bg-[var(--surface-sunken)] text-[var(--text-secondary)] dark:text-[var(--text-tertiary)] text-xs font-medium rounded-full px-3 py-1 mb-4">
              <Box className="h-3.5 w-3.5" />
              Que incluye
            </span>
            <h2 className="text-3xl sm:text-4xl font-black text-[var(--text-primary)] dark:text-white">
              Todo lo que tu bodega necesita
            </h2>
            <p className="mt-4 text-[var(--text-tertiary)] dark:text-[var(--text-tertiary)] max-w-2xl mx-auto">
              12 modulos integrados que trabajan juntos para que administres tu negocio completo desde un solo panel.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {FEATURES.map((f) => (
              <div key={f.title} className="group p-5 rounded-2xl border border-gray-200 dark:border-[var(--rule-soft)] bg-white dark:bg-[var(--surface-canvas)] hover:border-gray-300 dark:hover:border-gray-700 hover:shadow-sm transition-all duration-300">
                <div className="h-10 w-10 rounded-xl bg-[var(--surface-sunken)] dark:bg-[var(--surface-sunken)] text-[var(--text-secondary)] dark:text-[var(--text-tertiary)] flex items-center justify-center mb-4">
                  <f.icon className="h-5 w-5" />
                </div>
                <h3 className="font-bold text-[var(--text-primary)] dark:text-white mb-1.5">{f.title}</h3>
                <p className="text-sm text-[var(--text-tertiary)] dark:text-[var(--text-tertiary)] leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── COMO TE AYUDA ── */}
      <section className="py-16 sm:py-20 bg-white dark:bg-[var(--surface-canvas)]">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <span className="inline-flex items-center gap-1.5 bg-[var(--surface-sunken)] dark:bg-[var(--surface-sunken)] text-[var(--text-secondary)] dark:text-[var(--text-tertiary)] text-xs font-medium rounded-full px-3 py-1 mb-4">
              <TrendingUp className="h-3.5 w-3.5" />
              Beneficios
            </span>
            <h2 className="text-3xl sm:text-4xl font-black text-[var(--text-primary)] dark:text-white">
              Como Buleje ayuda a tu negocio
            </h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-4xl mx-auto">
            {BENEFITS.map((b) => {
              const BIcon = b.Icon;
              return (
                <div
                  key={b.title}
                  className="flex gap-4 p-6 rounded-xl bg-white dark:bg-[var(--surface-canvas)] border border-gray-200 dark:border-[var(--rule-soft)] hover:border-gray-900 dark:hover:border-gray-500 transition-colors"
                >
                  <div className="h-10 w-10 shrink-0 rounded-lg bg-[var(--surface-sunken)] dark:bg-[var(--surface-canvas)] border border-gray-200 dark:border-[var(--rule-soft)] flex items-center justify-center text-[var(--text-secondary)] dark:text-[var(--text-secondary)]">
                    <BIcon className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
                  </div>
                  <div>
                    <h3 className="font-extrabold tracking-tight text-[var(--text-primary)] dark:text-white text-base mb-1">
                      {b.title}
                    </h3>
                    <p className="text-sm text-[var(--text-tertiary)] dark:text-[var(--text-tertiary)] leading-relaxed">
                      {b.desc}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── PLANES Y PRECIOS ── */}
      <section className="py-16 sm:py-20 bg-[var(--surface-sunken)] dark:bg-[var(--surface-canvas)]/50">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <span className="inline-flex items-center gap-1.5 bg-[var(--surface-sunken)] dark:bg-[var(--surface-sunken)] text-[var(--text-secondary)] dark:text-[var(--text-tertiary)] text-xs font-medium rounded-full px-3 py-1 mb-4">
              <Wallet className="h-3.5 w-3.5" />
              Planes
            </span>
            <h2 className="text-3xl sm:text-4xl font-black text-[var(--text-primary)] dark:text-white">
              Precios simples, sin sorpresas
            </h2>
            <p className="mt-4 text-[var(--text-tertiary)] dark:text-[var(--text-tertiary)]">
              Empieza gratis y escala cuando lo necesites. Sin contratos, cancela cuando quieras.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {PLANS.map((plan) => (
              <div
                key={plan.name}
                className={`relative rounded-2xl p-6 sm:p-8 flex flex-col ${
                  plan.popular
                    ? "bg-primary text-white scale-105 border-2 border-primary shadow-lg"
                    : "bg-white dark:bg-[var(--surface-canvas)] border border-gray-200 dark:border-[var(--rule-soft)]"
                }`}
              >
                {plan.popular && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-xs font-bold uppercase tracking-wider px-4 py-1 rounded-full">
                    Mas popular
                  </span>
                )}
                <div className="mb-6">
                  <h3 className={`text-lg font-bold ${plan.popular ? "text-white/80" : "text-[var(--text-tertiary)] dark:text-[var(--text-tertiary)]"}`}>{plan.name}</h3>
                  <div className="flex items-baseline gap-1 mt-2">
                    <span className={`text-4xl font-black ${plan.popular ? "text-white" : "text-[var(--text-primary)] dark:text-white"}`}>{plan.price}</span>
                    <span className={`text-sm ${plan.popular ? "text-white/70" : "text-[var(--text-tertiary)]"}`}>{plan.period}</span>
                  </div>
                  <p className={`text-sm mt-2 ${plan.popular ? "text-white/70" : "text-[var(--text-tertiary)] dark:text-[var(--text-tertiary)]"}`}>{plan.desc}</p>
                </div>
                <ul className="space-y-3 mb-8 flex-1">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2.5 text-sm">
                      <Check className={`h-4 w-4 shrink-0 mt-0.5 ${plan.popular ? "text-white/80" : "text-primary"}`} />
                      <span className={plan.popular ? "text-white/90" : "text-[var(--text-secondary)] dark:text-[var(--text-tertiary)]"}>{f}</span>
                    </li>
                  ))}
                </ul>
                <Link
                  href={plan.href}
                  className={`block text-center font-bold text-sm py-3.5 rounded-xl transition-all ${
                    plan.popular
                      ? "bg-white text-primary hover:bg-[var(--surface-sunken)]"
                      : "bg-primary text-white hover:bg-primary-dark"
                  }`}
                >
                  {plan.cta}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── TESTIMONIOS ── */}
      <section className="py-16 sm:py-20 bg-white dark:bg-[var(--surface-canvas)]">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-black text-[var(--text-primary)] dark:text-white">
              Negocios que ya usan Buleje
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {TESTIMONIALS.map((t) => (
              <div key={t.name} className="bg-white dark:bg-[var(--surface-canvas)] rounded-2xl p-6 border border-gray-200 dark:border-[var(--rule-soft)]">
                <div className="flex gap-0.5 mb-4">
                  {Array.from({ length: t.rating }).map((_, i) => (
                    <Star key={i} className="h-4 w-4 fill-amber-400 text-amber-400" />
                  ))}
                </div>
                <p className="text-[var(--text-secondary)] text-sm leading-relaxed mb-4">&ldquo;{t.text}&rdquo;</p>
                <div>
                  <p className="font-bold text-[var(--text-primary)] text-sm">{t.name}</p>
                  <p className="text-xs text-[var(--text-tertiary)]">{t.business}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA FINAL ── */}
      <section className="py-16 sm:py-20 bg-[var(--surface-sunken)] dark:bg-[var(--surface-canvas)]/50">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 text-center">
          <h2 className="text-3xl sm:text-4xl font-black text-[var(--text-primary)] dark:text-white mb-6">
            Digitaliza tu bodega hoy
          </h2>
          <p className="text-lg text-[var(--text-tertiary)] dark:text-[var(--text-tertiary)] mb-10">
            Unete a los negocios que ya venden mas con Buleje. Empieza gratis, sin compromiso.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/marketplace/apply"
              className="inline-flex items-center gap-2 bg-primary text-white font-bold text-base px-8 py-4 rounded-xl hover:bg-primary-dark transition-all"
            >
              Registrar mi negocio gratis
              <ArrowRight className="h-5 w-5" />
            </Link>
            <Link
              href="https://wa.me/51929340532?text=Hola%2C%20quiero%20información%20sobre%20Buleje%20para%20mi%20negocio"
              className="inline-flex items-center gap-2 border border-gray-300 dark:border-[var(--rule-base)] text-[var(--text-secondary)] dark:text-[var(--text-tertiary)] font-semibold text-base px-8 py-4 rounded-xl hover:bg-[var(--surface-sunken)] dark:hover:bg-gray-800 transition-all"
            >
              <MessageCircle className="h-5 w-5" />
              Hablar con un asesor
            </Link>
          </div>
        </div>
      </section>
      {/* Footer ÚNICO lo provee el (store) layout — Brandon 2026-06-08 (sin doble). */}
    </>
  );
}
