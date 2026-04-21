"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import {
  Store,
  MapPin,
  Phone,
  Clock,
  MessageCircle,
  Truck,
  ShieldCheck,
  Star,
  Mail,
  ArrowRight,
  CheckCircle2,
  Facebook,
  Instagram,
  CreditCard,
  Wallet,
} from "lucide-react";
import { useSettings } from "@/contexts/settings-context";
import { BulejeWordmark } from "@/components/ui-system/illustrations";


// ── Columna 1: Marketplace ──────────────────────────────────────────────
const marketplaceLinks = [
  { href: "/marketplace", label: "Explorar marketplace" },
  { href: "/marketplace/explorar", label: "Catálogo completo" },
  { href: "/marketplace/comparar", label: "Comparar productos" },
  { href: "/marketplace/gift-cards", label: "Gift Cards" },
  { href: "/marketplace/en-vivo", label: "Buleje en Vivo" },
  { href: "/marketplace/ofertas", label: "Ofertas flash" },
  { href: "/recetas", label: "Recetas" },
  { href: "/asistente", label: "Asistente IA" },
];

const categoryLinks = [
  { href: "/tienda/categoria/abarrotes", label: "Abarrotes" },
  { href: "/tienda/categoria/bebidas", label: "Bebidas" },
  { href: "/tienda/categoria/carnes", label: "Carne y Pollo" },
  { href: "/tienda/categoria/lacteos", label: "Lácteos" },
];

// ── Columna 2: Mi cuenta ────────────────────────────────────────────────
const cuentaLinks = [
  { href: "/cuenta", label: "Resumen" },
  { href: "/cuenta/pedidos", label: "Mis pedidos" },
  { href: "/cuenta/suscripciones", label: "Bodega al Mes" },
  { href: "/cuenta/socio-buleje", label: "Socio Buleje" },
  { href: "/cuenta/cupones", label: "Cupones" },
  { href: "/cuenta/gift-cards", label: "Gift Cards" },
  { href: "/marketplace/favoritos", label: "Favoritos" },
  { href: "/cuenta/notificaciones", label: "Notificaciones" },
];

// ── Columna 3: Vendé en Buleje ──────────────────────────────────────────
const businessLinks = [
  { href: "/vender", label: "Vendé en Buleje" },
  { href: "/vender/registro", label: "Registrá tu tienda" },
  { href: "/planes", label: "Planes y precios" },
  { href: "/vender/mi-tienda", label: "Seller Central" },
  { href: "/negocios", label: "Software para bodegas" },
  { href: "/ayuda", label: "Soporte vendedor" },
];

// ── Columna 4: Ayuda ────────────────────────────────────────────────────
const helpLinks = [
  { href: "/ayuda", label: "Centro de ayuda" },
  { href: "/ayuda#guias", label: "Guías paso a paso" },
  { href: "/ayuda#faq", label: "Preguntas frecuentes" },
  { href: "/tracking", label: "Seguí tu pedido" },
  { href: "/descubri", label: "Qué hay de nuevo" },
  { href: "/about", label: "Acerca de nosotros" },
];

function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

const WHATSAPP_PHONE = process.env.NEXT_PUBLIC_WHATSAPP_PHONE ?? "51916409675";

function getPageContextMessage(pathname: string): string {
  if (pathname.startsWith("/tienda/producto/")) return "Hola, quiero consultar sobre un producto que vi en la tienda.";
  if (pathname.startsWith("/tienda/categoria/")) return "Hola, estoy viendo una categoría y tengo una consulta.";
  if (pathname.startsWith("/tienda")) return "Hola, estoy viendo la tienda y necesito ayuda.";
  if (pathname.startsWith("/recetas")) return "Hola, vi una receta y quiero consultar sobre los ingredientes.";
  if (pathname.startsWith("/cuenta") || pathname.startsWith("/mis-pedidos")) return "Hola, tengo una consulta sobre mi cuenta o pedidos.";
  if (pathname.startsWith("/puntos")) return "Hola, quiero saber más sobre mis puntos de fidelidad.";
  return "Hola, quiero hacer una consulta sobre la bodega.";
}

