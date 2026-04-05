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
  Heart,
  Star,
  Mail,
  ArrowRight,
  CheckCircle2,
} from "lucide-react";
import { useSettings } from "@/contexts/settings-context";


const quickLinks = [
  { href: "/", label: "Inicio" },
  { href: "/tienda", label: "Tienda" },
  { href: "/recetas", label: "Recetario" },
  { href: "/#beneficios", label: "Beneficios" },
  { href: "/#preguntas", label: "Preguntas Frecuentes" },
  { href: "/#contacto", label: "Contacto" },
  { href: "/privacidad", label: "Privacidad" },
  { href: "/terminos", label: "Términos y Condiciones" },
];

const categoryLinks = [
  { href: "/tienda/categoria/abarrotes",   label: "Abarrotes" },
  { href: "/tienda/categoria/bebidas",     label: "Bebidas" },
  { href: "/tienda/categoria/golosinas",   label: "Golosinas y Snacks" },
  { href: "/tienda/categoria/carnes",      label: "Carne y Pollo" },
  { href: "/tienda/categoria/limpieza",    label: "Productos de Limpieza" },
  { href: "/tienda/categoria/lacteos",     label: "Lácteos" },
  { href: "/tienda",                       label: "Ver todas →" },
];

// ── WhatsApp SVG Icon ─────────────────────────────────────────────

function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

// ── WhatsApp Contact Section (embedded in page, not floating) ─────

const WHATSAPP_PHONE = process.env.NEXT_PUBLIC_WHATSAPP_PHONE ?? "51916409675";

function getPageContextMessage(pathname: string): string {
  if (pathname.startsWith("/tienda/producto/")) return "Hola, quiero consultar sobre un producto que vi en la tienda 🛒";
  if (pathname.startsWith("/tienda/categoria/")) return "Hola, estoy viendo una categoría y tengo una consulta 📦";
  if (pathname.startsWith("/tienda")) return "Hola, estoy viendo la tienda y necesito ayuda 🛒";
  if (pathname.startsWith("/recetas")) return "Hola, vi una receta y quiero consultar sobre los ingredientes 🍳";
  if (pathname.startsWith("/cuenta") || pathname.startsWith("/mis-pedidos")) return "Hola, tengo una consulta sobre mi cuenta o pedidos 📋";
  if (pathname.startsWith("/puntos")) return "Hola, quiero saber más sobre mis puntos de fidelidad ⭐";
  return "Hola, quiero hacer una consulta sobre la bodega 🛒";
}

function WhatsAppContactSection({
  deliveryConfig,
  storeTheme,
  businessName,
}: {
  deliveryConfig: { hours: { day: string; open: string; close: string; enabled: boolean }[] };
  storeTheme: { whatsapp?: string; phone?: string; name?: string } | null;
  businessName: string;
}) {
  const pathname = usePathname();
  const [showPulse, setShowPulse] = useState(false);

  // Pulse animation for first 3 visits
  useEffect(() => {
    const visits = parseInt(sessionStorage.getItem("bsm-wa-visits") ?? "0", 10);
    if (visits < 3) {
      setShowPulse(true);
      sessionStorage.setItem("bsm-wa-visits", String(visits + 1));
    }
  }, []);

  // Resolve WhatsApp number: settings > env
  const phone = storeTheme?.whatsapp?.replace(/\D/g, "") || storeTheme?.phone?.replace(/\D/g, "") || WHATSAPP_PHONE;
  const message = encodeURIComponent(getPageContextMessage(pathname));
  const waUrl = `https://wa.me/${phone}?text=${message}`;

  // Business hours for today
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
    <div className="bg-[#075E54] border-b border-white/10">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-5">
          {/* Left: Text */}
          <div className="text-center sm:text-left">
            <h3 className="text-lg sm:text-xl font-bold text-white flex items-center gap-2 justify-center sm:justify-start">
              <WhatsAppIcon className="h-5 w-5 text-[#25D366]" />
              Chatea con nosotros
            </h3>
            <p className="text-white/70 text-sm mt-1">
              Escríbenos por WhatsApp y te atendemos al instante
            </p>
            <div className="flex items-center gap-3 mt-2 justify-center sm:justify-start">
              <span className="flex items-center gap-1.5 text-xs text-white/60">
                <Clock className="h-3 w-3" />
                {hoursLabel}
              </span>
              {isOpenNow ? (
                <span className="flex items-center gap-1.5 text-xs font-bold text-emerald-300">
                  <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                  Abierto ahora
                </span>
              ) : (
                <span className="flex items-center gap-1.5 text-xs text-amber-300/80">
                  <span className="h-2 w-2 rounded-full bg-amber-400" />
                  Cerrado
                </span>
              )}
            </div>
          </div>

          {/* Right: CTA button */}
          <a
            href={waUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="relative inline-flex items-center gap-3 rounded-2xl px-6 py-3.5 text-base font-bold text-white transition-all hover:scale-[1.03] active:scale-[0.97] shadow-xl shadow-[#25D366]/25"
            style={{ background: "#25D366" }}
          >
            {showPulse && (
              <span className="absolute inset-0 rounded-2xl animate-ping bg-[#25D366]/30 pointer-events-none" style={{ animationDuration: "2s" }} />
            )}
            <WhatsAppIcon className="h-5 w-5" />
            Iniciar chat
          </a>
        </div>
      </div>
    </div>
  );
}

