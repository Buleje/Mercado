import Link from "next/link";
import type { Metadata } from "next";
import {
  CheckCircle2,
  Clock,
  Truck,
  DollarSign,
  Smartphone,
  MapPin,
  Mail,
  MessageCircle,
  Phone,
  Store,
  Heart,
  Users,
  ShoppingCart,
} from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

export const metadata: Metadata = {
  title: "Acerca de Nosotros — Buleje | Tu bodega de confianza en Pucallpa",
  description:
    "Buleje es una bodega familiar en Pucallpa que ofrece productos frescos, delivery rápido y precios justos. Conoce nuestra historia, horarios y cómo contactarnos.",
  openGraph: {
    title: "Acerca de Nosotros — Buleje",
    description:
      "Bodega familiar en Pucallpa con productos frescos, delivery rápido y los mejores precios. Conoce nuestra historia.",
    type: "website",
    locale: "es_PE",
    url: "https://www.buleje.pe/about",
  },
};

const porQueElegirnos = [
  {
    icon: CheckCircle2,
    title: "Productos frescos",
    desc: "Recibimos mercadería fresca todos los días para que siempre encuentres lo mejor.",
    color: "text-emerald-600 dark:text-emerald-400",
    bg: "bg-emerald-50 dark:bg-emerald-900/20",
  },
  {
    icon: Truck,
    title: "Delivery rápido",
    desc: "Entregamos en menos de 30 minutos en toda nuestra zona de cobertura en Pucallpa.",
    color: "text-blue-600 dark:text-blue-400",
    bg: "bg-blue-50 dark:bg-blue-900/20",
  },
  {
    icon: DollarSign,
    title: "Precios justos",
    desc: "Los mejores precios de Pucallpa. Compramos directo al proveedor para darte el mejor precio.",
    color: "text-amber-600 dark:text-amber-400",
    bg: "bg-amber-50 dark:bg-amber-900/20",
  },
  {
    icon: Smartphone,
    title: "Paga como quieras",
    desc: "Acepta Yape, Plin o efectivo. Tú eliges cómo pagar, sin complicaciones.",
    color: "text-purple-600 dark:text-purple-400",
    bg: "bg-purple-50 dark:bg-purple-900/20",
  },
];

