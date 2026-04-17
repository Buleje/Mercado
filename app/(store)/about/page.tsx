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
  ArrowUpRight,
  type LucideIcon,
} from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

export const metadata: Metadata = {
  title: "Acerca de Nosotros — Buleje | Software ERP para Bodegas",
  description:
    "Buleje es un software ERP para bodegas y tiendas de todo el Peru. Inventario, POS, delivery, fiado digital y facturacion SUNAT. Creado en Pucallpa.",
  openGraph: {
    title: "Acerca de Nosotros — Buleje",
    description:
      "Software ERP para bodegas creado en Pucallpa. Inventario, delivery y facturacion SUNAT para todo el Peru.",
    type: "website",
    locale: "es_PE",
    url: "https://www.buleje.pe/about",
  },
};

const porQueElegirnos: { Icon: LucideIcon; title: string; desc: string }[] = [
  {
    Icon: CheckCircle2,
    title: "Productos frescos",
    desc: "Recibimos mercadería fresca todos los días para que siempre encuentres lo mejor.",
  },
  {
    Icon: Truck,
    title: "Delivery rápido",
    desc: "Entregamos en menos de 30 minutos en toda nuestra zona de cobertura.",
  },
  {
    Icon: DollarSign,
    title: "Precios justos",
    desc: "Los mejores precios. Compramos directo al proveedor para darte el mejor precio.",
  },
  {
    Icon: Smartphone,
    title: "Paga como quieras",
    desc: "Acepta Yape, Plin o efectivo. Tú eliges cómo pagar, sin complicaciones.",
  },
];

function Kicker({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.25em] text-gray-400 mb-3">
      {children}
    </span>
  );
}