function WhatsAppContactSection({
  deliveryConfig,
  storeTheme,
}: {
  deliveryConfig: { hours: { day: string; open: string; close: string; enabled: boolean }[] };
  storeTheme: { whatsapp?: string; phone?: string; name?: string } | null;
  businessName: string;
}) {
  const pathname = usePathname();
  const [showPulse, setShowPulse] = useState(false);

  useEffect(() => {
    const visits = parseInt(sessionStorage.getItem("buleje-wa-visits") ?? "0", 10);
    if (visits < 3) {
      setShowPulse(true);
      sessionStorage.setItem("buleje-wa-visits", String(visits + 1));
    }
  }, []);

  const phone = storeTheme?.whatsapp?.replace(/\D/g, "") || storeTheme?.phone?.replace(/\D/g, "") || WHATSAPP_PHONE;
  const message = encodeURIComponent(getPageContextMessage(pathname));
  const waUrl = `https://wa.me/${phone}?text=${message}`;

  const DAY_NAMES = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
  const todayName = DAY_NAMES[new Date().getDay()];
  const todayEntry = deliveryConfig.hours.find((h) => h.day === todayName);
  const isOpenNow = (() => {
    if (!todayEntry?.enabled) return false;
    const now = new Date();
    const [oh, om] = todayEntry.open.split(":").map(Number);
    const [ch, cm] = todayEntry.close.split(":").map(Number);
    const mins = now.getHours() * 60 + now.getMinutes();
    return mins >= oh * 60 + om && mins <= ch * 60 + cm;
  })();

  const hoursLabel = todayEntry?.enabled
    ? `Hoy: ${todayEntry.open} – ${todayEntry.close}`
    : "Hoy: cerrado";

  return (
    <div className="border-b border-white/10">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-5">
          <div className="text-left">
            <span className="inline-flex items-center gap-1.5 text-[length:var(--ts-2xs)] font-bold uppercase tracking-[0.25em] text-white/50 mb-2">
              <MessageCircle className="h-3 w-3" strokeWidth={1.75} aria-hidden />
              Atención directa
            </span>
            <h3 className="text-xl sm:text-2xl font-extrabold tracking-[-0.02em] text-white">
              Chatea con nosotros
            </h3>
            <p className="text-white/55 text-sm mt-1 max-w-md leading-relaxed">
              Escríbenos por WhatsApp y te atendemos al instante.
            </p>
            <div className="flex items-center gap-4 mt-3">
              <span className="flex items-center gap-1.5 text-xs text-white/45 tabular-nums">
                <Clock className="h-3 w-3" strokeWidth={1.75} aria-hidden />
                {hoursLabel}
              </span>
              {isOpenNow ? (
                <span className="flex items-center gap-1.5 text-[length:var(--ts-2xs)] font-bold uppercase tracking-[0.18em] text-emerald-300">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Abierto
                </span>
              ) : (
                <span className="flex items-center gap-1.5 text-[length:var(--ts-2xs)] font-bold uppercase tracking-[0.18em] text-white/40">
                  <span className="h-1.5 w-1.5 rounded-full bg-white/30" />
                  Cerrado
                </span>
              )}
            </div>
          </div>

          <a
            href={waUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="relative inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-bold text-gray-900 transition-all hover:bg-gray-100 active:scale-[0.98]"
          >
            {showPulse && (
              <span className="absolute inset-0 rounded-full animate-ping bg-white/30 pointer-events-none" style={{ animationDuration: "2s" }} />
            )}
            <WhatsAppIcon className="h-4 w-4" />
            Iniciar chat
          </a>
        </div>
      </div>
    </div>
  );
}

export default function Footer() {
  const year = new Date().getFullYear();
  const { homepage: hp, deliveryConfig, storeTheme } = useSettings();
  const [nlEmail, setNlEmail] = useState("");
  const [nlStatus, setNlStatus] = useState<"idle" | "loading" | "success" | "error">("idle");

  const DAY_NAMES = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
  const todayName = DAY_NAMES[new Date().getDay()];
  const todayEntry = deliveryConfig.hours.find((h) => h.day === todayName);
  const hoursLabel = todayEntry?.enabled ? `Hoy: ${todayEntry.open} – ${todayEntry.close}` : "Hoy: cerrado";

  const perks = [
    { Icon: Truck, label: "Delivery Gratis" },
    { Icon: MessageCircle, label: "Pedidos por WhatsApp" },
    { Icon: Clock, label: hoursLabel },
    { Icon: ShieldCheck, label: "Pago con Yape o Efectivo" },
  ];

  return (
    <footer className="bg-[#060a0d] text-white border-t border-white/10">
      <WhatsAppContactSection deliveryConfig={deliveryConfig} storeTheme={storeTheme} businessName={hp.footerWhatsApp} />

      {/* Perks */}
      <div className="border-b border-white/10">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {perks.map((perk) => {
              const PIcon = perk.Icon;
              return (
                <div
                  key={perk.label}
                  className="flex items-center gap-3"
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/15 bg-white/5">
                    <PIcon className="h-3.5 w-3.5 text-white/70" strokeWidth={1.75} aria-hidden />
                  </div>
                  <span className="text-xs font-medium text-white/70 tabular-nums">{perk.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Main Footer — Mega footer rediseñado (5 columnas ricas) */}
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-14 sm:py-16">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-8 lg:gap-10">
          {/* ── Columna 1: Marketplace ── */}
          <nav aria-label="Marketplace">
            <h3 className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[0.25em] text-white/40 mb-5">
              Marketplace
            </h3>
            <ul className="space-y-2.5">
              {marketplaceLinks.map((link) => (
                <li key={link.label}>
                  <a
                    href={link.href}
                    className="text-white/65 hover:text-white transition-colors text-sm"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
            <h4 className="mt-6 text-[length:var(--ts-2xs)] font-bold uppercase tracking-[0.25em] text-white/40 mb-3">
              Categorías
            </h4>
            <ul className="space-y-2">
              {categoryLinks.map((link) => (
                <li key={link.label}>
                  <a
                    href={link.href}
                    className="text-white/55 hover:text-white transition-colors text-xs"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          {/* ── Columna 2: Mi cuenta ── */}
          <nav aria-label="Mi cuenta">
            <h3 className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[0.25em] text-white/40 mb-5">
              Mi cuenta
            </h3>
            <ul className="space-y-2.5">
              {cuentaLinks.map((link) => (
                <li key={link.label}>
                  <a
                    href={link.href}
                    className="text-white/65 hover:text-white transition-colors text-sm"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          {/* ── Columna 3: Vendé en Buleje ── */}
          <nav aria-label="Vendé en Buleje">
            <h3 className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[0.25em] text-white/40 mb-5">
              Vendé en Buleje
            </h3>
            <ul className="space-y-2.5">
              {businessLinks.map((link) => (
                <li key={link.label}>
                  <a
                    href={link.href}
                    className="text-white/65 hover:text-white transition-colors text-sm"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
            <a
              href="/vender"
              className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/5 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-white/10 transition-colors"
            >
              <Store className="h-3 w-3" strokeWidth={1.75} aria-hidden />
              Abrí tu tienda
            </a>
          </nav>

          {/* ── Columna 4: Ayuda ── */}
          <nav aria-label="Ayuda">
            <h3 className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[0.25em] text-white/40 mb-5">
              Ayuda
            </h3>
            <ul className="space-y-2.5">
              {helpLinks.map((link) => (
                <li key={link.label}>
                  <a
                    href={link.href}
                    className="text-white/65 hover:text-white transition-colors text-sm"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
            <a
              href={`${storeTheme?.whatsapp || hp.footerWhatsApp}${(storeTheme?.whatsapp || hp.footerWhatsApp).includes("?") ? "&" : "?"}text=${encodeURIComponent("Hola Buleje, necesito ayuda")}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/5 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-white/10 transition-colors"
            >
              <MessageCircle className="h-3 w-3" strokeWidth={1.75} aria-hidden />
              WhatsApp
            </a>
          </nav>

          {/* ── Columna 5: Identidad ── */}
          <div className="col-span-2 sm:col-span-3 lg:col-span-1">
            <div className="mb-4 flex items-center gap-2 text-white">
              <BulejeWordmark
                size={32}
                strokeWidth={1.75}
                textSize={16}
                className="text-white"
              />
            </div>
            <p className="text-white/50 text-sm leading-relaxed mb-3">
              {storeTheme?.description || hp.footerDescription}
            </p>
            <div className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[length:var(--ts-2xs)] font-bold uppercase tracking-[0.2em] text-white/70 mb-4">
              <MapPin className="h-3 w-3 text-white/60" strokeWidth={1.75} aria-hidden />
              Pucallpa · Ucayali
            </div>
            <div className="flex items-center gap-1.5 mb-4">
              {[...Array(5)].map((_, i) => (
                <Star key={i} className="h-3 w-3 fill-white text-white" strokeWidth={1.5} aria-hidden />
              ))}
              <span className="text-white/55 text-[length:var(--ts-2xs)] ml-1.5 tabular-nums">{hp.footerRating}</span>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <a
                href={`${storeTheme?.whatsapp || hp.footerWhatsApp}${(storeTheme?.whatsapp || hp.footerWhatsApp).includes("?") ? "&" : "?"}text=${encodeURIComponent(`Hola ${storeTheme?.name || "Buleje"}, quiero hacer un pedido`)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-semibold text-white/70 bg-white/5 hover:bg-white/10 border border-white/10 transition-colors"
                aria-label="WhatsApp"
              >
                <MessageCircle className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
                WhatsApp
              </a>
              <a
                href={hp.footerFacebook}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-semibold text-white/70 bg-white/5 hover:bg-white/10 border border-white/10 transition-colors"
                aria-label="Facebook"
              >
                <Facebook className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
                Facebook
              </a>
              <a
                href={hp.footerInstagram}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-semibold text-white/70 bg-white/5 hover:bg-white/10 border border-white/10 transition-colors"
                aria-label="Instagram"
              >
                <Instagram className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
                Instagram
              </a>
            </div>
            <div className="mt-5 space-y-2">
              <div className="flex items-center gap-2.5 text-xs text-white/55">
                <Phone className="h-3.5 w-3.5 text-white/55 shrink-0" strokeWidth={1.75} aria-hidden />
                <a
                  href={`tel:${storeTheme?.phone ?? "+51916409675"}`}
                  className="tabular-nums hover:text-white/80"
                >
                  {storeTheme?.phone ?? "916 409 675"}
                </a>
              </div>
              <div className="flex items-center gap-2.5 text-xs text-white/55">
                <Clock className="h-3.5 w-3.5 text-white/55 shrink-0" strokeWidth={1.75} aria-hidden />
                <span className="tabular-nums">{hoursLabel}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Newsletter */}
      <div className="border-t border-white/10">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-sm font-extrabold tracking-tight text-white flex items-center gap-2">
                <Mail className="h-3.5 w-3.5 text-white/55" strokeWidth={1.75} aria-hidden />
                Recibe ofertas exclusivas
              </h3>
              <p className="text-xs text-white/45 mt-1 leading-relaxed">Promociones, nuevos productos y descuentos directo a tu correo.</p>
            </div>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!nlEmail.trim() || nlStatus === "loading") return;
                setNlStatus("loading");
                try {
                  const res = await fetch("/api/newsletter", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ email: nlEmail.trim() }),
                  });
                  setNlStatus(res.ok ? "success" : "error");
                  if (res.ok) setNlEmail("");
                } catch { setNlStatus("error"); }
              }}
              className="flex items-center gap-2 w-full sm:w-auto"
            >
              {nlStatus === "success" ? (
                <div className="flex items-center gap-2 text-sm text-emerald-300 font-bold">
                  <CheckCircle2 className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                  <span>Suscrito correctamente.</span>
                </div>
              ) : (
                <>
                  <input
                    type="email"
                    required
                    value={nlEmail}
                    onChange={(e) => setNlEmail(e.target.value)}
                    placeholder="tu@email.com"
                    className="h-10 px-4 rounded-full bg-white/5 border border-white/15 text-sm text-white placeholder:text-white/35 focus:outline-none focus:ring-1 focus:ring-white/40 focus:border-white/40 flex-1 sm:w-60"
                  />
                  <button
                    type="submit"
                    disabled={nlStatus === "loading"}
                    className="inline-flex items-center gap-1.5 h-10 px-5 rounded-full bg-white text-gray-900 text-xs font-bold hover:bg-gray-100 transition-colors disabled:opacity-50"
                  >
                    {nlStatus === "loading" ? "..." : <><ArrowRight className="h-3.5 w-3.5" strokeWidth={2} aria-hidden /> Suscribir</>}
                  </button>
                </>
              )}
            </form>
          </div>
        </div>
      </div>

      {/* Trust badges + copyright */}
      <div className="border-t border-white/10">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-5">
          <div className="flex flex-col lg:flex-row items-center justify-between gap-4">
            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
              <div className="flex items-center gap-1.5 rounded-full px-3 py-1 text-[length:var(--ts-2xs)] font-bold uppercase tracking-[0.18em] text-white/55 bg-white/5 border border-white/10">
                <ShieldCheck className="h-3 w-3 text-white/60" strokeWidth={1.75} aria-hidden />
                Sitio Seguro
              </div>
              <div className="flex items-center gap-1.5 rounded-full px-3 py-1 text-[length:var(--ts-2xs)] font-bold uppercase tracking-[0.18em] text-white/55 bg-white/5 border border-white/10">
                <CreditCard className="h-3 w-3 text-white/60" strokeWidth={1.75} aria-hidden />
                Yape · Plin
              </div>
              <div className="flex items-center gap-1.5 rounded-full px-3 py-1 text-[length:var(--ts-2xs)] font-bold uppercase tracking-[0.18em] text-white/55 bg-white/5 border border-white/10">
                <Wallet className="h-3 w-3 text-white/60" strokeWidth={1.75} aria-hidden />
                Efectivo OK
              </div>
            </div>

            {/* Currency + Locale switchers removidos — default: Soles + Español */}

            <div className="flex flex-col sm:flex-row items-center gap-2">
              <p className="flex items-center gap-1.5 text-[length:var(--ts-2xs)] text-white/35 tabular-nums">
                © {year} {storeTheme?.name || "Buleje"} · Hecho en Perú
                <span className="mx-1">·</span>
                <a href="/privacidad" className="hover:text-white/60 transition-colors">Privacidad</a>
                <span className="mx-0.5">·</span>
                <a href="/terminos" className="hover:text-white/60 transition-colors">Términos</a>
              </p>
              <a
                href="/about"
                className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[length:var(--ts-2xs)] font-bold uppercase tracking-[0.18em] text-white/55 bg-white/5 border border-white/10 hover:bg-white/10 transition-colors"
              >
                v1.0 beta
              </a>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