export default async function AboutPage() {
  // Fetch store settings for dynamic data (address, phone, etc.)
  let settings: Record<string, string | number | null> = {};
  try {
    const baseUrl = process.env.NEXT_PUBLIC_URL || process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
    const res = await fetch(`${baseUrl}/api/settings`, {
      cache: "no-store",
    });
    if (res.ok) settings = await res.json();
  } catch {
    // Settings unavailable — use defaults
  }

  const businessName = (settings.businessName as string) || "Buleje";
  const address = (settings.businessAddress as string) || "Pucallpa, Ucayali, Perú";
  const phone = (settings.businessPhone as string) || "";
  const email = (settings.businessEmail as string) || "";
  const storyText =
    (settings.storyText as string) ||
    "Buleje nació de la necesidad de ofrecer productos frescos y de calidad a los vecinos de Pucallpa. Comenzamos como una pequeña tienda familiar y hoy atendemos a cientos de familias con el mismo cariño del primer día. Cada producto que ofrecemos es seleccionado cuidadosamente para garantizar frescura y el mejor precio para nuestros clientes.";

  const weekdayHours = (settings.weekdayHours as string) || "6:00am - 10:00pm";
  const weekendHours = (settings.weekendHours as string) || "7:00am - 10:00pm";

  const whatsappNumber = phone.replace(/\D/g, "");
  const whatsappLink = whatsappNumber
    ? `https://wa.me/${whatsappNumber.startsWith("51") ? whatsappNumber : `51${whatsappNumber}`}?text=${encodeURIComponent("Hola, quisiera hacer un pedido")}`
    : null;

  const mapsLink = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;

  return (
    <>
      <Header />
      <main className="pt-20 sm:pt-24 min-h-screen bg-background" id="main-content">

        {/* ── HERO ────────────────────────────────────────────────────── */}
        <section
          className="relative overflow-hidden py-20 sm:py-28"
          style={{
            background: "linear-gradient(135deg, #1b4332 0%, #0f766e 50%, #0d9488 100%)",
          }}
        >
          <div className="absolute inset-0 opacity-10" style={{
            backgroundImage:
              "radial-gradient(circle at 30% 40%, #95d5b2 0%, transparent 50%), radial-gradient(circle at 70% 60%, #f97316 0%, transparent 40%)",
          }} />
          <div className="relative mx-auto max-w-4xl px-4 sm:px-6 text-center">
            <div className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold mb-6 bg-white/15 text-white/90 border border-white/20 backdrop-blur-sm">
              <Store className="h-4 w-4" />
              Bodega familiar
            </div>
            <h1 className="text-3xl sm:text-5xl lg:text-6xl font-extrabold text-white leading-tight mb-4">
              {businessName}
            </h1>
            <p className="text-lg sm:text-xl text-white/80 max-w-2xl mx-auto mb-8">
              Desde siempre sirviendo a Pucallpa con productos frescos,
              precios justos y el cariño de una familia.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <Link
                href="/tienda"
                className="inline-flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-bold bg-white text-[#0f766e] hover:bg-white/90 transition-all shadow-lg"
              >
                <ShoppingCart className="h-4 w-4" /> Ver Tienda
              </Link>
              {whatsappLink && (
                <a
                  href={whatsappLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-bold bg-white/10 text-white border border-white/20 hover:bg-white/20 transition-all"
                >
                  <MessageCircle className="h-4 w-4" /> Contáctanos
                </a>
              )}
            </div>
          </div>
        </section>

        {/* ── NUESTRA HISTORIA ────────────────────────────────────────── */}
        <section className="py-16 sm:py-20">
          <div className="mx-auto max-w-4xl px-4 sm:px-6">
            <div className="text-center mb-8">
              <div className="inline-flex items-center gap-2 mb-3">
                <Heart className="h-5 w-5 text-[#f97316]" />
                <h2 className="text-2xl sm:text-3xl font-extrabold text-foreground">
                  Nuestra Historia
                </h2>
              </div>
            </div>
            <div className="bg-white dark:bg-card rounded-2xl border border-gray-200 dark:border-card-border p-6 sm:p-10 shadow-sm">
              <p className="text-base sm:text-lg text-muted leading-relaxed text-center">
                {storyText}
              </p>
              <div className="mt-8 flex flex-wrap items-center justify-center gap-6 text-center">
                <div>
                  <p className="text-2xl sm:text-3xl font-extrabold text-[#0f766e]">500+</p>
                  <p className="text-xs text-muted font-medium mt-1">Productos</p>
                </div>
                <div className="h-10 w-px bg-gray-200 dark:bg-card-border hidden sm:block" />
                <div>
                  <p className="text-2xl sm:text-3xl font-extrabold text-[#0f766e]">100+</p>
                  <p className="text-xs text-muted font-medium mt-1">Familias atendidas</p>
                </div>
                <div className="h-10 w-px bg-gray-200 dark:bg-card-border hidden sm:block" />
                <div>
                  <p className="text-2xl sm:text-3xl font-extrabold text-[#f97316]">30 min</p>
                  <p className="text-xs text-muted font-medium mt-1">Delivery promedio</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── POR QUÉ ELEGIRNOS ──────────────────────────────────────── */}
        <section className="py-16 sm:py-20 bg-gray-50 dark:bg-surface/30">
          <div className="mx-auto max-w-7xl px-4 sm:px-6">
            <div className="text-center mb-10">
              <div className="inline-flex items-center gap-2 mb-3">
                <Users className="h-5 w-5 text-[#0f766e]" />
                <h2 className="text-2xl sm:text-3xl font-extrabold text-foreground">
                  Por qué elegirnos
                </h2>
              </div>
              <p className="text-muted max-w-lg mx-auto">
                Todo lo que necesitas para tu hogar, con la confianza de siempre.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
              {porQueElegirnos.map((item) => (
                <div
                  key={item.title}
                  className="rounded-2xl border border-gray-200 dark:border-card-border bg-white dark:bg-card p-6 hover:shadow-md transition-shadow text-center"
                >
                  <div className={`inline-flex items-center justify-center w-12 h-12 rounded-xl ${item.bg} mb-4`}>
                    <item.icon className={`h-6 w-6 ${item.color}`} />
                  </div>
                  <h3 className="font-bold text-foreground mb-2">{item.title}</h3>
                  <p className="text-sm text-muted leading-relaxed">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── HORARIOS ────────────────────────────────────────────────── */}
        <section className="py-16 sm:py-20">
          <div className="mx-auto max-w-2xl px-4 sm:px-6">
            <div className="text-center mb-8">
              <div className="inline-flex items-center gap-2 mb-3">
                <Clock className="h-5 w-5 text-[#0f766e]" />
                <h2 className="text-2xl sm:text-3xl font-extrabold text-foreground">
                  Horarios de atención
                </h2>
              </div>
            </div>
            <div className="bg-white dark:bg-card rounded-2xl border border-gray-200 dark:border-card-border p-6 sm:p-8 shadow-sm">
              <div className="space-y-4">
                <div className="flex items-center justify-between py-3 border-b border-gray-100 dark:border-card-border">
                  <span className="font-semibold text-foreground">Lunes a Sábado</span>
                  <span className="text-sm font-bold text-[#0f766e] bg-emerald-50 dark:bg-emerald-900/20 px-3 py-1 rounded-full">
                    {weekdayHours}
                  </span>
                </div>
                <div className="flex items-center justify-between py-3">
                  <span className="font-semibold text-foreground">Domingos</span>
                  <span className="text-sm font-bold text-[#f97316] bg-amber-50 dark:bg-amber-900/20 px-3 py-1 rounded-full">
                    {weekendHours}
                  </span>
                </div>
              </div>
              <p className="text-xs text-muted text-center mt-4">
                Horarios pueden variar en feriados. Consulta por WhatsApp.
              </p>
            </div>
          </div>
        </section>

        {/* ── CONTACTO ────────────────────────────────────────────────── */}
        <section className="py-16 sm:py-20 bg-gray-50 dark:bg-surface/30">
          <div className="mx-auto max-w-4xl px-4 sm:px-6">
            <div className="text-center mb-10">
              <div className="inline-flex items-center gap-2 mb-3">
                <Phone className="h-5 w-5 text-[#0f766e]" />
                <h2 className="text-2xl sm:text-3xl font-extrabold text-foreground">
                  Contacto
                </h2>
              </div>
              <p className="text-muted max-w-lg mx-auto">
                Estamos para ayudarte. Escríbenos o visítanos.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {/* Dirección */}
              <a
                href={mapsLink}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-2xl border border-gray-200 dark:border-card-border bg-white dark:bg-card p-6 hover:shadow-md transition-shadow text-center group"
              >
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-red-50 dark:bg-red-900/20 mb-4">
                  <MapPin className="h-6 w-6 text-red-500" />
                </div>
                <h3 className="font-bold text-foreground mb-1">Dirección</h3>
                <p className="text-sm text-muted leading-relaxed group-hover:text-primary transition-colors">
                  {address}
                </p>
                <p className="text-xs text-primary font-semibold mt-2">Ver en Google Maps</p>
              </a>

              {/* WhatsApp */}
              {phone && (
                <a
                  href={whatsappLink || "#"}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-2xl border border-gray-200 dark:border-card-border bg-white dark:bg-card p-6 hover:shadow-md transition-shadow text-center group"
                >
                  <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 mb-4">
                    <MessageCircle className="h-6 w-6 text-emerald-600" />
                  </div>
                  <h3 className="font-bold text-foreground mb-1">WhatsApp</h3>
                  <p className="text-sm text-muted leading-relaxed">{phone}</p>
                  <p className="text-xs text-emerald-600 font-semibold mt-2">Enviar mensaje</p>
                </a>
              )}

              {/* Email */}
              {email && (
                <a
                  href={`mailto:${email}`}
                  className="rounded-2xl border border-gray-200 dark:border-card-border bg-white dark:bg-card p-6 hover:shadow-md transition-shadow text-center group"
                >
                  <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-blue-50 dark:bg-blue-900/20 mb-4">
                    <Mail className="h-6 w-6 text-blue-600" />
                  </div>
                  <h3 className="font-bold text-foreground mb-1">Email</h3>
                  <p className="text-sm text-muted leading-relaxed">{email}</p>
                  <p className="text-xs text-blue-600 font-semibold mt-2">Enviar correo</p>
                </a>
              )}
            </div>
          </div>
        </section>

        {/* ── MAPA / UBICACIÓN ────────────────────────────────────────── */}
        <section className="py-16 sm:py-20">
          <div className="mx-auto max-w-4xl px-4 sm:px-6">
            <div className="text-center mb-8">
              <div className="inline-flex items-center gap-2 mb-3">
                <MapPin className="h-5 w-5 text-[#0f766e]" />
                <h2 className="text-2xl sm:text-3xl font-extrabold text-foreground">
                  Encuéntranos
                </h2>
              </div>
            </div>
            <div className="bg-white dark:bg-card rounded-2xl border border-gray-200 dark:border-card-border p-6 sm:p-8 shadow-sm text-center">
              <p className="text-muted mb-4">
                {address}
              </p>
              <a
                href={mapsLink}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-bold bg-[#0f766e] text-white hover:bg-[#0d5f58] transition-all shadow-md"
              >
                <MapPin className="h-4 w-4" /> Abrir en Google Maps
              </a>
            </div>
          </div>
        </section>

        {/* ── CTA FINAL ───────────────────────────────────────────────── */}
        <section className="py-12 text-white text-center" style={{ background: "linear-gradient(135deg, #0f766e 0%, #0d9488 100%)" }}>
          <div className="mx-auto max-w-2xl px-4 sm:px-6">
            <ShoppingCart className="h-10 w-10 mx-auto mb-3 opacity-80" />
            <h2 className="text-2xl font-extrabold mb-2">Haz tu pedido ahora</h2>
            <p className="text-white/70 mb-6 text-sm">
              Más de 500 productos con delivery en Pucallpa. Paga con Yape o efectivo.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <Link
                href="/tienda"
                className="inline-flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-bold bg-white text-[#0f766e] hover:bg-white/90 transition-all shadow-md"
              >
                <ShoppingCart className="h-4 w-4" /> Explorar la tienda
              </Link>
              {whatsappLink && (
                <a
                  href={whatsappLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-bold bg-white/15 border border-white/25 hover:bg-white/25 transition-all"
                >
                  <MessageCircle className="h-4 w-4" /> Pedir por WhatsApp
                </a>
              )}
            </div>
          </div>
        </section>

      </main>
      <Footer />
    </>
  );
}
