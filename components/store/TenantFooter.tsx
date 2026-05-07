"use client";

/**
 * TenantFooter — Footer dedicado a la tienda individual `/t/[slug]/tienda`.
 *
 * Diferencia clave vs `components/Footer.tsx`: NO incluye columnas de
 * marketplace (Buleje en Vivo, Comparar, Gift Cards globales, Vendé en Buleje,
 * etc.). La tienda individual es el sitio del negocio — autónomo, sin links
 * cross-store.
 *
 * Estructura:
 *   - WhatsApp contact strip (canal principal)
 *   - Perks bar (delivery / pago / horario / seguridad)
 *   - 3 columnas: Mi cuenta / Ayuda / Identidad de la tienda
 *   - Newsletter del comercio
 *   - Copyright con el nombre de la tienda (no "Buleje")
 */

import { useState, useEffect } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import { usePathname } from "next/navigation";
import {
  MapPin,
  Phone,
  Clock,
  MessageCircle,
  Truck,
  ShieldCheck,
  Mail,
  ArrowRight,
  CheckCircle2,
  Facebook,
  Instagram,
  CreditCard,
  Wallet,
} from "lucide-react";
import { useSettings } from "@/contexts/settings-context";

interface TenantFooterProps {
  slug: string;
  storeName: string;
}

// Construye un path tenant-aware: si el slug viene del props, prefija
// `/t/<slug>` para mantener al cliente dentro del contexto del comercio.
const buildTenantPath = (slug: string, path: string): string => {
  if (!slug) return path;
  if (path.startsWith("http") || path.startsWith("#")) return path;
  if (path.startsWith(`/t/${slug}`)) return path;
  if (path === "/") return `/t/${slug}`;
  // Anchor en path → respeta el segmento de hash separado.
  const [base, hash] = path.split("#");
  const prefixed = `/t/${slug}${base}`;
  return hash ? `${prefixed}#${hash}` : prefixed;
};

// Mi cuenta — links propios del cliente del comercio (rutas internas / cuenta).
const cuentaLinks = [
  { href: "/cuenta", label: "Mi cuenta" },
  { href: "/cuenta/pedidos", label: "Mis pedidos" },
  { href: "/cuenta/cupones", label: "Cupones" },
  { href: "/cuenta/notificaciones", label: "Notificaciones" },
];

// Ayuda — soporte específico de la tienda (no cross-store).
const helpLinks = [
  { href: "/ayuda", label: "Centro de ayuda" },
  { href: "/ayuda#faq", label: "Preguntas frecuentes" },
  { href: "/tracking", label: "Seguir mi pedido" },
  { href: "/privacidad", label: "Privacidad" },
  { href: "/terminos", label: "Términos" },
];

function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

const WHATSAPP_FALLBACK = process.env.NEXT_PUBLIC_WHATSAPP_PHONE ?? "51916409675";

function getPageContextMessage(pathname: string, storeName: string): string {
  if (pathname.includes("/producto/")) return `Hola ${storeName}, quiero consultar sobre un producto.`;
  if (pathname.includes("/categoria/")) return `Hola ${storeName}, tengo una consulta de catálogo.`;
  if (pathname.includes("/tienda")) return `Hola ${storeName}, estoy viendo el catálogo y necesito ayuda.`;
  if (pathname.includes("/cuenta") || pathname.includes("/mis-pedidos")) return `Hola ${storeName}, tengo una consulta sobre mi pedido.`;
  return `Hola ${storeName}, quiero hacer una consulta.`;
}