// ── Footer Component ──────────────────────────────────────────────

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
    { icon: Truck, label: "Delivery Gratis", color: "#00B4A6" },
    { icon: MessageCircle, label: "Pedidos por WhatsApp", color: "#25D366" },
    { icon: Clock, label: hoursLabel, color: "#f97316" },
    { icon: ShieldCheck, label: "Pago con Yape o Efectivo", color: "#60a5fa" },
  ];

  return (
    <footer style={{ background: "linear-gradient(180deg, #00B4A6 0%, #007A72 100%)" }} className="text-white">
      {/* ── WhatsApp Contact Section ─────────────────────────────────── */}
      <WhatsAppContactSection deliveryConfig={deliveryConfig} storeTheme={storeTheme} businessName={hp.footerWhatsApp} />
      {/* Perks Bar */}
      <div className="border-b border-white/10">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {perks.map((perk) => (
              <div
                key={perk.label}
                className="flex items-center gap-3"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl" style={{ background: perk.color + "22" }}>
                  <perk.icon className="h-4.5 w-4.5" style={{ color: perk.color }} />
                </div>
                <span className="text-sm font-medium text-white/85">{perk.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Main Footer */}
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-10">
          {/* Brand */}
          <div className="sm:col-span-2 lg:col-span-1">
            <div className="flex items-center gap-3 mb-5">
              <div
                className="flex h-11 w-11 items-center justify-center rounded-2xl"
                style={{
                  background: "linear-gradient(135deg, #00B4A6 0%, #009690 50%, #007A72 100%)",
                  boxShadow: "0 4px 12px rgba(0,180,166,0.35)",
                }}
              >
                <Store className="h-5 w-5 text-white" />
              </div>
              <div>
                <span className="text-lg font-extrabold block leading-tight">{storeTheme?.name || "Buleje"}</span>
                <span className="text-[11px] text-white/40 font-medium tracking-wide">Ucayali</span>
              </div>
            </div>
            {/* Stars */}
            <div className="flex items-center gap-1.5 mb-3">
              {[...Array(5)].map((_, i) => (
                <Star key={i} className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />
              ))}
              <span className="text-white/60 text-xs ml-1.5">{hp.footerRating}</span>
            </div>
            <p className="text-white/50 text-sm leading-relaxed mb-5">
              {storeTheme?.description || hp.footerDescription}
            </p>
            {/* Social + WhatsApp */}
            <div className="flex items-center gap-2 flex-wrap">
              <a
                href={`${storeTheme?.whatsapp || hp.footerWhatsApp}${(storeTheme?.whatsapp || hp.footerWhatsApp).includes("?") ? "&" : "?"}text=${encodeURIComponent(`Hola ${storeTheme?.name || "Buleje"} 👋, quiero hacer un pedido`)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold text-white transition-all hover:scale-[1.03] active:scale-[0.97] shadow-lg shadow-[#25D366]/20"
                style={{ background: "#25D366" }}
                aria-label="WhatsApp"
              >
                <MessageCircle className="h-4 w-4" />
                WhatsApp
              </a>
              <a
                href={hp.footerFacebook}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 h-10 px-3.5 rounded-xl bg-white/8 hover:bg-white/15 transition-colors text-white/80 text-xs font-semibold border border-white/8"
                aria-label="Facebook"
              >
                f/ Facebook
              </a>
              <a
                href={hp.footerInstagram}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 h-10 px-3.5 rounded-xl bg-white/8 hover:bg-white/15 transition-colors text-white/80 text-xs font-semibold border border-white/8"
                aria-label="Instagram"
              >
                📸 Instagram
              </a>
            </div>
          </div>

          {/* Quick Links */}
          <nav aria-label="Navegación rápida">
            <h3 className="text-sm font-bold uppercase tracking-wider text-white/50 mb-4">
              Navegación
            </h3>
            <ul className="space-y-2.5">
              {quickLinks.map((link) => (
                <li key={link.label}>
                  <a
                    href={link.href}
                    className="text-white/70 hover:text-secondary transition-colors text-sm"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          {/* Categories */}
          <nav aria-label="Categorías de productos">
            <h3 className="text-sm font-bold uppercase tracking-wider text-white/50 mb-4">
              Categorías
            </h3>
            <ul className="space-y-2.5">
              {categoryLinks.map((link) => (
                <li key={link.label}>
                  <a
                    href={link.href}
                    className="text-white/70 hover:text-secondary transition-colors text-sm"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          {/* Contact Info */}
          <div>
            <h3 className="text-sm font-bold uppercase tracking-wider text-white/50 mb-4">
              Contacto
            </h3>
            <ul className="space-y-3">
              <li className="flex items-start gap-2.5">
                <MapPin className="h-4 w-4 text-secondary mt-0.5 shrink-0" />
                <span className="text-sm text-white/70">
                  Jr. Ucayali 450, Ucayali
                </span>
              </li>
              {(storeTheme?.phone || storeTheme?.email) && (
                <li className="flex items-center gap-2.5">
                  <Phone className="h-4 w-4 text-secondary shrink-0" />
                  {storeTheme?.phone ? (
                    <a
                      href={`tel:${storeTheme.phone}`}
                      className="text-sm text-white/70 hover:text-secondary transition-colors"
                    >
                      {storeTheme.phone}
                    </a>
                  ) : (
                    <span className="text-sm text-white/70">916 409 675</span>
                  )}
                </li>
              )}
              {!storeTheme?.phone && !storeTheme?.email && (
                <li className="flex items-center gap-2.5">
                  <Phone className="h-4 w-4 text-secondary shrink-0" />
                  <a
                    href="tel:+51916409675"
                    className="text-sm text-white/70 hover:text-secondary transition-colors"
                  >
                    916 409 675
                  </a>
                </li>
              )}
              {storeTheme?.email && (
                <li className="flex items-center gap-2.5">
                  <Mail className="h-4 w-4 text-secondary shrink-0" />
                  <a
                    href={`mailto:${storeTheme.email}`}
                    className="text-sm text-white/70 hover:text-secondary transition-colors"
                  >
                    {storeTheme.email}
                  </a>
                </li>
              )}
              <li className="flex items-center gap-2.5">
                <Clock className="h-4 w-4 text-secondary shrink-0" />
                <span className="text-sm text-white/70">
                  {hoursLabel}
                </span>
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* Newsletter */}
      <div className="border-t border-white/8">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div>
              <h3 className="text-sm font-bold text-white/90 flex items-center gap-2">
                <Mail className="h-4 w-4 text-secondary" />
                Recibe ofertas exclusivas
              </h3>
              <p className="text-xs text-white/50 mt-1">Promociones, nuevos productos y descuentos directo a tu correo</p>
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
                <div className="flex items-center gap-2 text-sm text-emerald-300 font-bold animate-[scaleIn_0.3s_cubic-bezier(0.34,1.56,0.64,1)_both]">
                  <CheckCircle2 className="h-5 w-5 animate-[pop_0.3s_ease-out]" />
                  <span>¡Suscrito exitosamente! 🎉</span>
                </div>
              ) : (
                <>
                  <input
                    type="email"
                    required
                    value={nlEmail}
                    onChange={(e) => setNlEmail(e.target.value)}
                    placeholder="tu@email.com"
                    className="h-10 px-4 rounded-xl bg-white/10 border border-white/15 text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-secondary/50 flex-1 sm:w-60"
                  />
                  <button
                    type="submit"
                    disabled={nlStatus === "loading"}
                    className="h-10 px-4 rounded-xl bg-secondary text-white text-sm font-bold hover:bg-secondary/90 transition-colors flex items-center gap-1.5 disabled:opacity-50"
                  >
                    {nlStatus === "loading" ? "..." : <><ArrowRight className="h-4 w-4" /> Suscribir</>}
                  </button>
                </>
              )}
            </form>
          </div>
        </div>
      </div>

      {/* Trust badges + copyright */}
      <div className="border-t border-white/8">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-5">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            {/* Trust badges */}
            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
              <div className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-medium text-white/55 bg-white/5 border border-white/8">
                <ShieldCheck className="h-3 w-3 text-green-400" />
                Sitio Seguro
              </div>
              <div className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-medium text-white/55 bg-white/5 border border-white/8">
                <span className="font-bold text-white/70">Yape</span>
                Aceptado
              </div>
              <div className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-medium text-white/55 bg-white/5 border border-white/8">
                💵 Efectivo OK
              </div>
            </div>
            <div className="flex flex-col sm:flex-row items-center gap-2">
              <p className="flex items-center gap-1.5 text-xs text-white/35">
                © {year} {storeTheme?.name || "Buleje"} · Hecho con <Heart className="h-3 w-3 text-red-400 fill-red-400" aria-hidden="true" /> en Perú
                <span className="mx-1">·</span>
                <a href="/privacidad" className="hover:text-white/60 transition-colors">Privacidad</a>
                <span className="mx-0.5">·</span>
                <a href="/terminos" className="hover:text-white/60 transition-colors">Términos</a>
              </p>
              <a
                href="/about"
                className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold bg-amber-500/15 text-amber-200/70 border border-amber-500/20 hover:bg-amber-500/25 hover:text-amber-200 transition-colors"
              >
                ⚗️ v1.0.0-beta
              </a>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
