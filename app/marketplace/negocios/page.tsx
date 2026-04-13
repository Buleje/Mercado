import type { Metadata } from "next";
import Link from "next/link";
import {
  BarChart3, Box, CreditCard, FileText, Globe, MessageCircle,
  Package, Percent, Shield, ShoppingCart, Smartphone, Star,
  TrendingUp, Truck, Users, Wallet, Zap, Check, ArrowRight,
} from "lucide-react";
import Footer from "@/components/Footer";

export const metadata: Metadata = {
  title: "Buleje para Negocios — Software ERP para Bodegas del Peru",
  description:
    "Sistema completo para tu bodega: inventario, POS, delivery, fiado digital, facturacion SUNAT y marketplace. Empieza gratis.",
};

const FEATURES = [
  { icon: ShoppingCart, title: "Punto de Venta (POS)", desc: "Vende rapido desde el mostrador. Escanea, cobra y genera boletas en segundos." },
  { icon: Package, title: "Inventario Inteligente", desc: "Stock en tiempo real, alertas de bajo stock, vencimientos y mermas controladas." },
  { icon: Truck, title: "Delivery Integrado", desc: "Recibe pedidos online, asigna repartidores y trackea entregas en vivo." },
  { icon: CreditCard, title: "Fiado Digital", desc: "Credito a clientes controlado. Saldos, limites, recordatorios automaticos por WhatsApp." },
  { icon: FileText, title: "Facturacion SUNAT", desc: "Boletas y facturas electronicas directas a SUNAT. Guias de remision incluidas." },
  { icon: Globe, title: "Tu Tienda Online", desc: "Pagina web propia con catalogo, carrito y pasarela de pago. Lista en minutos." },
  { icon: BarChart3, title: "Analytics y Reportes", desc: "Dashboard con ventas diarias, productos top, margen de ganancia y tendencias." },
  { icon: Users, title: "Gestion de Clientes", desc: "Base de datos de clientes, historial de compras, puntos de fidelidad y segmentacion." },
  { icon: MessageCircle, title: "WhatsApp Business", desc: "Notificaciones automaticas: pedidos, fiados, promociones y cumpleanos por WhatsApp." },
  { icon: Percent, title: "Promociones y Cupones", desc: "Ofertas relampago, cupones de descuento, combos y programa de referidos." },
  { icon: Shield, title: "Multi-usuario y Roles", desc: "Cajeros, administradores y repartidores con permisos separados. Turnos y arqueo de caja." },
  { icon: Smartphone, title: "Funciona en Celular", desc: "App web responsiva. Administra tu bodega desde cualquier dispositivo, en cualquier lugar." },
];

const BENEFITS = [
  { emoji: "💰", title: "Aumenta tus ventas", desc: "Clientes compran 24/7 desde su celular. Delivery amplia tu zona de cobertura." },
  { emoji: "⏱️", title: "Ahorra tiempo", desc: "Automatiza cobros, inventario y reportes. Lo que antes tomaba horas, ahora es 1 click." },
  { emoji: "📉", title: "Reduce perdidas", desc: "Control de vencimientos, mermas y fiados. Sabe exactamente cuanto ganas y cuanto pierdes." },
  { emoji: "🏆", title: "Compite con los grandes", desc: "Tu bodega con la misma tecnologia que las cadenas. Presencia online profesional." },
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
      "Punto de venta basico",
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
      "POS completo + facturacion SUNAT",
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
    href: "https://wa.me/51916409675?text=Hola%2C%20quiero%20información%20del%20plan%20Business",
  },
];

const TESTIMONIALS = [
  { name: "Carlos M.", business: "Bodega El Amigo", text: "Antes perdia plata en fiados que no cobraba. Ahora todo esta controlado y mis clientes pagan a tiempo.", rating: 5 },
  { name: "Maria S.", business: "Minimarket Santa Rosa", text: "El delivery me trajo clientes de toda la zona. Mis ventas subieron 40% el primer mes.", rating: 5 },
  { name: "Pedro L.", business: "Bodega Don Pedro", text: "La facturacion electronica me ahorra 2 horas diarias. Ya no tengo que ir a la SUNAT.", rating: 5 },
];