function WhatsAppContactStrip({ storeName }: { storeName: string }) {
  const { deliveryConfig, storeTheme } = useSettings();
  const pathname = usePathname();
  const [showPulse, setShowPulse] = useState(false);

  useEffect(() => {
    const visits = parseInt(sessionStorage.getItem("tenant-wa-visits") ?? "0", 10);
    if (visits < 3) {
      setShowPulse(true);
      sessionStorage.setItem("tenant-wa-visits", String(visits + 1));
    }
  }, []);

  const phone = storeTheme?.whatsapp?.replace(/\D/g, "") || storeTheme?.phone?.replace(/\D/g, "") || WHATSAPP_FALLBACK;
  const message = encodeURIComponent(getPageContextMessage(pathname, storeName));
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

  const hoursLabel = todayEntry?.enabled ? `Hoy ${todayEntry.open}–${todayEntry.close}` : "Hoy cerrado";

  return (
    <div className="border-b border-white/10">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-5">
          <div className="text-left">
            <span className="inline-flex items-center gap-1.5 text-[length:var(--ts-2xs)] font-bold uppercase tracking-widest text-white/50 mb-2">
              <MessageCircle className="h-3 w-3" strokeWidth={1.75} aria-hidden />
              Atención directa
            </span>
            <h3 className="text-xl sm:text-2xl font-extrabold tracking-tight text-white">
              Hablá con {storeName}
            </h3>
            <p className="text-white/55 text-sm mt-1 max-w-md leading-relaxed">
              Te respondemos por WhatsApp al instante.
            </p>
            <div className="flex items-center gap-4 mt-3">
              <span className="flex items-center gap-1.5 text-xs text-white/45 tabular-nums">
                <Clock className="h-3 w-3" strokeWidth={1.75} aria-hidden />
                {hoursLabel}
              </span>
              {isOpenNow ? (
                <span className="flex items-center gap-1.5 text-[length:var(--ts-2xs)] font-bold uppercase tracking-widest text-emerald-300">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Abierto
                </span>
              ) : (
                <span className="flex items-center gap-1.5 text-[length:var(--ts-2xs)] font-bold uppercase tracking-widest text-white/40">
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

export default function TenantFooter({ slug, storeName }: TenantFooterProps) {
  const year = new Date().getFullYear();
  const { deliveryConfig, storeTheme } = useSettings();
  const [nlEmail, setNlEmail] = useState("");
  const [nlStatus, setNlStatus] = useState<"idle" | "loading" | "success" | "error">("idle");

  const DAY_NAMES = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
  const todayName = DAY_NAMES[new Date().getDay()];
  const todayEntry = deliveryConfig.hours.find((h) => h.day === todayName);
  const hoursLabel = todayEntry?.enabled ? `${todayEntry.open} – ${todayEntry.close}` : "Cerrado";

  const perks = [
    { Icon: Truck, label: "Delivery rápido" },
    { Icon: MessageCircle, label: "Pedidos por WhatsApp" },
    { Icon: Clock, label: `Hoy ${hoursLabel}` },
    { Icon: ShieldCheck, label: "Pago con Yape o Efectivo" },
  ];

  const phone = storeTheme?.phone ?? "";
  const address = storeTheme?.address ?? "";
  const facebook = storeTheme?.socialLinks?.facebook ?? "";
  const instagram = storeTheme?.socialLinks?.instagram ?? "";
  const whatsappPhone = storeTheme?.whatsapp?.replace(/\D/g, "") || phone.replace(/\D/g, "") || WHATSAPP_FALLBACK;
  const tenantHome = `/t/${slug}`;

  return (
    <footer className="bg-[#060a0d] text-white border-t border-white/10" aria-label={`Pie de página de ${storeName}`}>
      <WhatsAppContactStrip storeName={storeName} />

      {/* Perks */}
      <div className="border-b border-white/10">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {perks.map((perk) => {
              const PIcon = perk.Icon;
              return (
                <div key={perk.label} className="flex items-center gap-3">
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

      {/* 3-column nav: Mi cuenta / Ayuda / Identidad */}
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-14 sm:py-16">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-10">
          {/* Col 1: Mi cuenta */}
          <nav aria-label="Mi cuenta">
            <h3 className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-widest text-white/40 mb-5">
              Mi cuenta
            </h3>
            <ul className="space-y-2.5">
              <li>
                <a href={tenantHome} className="text-white/65 hover:text-white transition-colors text-sm">
                  Ir al inicio
                </a>
              </li>
              {cuentaLinks.map((link) => (
                <li key={link.label}>
                  <a
                    href={buildTenantPath(slug, link.href)}
                    className="text-white/65 hover:text-white transition-colors text-sm"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          {/* Col 2: Ayuda */}
          <nav aria-label="Ayuda">
            <h3 className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-widest text-white/40 mb-5">
              Ayuda
            </h3>
            <ul className="space-y-2.5">
              {helpLinks.map((link) => (
                <li key={link.label}>
                  <a
                    href={buildTenantPath(slug, link.href)}
                    className="text-white/65 hover:text-white transition-colors text-sm"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
            <a
              href={`https://wa.me/${whatsappPhone}?text=${encodeURIComponent(`Hola ${storeName}, necesito ayuda`)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/5 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-white/10 transition-colors"
            >
              <MessageCircle className="h-3 w-3" strokeWidth={1.75} aria-hidden />
              WhatsApp
            </a>
          </nav>

          {/* Col 3: Identidad de la tienda */}
          <div>
            <h3 className="text-base font-extrabold tracking-tight text-white mb-3">{storeName}</h3>
            {storeTheme?.description && (
              <p className="text-white/55 text-sm leading-relaxed mb-3">{storeTheme.description}</p>
            )}
            {address && (
              <div className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[length:var(--ts-2xs)] font-bold uppercase tracking-widest text-white/70 mb-4">
                <MapPin className="h-3 w-3 text-white/60" strokeWidth={1.75} aria-hidden />
                {address}
              </div>
            )}

            <div className="flex items-center gap-2 flex-wrap">
              <a
                href={`https://wa.me/${whatsappPhone}?text=${encodeURIComponent(`Hola ${storeName}, quiero hacer un pedido`)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-semibold text-white/70 bg-white/5 hover:bg-white/10 border border-white/10 transition-colors"
                aria-label="WhatsApp"
              >
                <MessageCircle className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
                WhatsApp
              </a>
              {facebook && (
                <a
                  href={facebook}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-semibold text-white/70 bg-white/5 hover:bg-white/10 border border-white/10 transition-colors"
                  aria-label="Facebook"
                >
                  <Facebook className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
                  Facebook
                </a>
              )}
              {instagram && (
                <a
                  href={instagram}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-semibold text-white/70 bg-white/5 hover:bg-white/10 border border-white/10 transition-colors"
                  aria-label="Instagram"
                >
                  <Instagram className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
                  Instagram
                </a>
              )}
            </div>

            <div className="mt-5 space-y-2">
              {phone && (
                <div className="flex items-center gap-2.5 text-xs text-white/55">
                  <Phone className="h-3.5 w-3.5 text-white/55 shrink-0" strokeWidth={1.75} aria-hidden />
                  <a href={`tel:${phone}`} className="tabular-nums hover:text-white/80">
                    {phone}
                  </a>
                </div>
              )}
              <div className="flex items-center gap-2.5 text-xs text-white/55">
                <Clock className="h-3.5 w-3.5 text-white/55 shrink-0" strokeWidth={1.75} aria-hidden />
                <span className="tabular-nums">Hoy {hoursLabel}</span>
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
                Recibe ofertas de {storeName}
              </h3>
              <p className="text-xs text-white/45 mt-1 leading-relaxed">Promociones y nuevos productos directo a tu correo.</p>
            </div>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!nlEmail.trim() || nlStatus === "loading") return;
                setNlStatus("loading");
                try {
                  const res = await fetch("/api/newsletter", {
                    method: "POST",
                    headers: csrfHeaders({ "Content-Type": "application/json" }),
                    body: JSON.stringify({ email: nlEmail.trim() }),
                  });
                  setNlStatus(res.ok ? "success" : "error");
                  if (res.ok) setNlEmail("");
                } catch {
                  setNlStatus("error");
                }
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
                    {nlStatus === "loading" ? "..." : (
                      <>
                        <ArrowRight className="h-3.5 w-3.5" strokeWidth={2} aria-hidden /> Suscribir
                      </>
                    )}
                  </button>
                </>
              )}
            </form>
          </div>
        </div>
      </div>

      {/* Trust + copyright */}
      <div className="border-t border-white/10">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-5">
          <div className="flex flex-col lg:flex-row items-center justify-between gap-4">
            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
              <div className="flex items-center gap-1.5 rounded-full px-3 py-1 text-[length:var(--ts-2xs)] font-bold uppercase tracking-widest text-white/55 bg-white/5 border border-white/10">
                <ShieldCheck className="h-3 w-3 text-white/60" strokeWidth={1.75} aria-hidden />
                Sitio Seguro
              </div>
              <div className="flex items-center gap-1.5 rounded-full px-3 py-1 text-[length:var(--ts-2xs)] font-bold uppercase tracking-widest text-white/55 bg-white/5 border border-white/10">
                <CreditCard className="h-3 w-3 text-white/60" strokeWidth={1.75} aria-hidden />
                Yape · Plin
              </div>
              <div className="flex items-center gap-1.5 rounded-full px-3 py-1 text-[length:var(--ts-2xs)] font-bold uppercase tracking-widest text-white/55 bg-white/5 border border-white/10">
                <Wallet className="h-3 w-3 text-white/60" strokeWidth={1.75} aria-hidden />
                Efectivo OK
              </div>
            </div>

            <p className="flex items-center gap-1.5 text-[length:var(--ts-2xs)] text-white/35 tabular-nums">
              © {year} {storeName} · Hecho en Perú
              <span className="mx-1">·</span>
              <a
                href={buildTenantPath(slug, "/privacidad")}
                className="hover:text-white/60 transition-colors"
              >
                Privacidad
              </a>
              <span className="mx-0.5">·</span>
              <a
                href={buildTenantPath(slug, "/terminos")}
                className="hover:text-white/60 transition-colors"
              >
                Términos
              </a>
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