export default async function AboutPage() {
  let settings: Record<string, string | number | null> = {};
  try {
    const { SettingsDB } = await import("@/lib/db/settings.db");
    const { headers } = await import("next/headers");
    const hdrs = await headers();
    const tenantId = hdrs.get("x-tenant-id") ?? "main";
    const data = await SettingsDB.get(tenantId);
    settings = data as unknown as Record<string, string | number | null>;
  } catch {
    /* defaults */
  }

  const businessName = (settings.businessName as string) || "Buleje";
  const address = (settings.businessAddress as string) || "Ucayali, Perú";
  const phone = (settings.businessPhone as string) || "";
  const email = (settings.businessEmail as string) || "";
  const storyText =
    (settings.storyText as string) ||
    "Buleje nació de la necesidad de ofrecer productos frescos y de calidad a nuestros vecinos. Comenzamos como una pequeña tienda familiar y hoy atendemos a cientos de familias con el mismo cariño del primer día. Cada producto que ofrecemos es seleccionado cuidadosamente para garantizar frescura y el mejor precio para nuestros clientes.";

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
      <main className="pt-20 sm:pt-24 min-h-screen bg-white dark:bg-gray-950" id="main-content">

        {/* ── HERO ─ editorial dark ─ */}
        <section
          className="relative overflow-hidden py-20 sm:py-28 lg:py-32"
          style={{ background: "#060a0d" }}
        >
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute -top-24 -left-24 h-100 w-100 rounded-full bg-white/5 blur-[120px]" />
          </div>
          <div className="relative mx-auto max-w-4xl px-4 sm:px-6 text-center">
            <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.25em] text-white/55 mb-6">
              <Store className="h-3 w-3" strokeWidth={1.75} aria-hidden />
              Powered by Buleje
            </span>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-white leading-[1.05] tracking-[-0.02em]">
              {businessName}
            </h1>
            <p className="mt-5 text-base sm:text-lg text-white/60 max-w-2xl mx-auto leading-relaxed">
              Desde siempre sirviendo a nuestros vecinos con productos frescos, precios justos y el cariño de una familia.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Link
                href="/tienda"
                className="inline-flex items-center gap-2 bg-white text-gray-900 font-bold px-6 py-3 rounded-full text-sm transition-colors hover:bg-gray-100"
              >
                <ShoppingCart className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                Ver Tienda
              </Link>
              {whatsappLink && (
                <a
                  href={whatsappLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 bg-transparent text-white font-bold px-6 py-3 rounded-full text-sm border border-white/20 hover:bg-white/10 transition-colors"
                >
                  <MessageCircle className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                  Contáctanos
                </a>
              )}
            </div>
          </div>
        </section>

        {/* ── HISTORIA ─ */}
        <section className="py-16 sm:py-24 border-b border-gray-200 dark:border-gray-800">
          <div className="mx-auto max-w-4xl px-4 sm:px-6">
            <div className="mb-10 max-w-2xl">
              <Kicker>
                <Heart className="h-3 w-3" strokeWidth={1.75} aria-hidden />
                Historia
              </Kicker>
              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-[-0.02em] text-gray-900 dark:text-white leading-[1.05]">
                Nuestra historia
              </h2>
            </div>
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-8 sm:p-12">
              <p className="text-base sm:text-lg text-gray-600 dark:text-gray-300 leading-relaxed">
                {storyText}
              </p>
              <div className="mt-10 grid grid-cols-3 gap-0 border-t border-gray-200 dark:border-gray-800 pt-8">
                {[
                  { value: "500+", label: "Productos" },
                  { value: "100+", label: "Familias atendidas" },
                  { value: "30 min", label: "Delivery promedio" },
                ].map((s, i) => (
                  <div
                    key={s.label}
                    className={i > 0 ? "border-l border-gray-200 dark:border-gray-800 pl-4" : ""}
                  >
                    <p className="text-2xl sm:text-3xl font-extrabold text-gray-900 dark:text-white tabular-nums tracking-tight">
                      {s.value}
                    </p>
                    <p className="mt-2 text-[10px] font-bold uppercase tracking-[0.18em] text-gray-400">
                      {s.label}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ── POR QUÉ ELEGIRNOS ─ */}
        <section className="py-16 sm:py-24 bg-gray-50 dark:bg-gray-900/40 border-b border-gray-200 dark:border-gray-800">
          <div className="mx-auto max-w-7xl px-4 sm:px-6">
            <div className="mb-12 max-w-2xl">
              <Kicker>
                <Users className="h-3 w-3" strokeWidth={1.75} aria-hidden />
                Por qué elegirnos
              </Kicker>
              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-[-0.02em] text-gray-900 dark:text-white leading-[1.05]">
                Tu bodega, tu confianza
              </h2>
              <p className="mt-3 text-gray-500 dark:text-gray-400 leading-relaxed max-w-lg">
                Todo lo que necesitas para tu hogar, con la cercanía del barrio.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
              {porQueElegirnos.map((item) => {
                const IIcon = item.Icon;
                return (
                  <div
                    key={item.title}
                    className="group rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6 hover:border-gray-900 dark:hover:border-gray-500 transition-colors"
                  >
                    <div className="h-10 w-10 rounded-lg bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 flex items-center justify-center text-gray-700 dark:text-gray-200 mb-5">
                      <IIcon className="h-4 w-4" strokeWidth={1.5} aria-hidden />
                    </div>
                    <h3 className="text-base font-extrabold tracking-tight text-gray-900 dark:text-white">
                      {item.title}
                    </h3>
                    <p className="mt-2 text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
                      {item.desc}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* ── HORARIOS ─ */}
        <section className="py-16 sm:py-24 border-b border-gray-200 dark:border-gray-800">
          <div className="mx-auto max-w-3xl px-4 sm:px-6">
            <div className="mb-10">
              <Kicker>
                <Clock className="h-3 w-3" strokeWidth={1.75} aria-hidden />
                Horarios
              </Kicker>
              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-[-0.02em] text-gray-900 dark:text-white leading-[1.05]">
                Horarios de atención
              </h2>
            </div>
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
              <div className="flex items-center justify-between py-5 px-6 border-b border-gray-200 dark:border-gray-800">
                <span className="text-sm font-extrabold text-gray-900 dark:text-white tracking-tight">Lunes a Sábado</span>
                <span className="text-sm font-bold text-gray-900 dark:text-white tabular-nums">
                  {weekdayHours}
                </span>
              </div>
              <div className="flex items-center justify-between py-5 px-6">
                <span className="text-sm font-extrabold text-gray-900 dark:text-white tracking-tight">Domingos</span>
                <span className="text-sm font-bold text-gray-900 dark:text-white tabular-nums">
                  {weekendHours}
                </span>
              </div>
            </div>
            <p className="text-xs text-gray-400 mt-4">
              Horarios pueden variar en feriados. Consulta por WhatsApp.
            </p>
          </div>
        </section>

        {/* ── CONTACTO ─ */}
        <section className="py-16 sm:py-24 bg-gray-50 dark:bg-gray-900/40 border-b border-gray-200 dark:border-gray-800">
          <div className="mx-auto max-w-5xl px-4 sm:px-6">
            <div className="mb-12 max-w-2xl">
              <Kicker>
                <Phone className="h-3 w-3" strokeWidth={1.75} aria-hidden />
                Contacto
              </Kicker>
              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-[-0.02em] text-gray-900 dark:text-white leading-[1.05]">
                Estamos para ayudarte
              </h2>
              <p className="mt-3 text-gray-500 dark:text-gray-400 leading-relaxed max-w-lg">
                Escríbenos o visítanos cuando quieras.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              <a
                href={mapsLink}
                target="_blank"
                rel="noopener noreferrer"
                className="group rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6 hover:border-gray-900 dark:hover:border-gray-500 transition-colors"
              >
                <div className="flex items-start justify-between mb-5">
                  <div className="h-10 w-10 rounded-lg bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 flex items-center justify-center text-gray-700 dark:text-gray-200">
                    <MapPin className="h-4 w-4" strokeWidth={1.5} aria-hidden />
                  </div>
                  <ArrowUpRight className="h-4 w-4 text-gray-300 dark:text-gray-600 group-hover:text-gray-900 dark:group-hover:text-white transition-colors" strokeWidth={1.75} aria-hidden />
                </div>
                <h3 className="text-base font-extrabold tracking-tight text-gray-900 dark:text-white">Dirección</h3>
                <p className="mt-2 text-sm text-gray-500 dark:text-gray-400 leading-relaxed">{address}</p>
                <p className="mt-4 text-[10px] font-bold uppercase tracking-[0.2em] text-gray-400">Google Maps</p>
              </a>

              {phone && (
                <a
                  href={whatsappLink || "#"}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6 hover:border-gray-900 dark:hover:border-gray-500 transition-colors"
                >
                  <div className="flex items-start justify-between mb-5">
                    <div className="h-10 w-10 rounded-lg bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 flex items-center justify-center text-gray-700 dark:text-gray-200">
                      <MessageCircle className="h-4 w-4" strokeWidth={1.5} aria-hidden />
                    </div>
                    <ArrowUpRight className="h-4 w-4 text-gray-300 dark:text-gray-600 group-hover:text-gray-900 dark:group-hover:text-white transition-colors" strokeWidth={1.75} aria-hidden />
                  </div>
                  <h3 className="text-base font-extrabold tracking-tight text-gray-900 dark:text-white">WhatsApp</h3>
                  <p className="mt-2 text-sm text-gray-500 dark:text-gray-400 leading-relaxed tabular-nums">{phone}</p>
                  <p className="mt-4 text-[10px] font-bold uppercase tracking-[0.2em] text-gray-400">Enviar mensaje</p>
                </a>
              )}

              {email && (
                <a
                  href={`mailto:${email}`}
                  className="group rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6 hover:border-gray-900 dark:hover:border-gray-500 transition-colors"
                >
                  <div className="flex items-start justify-between mb-5">
                    <div className="h-10 w-10 rounded-lg bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 flex items-center justify-center text-gray-700 dark:text-gray-200">
                      <Mail className="h-4 w-4" strokeWidth={1.5} aria-hidden />
                    </div>
                    <ArrowUpRight className="h-4 w-4 text-gray-300 dark:text-gray-600 group-hover:text-gray-900 dark:group-hover:text-white transition-colors" strokeWidth={1.75} aria-hidden />
                  </div>
                  <h3 className="text-base font-extrabold tracking-tight text-gray-900 dark:text-white">Email</h3>
                  <p className="mt-2 text-sm text-gray-500 dark:text-gray-400 leading-relaxed">{email}</p>
                  <p className="mt-4 text-[10px] font-bold uppercase tracking-[0.2em] text-gray-400">Enviar correo</p>
                </a>
              )}
            </div>
          </div>
        </section>

        {/* ── UBICACIÓN ─ */}
        <section className="py-16 sm:py-24 border-b border-gray-200 dark:border-gray-800">
          <div className="mx-auto max-w-3xl px-4 sm:px-6 text-center">
            <Kicker>
              <MapPin className="h-3 w-3" strokeWidth={1.75} aria-hidden />
              Ubicación
            </Kicker>
            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-[-0.02em] text-gray-900 dark:text-white">
              Encuéntranos
            </h2>
            <p className="mt-4 text-gray-500 dark:text-gray-400 leading-relaxed">
              {address}
            </p>
            <a
              href={mapsLink}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-8 inline-flex items-center gap-2 bg-gray-900 dark:bg-white text-white dark:text-gray-900 font-bold px-6 py-3 rounded-full text-sm transition-colors hover:bg-gray-800 dark:hover:bg-gray-100"
            >
              <MapPin className="h-4 w-4" strokeWidth={1.75} aria-hidden />
              Abrir en Google Maps
            </a>
          </div>
        </section>

        {/* ── CTA FINAL ─ editorial dark ─ */}
        <section className="py-20 sm:py-24 text-white text-center" style={{ background: "#060a0d" }}>
          <div className="mx-auto max-w-3xl px-4 sm:px-6">
            <Kicker>
              <ShoppingCart className="h-3 w-3 text-white/55" strokeWidth={1.75} aria-hidden />
              <span className="text-white/55">Haz tu pedido</span>
            </Kicker>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-[-0.02em] text-white leading-[1.05]">
              Más de 500 productos con delivery
            </h2>
            <p className="mt-4 text-white/60 max-w-xl mx-auto leading-relaxed">
              Paga con Yape o efectivo. Entrega rápida a toda la zona.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Link
                href="/tienda"
                className="inline-flex items-center gap-2 bg-white text-gray-900 font-bold px-6 py-3 rounded-full text-sm transition-colors hover:bg-gray-100"
              >
                <ShoppingCart className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                Explorar la tienda
              </Link>
              {whatsappLink && (
                <a
                  href={whatsappLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 bg-transparent text-white font-bold px-6 py-3 rounded-full text-sm border border-white/20 hover:bg-white/10 transition-colors"
                >
                  <MessageCircle className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                  Pedir por WhatsApp
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