export default function NegociosPage() {
  return (
    <>
      {/* ── HERO ── */}
      <section className="relative overflow-hidden py-20 sm:py-28 lg:py-36 bg-gradient-to-br from-blue-900 via-blue-800 to-indigo-950">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -top-32 -left-32 h-125 w-125 rounded-full bg-blue-500/20 blur-[120px]" />
          <div className="absolute -bottom-40 -right-40 h-100 w-100 rounded-full bg-violet-500/15 blur-[100px]" />
        </div>
        <div className="relative z-10 mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 text-center">
          <span className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-blue-300 mb-6 bg-blue-500/15 rounded-full px-5 py-2 border border-blue-400/30">
            <Zap className="h-3.5 w-3.5" />
            Software ERP + Marketplace
          </span>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black text-white leading-tight tracking-tight">
            Tu bodega, <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-violet-400">digital</span>
          </h1>
          <p className="mt-6 text-lg sm:text-xl text-blue-200/80 max-w-2xl mx-auto leading-relaxed">
            El sistema completo para administrar y hacer crecer tu bodega. Inventario, ventas, delivery, fiado y facturacion — todo en un solo lugar.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mt-10">
            <Link
              href="/marketplace/apply"
              className="inline-flex items-center gap-2 bg-white text-blue-900 font-bold text-base px-8 py-4 rounded-xl hover:bg-blue-50 transition-all shadow-xl shadow-blue-900/30"
            >
              Empezar gratis
              <ArrowRight className="h-5 w-5" />
            </Link>
            <Link
              href="https://wa.me/51916409675?text=Hola%2C%20quiero%20una%20demo%20de%20Buleje"
              className="inline-flex items-center gap-2 text-white font-semibold text-base px-8 py-4 rounded-xl border border-white/20 hover:bg-white/10 transition-all"
            >
              <MessageCircle className="h-5 w-5" />
              Pedir demo
            </Link>
          </div>
          <p className="mt-6 text-sm text-blue-300/50">Sin tarjeta de credito. Configura en 5 minutos.</p>
        </div>
      </section>

      {/* ── QUE INCLUYE ── */}
      <section className="py-20 sm:py-28 bg-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <span className="inline-flex items-center gap-1.5 bg-blue-50 text-blue-600 text-xs font-bold uppercase tracking-wider px-3.5 py-1.5 rounded-full mb-4">
              <Box className="h-3.5 w-3.5" />
              Que incluye
            </span>
            <h2 className="text-3xl sm:text-4xl font-black text-gray-900">
              Todo lo que tu bodega necesita
            </h2>
            <p className="mt-4 text-gray-500 max-w-2xl mx-auto">
              12 modulos integrados que trabajan juntos para que administres tu negocio completo desde un solo panel.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {FEATURES.map((f) => (
              <div key={f.title} className="group p-5 rounded-2xl border border-gray-100 hover:border-blue-200 hover:shadow-lg hover:shadow-blue-50 transition-all duration-300">
                <div className="h-10 w-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center mb-4 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                  <f.icon className="h-5 w-5" />
                </div>
                <h3 className="font-bold text-gray-900 mb-1.5">{f.title}</h3>
                <p className="text-sm text-gray-500 leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── COMO TE AYUDA ── */}
      <section className="py-20 sm:py-28 bg-gray-50">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <span className="inline-flex items-center gap-1.5 bg-emerald-50 text-emerald-600 text-xs font-bold uppercase tracking-wider px-3.5 py-1.5 rounded-full mb-4">
              <TrendingUp className="h-3.5 w-3.5" />
              Beneficios
            </span>
            <h2 className="text-3xl sm:text-4xl font-black text-gray-900">
              Como Buleje ayuda a tu negocio
            </h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 max-w-4xl mx-auto">
            {BENEFITS.map((b) => (
              <div key={b.title} className="flex gap-5 p-6 rounded-2xl bg-white shadow-sm border border-gray-100">
                <span className="text-4xl shrink-0">{b.emoji}</span>
                <div>
                  <h3 className="font-bold text-gray-900 text-lg mb-1">{b.title}</h3>
                  <p className="text-sm text-gray-500 leading-relaxed">{b.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── PLANES Y PRECIOS ── */}
      <section className="py-20 sm:py-28 bg-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <span className="inline-flex items-center gap-1.5 bg-violet-50 text-violet-600 text-xs font-bold uppercase tracking-wider px-3.5 py-1.5 rounded-full mb-4">
              <Wallet className="h-3.5 w-3.5" />
              Planes
            </span>
            <h2 className="text-3xl sm:text-4xl font-black text-gray-900">
              Precios simples, sin sorpresas
            </h2>
            <p className="mt-4 text-gray-500">
              Empieza gratis y escala cuando lo necesites. Sin contratos, cancela cuando quieras.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {PLANS.map((plan) => (
              <div
                key={plan.name}
                className={`relative rounded-2xl p-6 sm:p-8 flex flex-col ${
                  plan.popular
                    ? "bg-blue-900 text-white shadow-2xl shadow-blue-900/30 scale-105 border-2 border-blue-400"
                    : "bg-white border border-gray-200 shadow-sm"
                }`}
              >
                {plan.popular && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-gradient-to-r from-blue-400 to-violet-400 text-white text-xs font-bold uppercase tracking-wider px-4 py-1 rounded-full">
                    Mas popular
                  </span>
                )}
                <div className="mb-6">
                  <h3 className={`text-lg font-bold ${plan.popular ? "text-blue-200" : "text-gray-500"}`}>{plan.name}</h3>
                  <div className="flex items-baseline gap-1 mt-2">
                    <span className={`text-4xl font-black ${plan.popular ? "text-white" : "text-gray-900"}`}>{plan.price}</span>
                    <span className={`text-sm ${plan.popular ? "text-blue-300" : "text-gray-400"}`}>{plan.period}</span>
                  </div>
                  <p className={`text-sm mt-2 ${plan.popular ? "text-blue-200/70" : "text-gray-500"}`}>{plan.desc}</p>
                </div>
                <ul className="space-y-3 mb-8 flex-1">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2.5 text-sm">
                      <Check className={`h-4 w-4 shrink-0 mt-0.5 ${plan.popular ? "text-blue-400" : "text-emerald-500"}`} />
                      <span className={plan.popular ? "text-blue-100" : "text-gray-600"}>{f}</span>
                    </li>
                  ))}
                </ul>
                <Link
                  href={plan.href}
                  className={`block text-center font-bold text-sm py-3.5 rounded-xl transition-all ${
                    plan.popular
                      ? "bg-white text-blue-900 hover:bg-blue-50 shadow-lg"
                      : "bg-blue-600 text-white hover:bg-blue-700"
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
      <section className="py-20 sm:py-28 bg-gray-50">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-black text-gray-900">
              Negocios que ya usan Buleje
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {TESTIMONIALS.map((t) => (
              <div key={t.name} className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
                <div className="flex gap-0.5 mb-4">
                  {Array.from({ length: t.rating }).map((_, i) => (
                    <Star key={i} className="h-4 w-4 fill-amber-400 text-amber-400" />
                  ))}
                </div>
                <p className="text-gray-600 text-sm leading-relaxed mb-4">&ldquo;{t.text}&rdquo;</p>
                <div>
                  <p className="font-bold text-gray-900 text-sm">{t.name}</p>
                  <p className="text-xs text-gray-400">{t.business}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA FINAL ── */}
      <section className="py-20 sm:py-28 bg-gradient-to-br from-blue-900 via-blue-800 to-indigo-950">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 text-center">
          <h2 className="text-3xl sm:text-4xl font-black text-white mb-6">
            Digitaliza tu bodega hoy
          </h2>
          <p className="text-lg text-blue-200/70 mb-10">
            Unete a los negocios que ya venden mas con Buleje. Empieza gratis, sin compromiso.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/marketplace/apply"
              className="inline-flex items-center gap-2 bg-white text-blue-900 font-bold text-base px-8 py-4 rounded-xl hover:bg-blue-50 transition-all shadow-xl"
            >
              Registrar mi negocio gratis
              <ArrowRight className="h-5 w-5" />
            </Link>
            <Link
              href="https://wa.me/51916409675?text=Hola%2C%20quiero%20información%20sobre%20Buleje%20para%20mi%20negocio"
              className="inline-flex items-center gap-2 text-white font-semibold text-base px-8 py-4 rounded-xl border border-white/20 hover:bg-white/10 transition-all"
            >
              <MessageCircle className="h-5 w-5" />
              Hablar con un asesor
            </Link>
          </div>
        </div>
      </section>

      <Footer />
    </>
  );
}
