"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { useLocale } from "@/contexts/locale-context";
import {
  Store,
  MapPin,
  Phone,
  Clock,
  MessageCircle,
  Truck,
  ShieldCheck,
  Star,
  ArrowRight,
  Facebook,
  Instagram,
  CreditCard,
  Wallet,
  ChevronDown,
  UserCircle2,
  Briefcase,
  LifeBuoy,
  Leaf,
} from "lucide-react";
import { useSettings } from "@/contexts/settings-context";
import { BulejeWordmark } from "@/components/ui-system/illustrations";
import { usePlatformBrand } from "@/lib/use-platform-brand";
import { useMarketplaceNavMode } from "@/hooks/use-marketplace-nav-mode";
import { useMarketplaceCart } from "@/hooks/use-marketplace-cart";


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

// (WhatsAppContactSection eliminado en v2 — CTA WhatsApp ahora vive en el
//  HERO band y los logos sociales del bottom. Reducción de duplicación de UX.)

// ── Detección de modo tienda ────────────────────────────────────────────
// El footer se simplifica cuando estamos viendo el storefront de un vendor
// (URL: /marketplace/<slug> o /marketplace/<slug>/...). Esto evita exponer
// links cross-store (Explorar marketplace, Buleje en Vivo, Recetas, IA)
// que son del marketplace global, no de esa tienda en particular.
//
// Las rutas globales del marketplace que NO son de tienda específica son
// segmentos fijos del proyecto. Si pathname matchea uno de ellos, es modo
// marketplace global. En cualquier otro `/marketplace/<algo>`, es tienda.
const MARKETPLACE_GLOBAL_PATHS = new Set<string>([
  "explorar",
  "buscar",
  "comparar",
  "ofertas",
  "recetas",
  "en-vivo",
  "gift-cards",
  "registrar",
  "repartidor",
  "apply",
  "favoritos",
  "mi-cuenta",
  "payment-result",
  "categoria",
  "main-categories",
  "api-docs",
  "tiendas",
  "navegar",
]);

function isStoreModePath(pathname: string): boolean {
  if (!pathname.startsWith("/marketplace/")) return false;
  const seg = pathname.slice("/marketplace/".length).split("/")[0];
  if (!seg) return false;
  return !MARKETPLACE_GLOBAL_PATHS.has(seg);
}

// Footer simplificado para modo tienda: solo links relevantes a esa tienda.
// Modo tienda: solo links que tienen sentido para el cliente que ESTA
// viendo una tienda especifica. Sin enlaces a paginas globales del
// marketplace (Explorar, Catalogo, Recetas, IA) ni redes sociales falsas.
const storeModeLinks = [
  { href: "/marketplace/ofertas", label: "Ofertas" },
  { href: "/cuenta/pedidos", label: "Mis pedidos" },
  // Mayo 2026: ambos links apuntaban a /ayuda/como-pagar (404) y
  // /marketplace/como-pagar (real). Unificado al canónico marketplace.
  { href: "/marketplace/como-pagar", label: "Cómo pagar" },
  { href: "/ayuda#como-funciona", label: "Cómo funciona" },
  { href: "/marketplace/registrar", label: "Crear tienda" },
];

// Footer simplificado para /tiendas en modo "Solo Tiendas" (NavegacionTab
// preset por defecto). Brandon mayo 2026: cuando el superadmin tiene el
// modo "Solo Tiendas" activo, el footer NO debe mostrar el ecosistema
// completo de marketplace (Explorar, Recetas, Comparar, Gift Cards, etc.).
// Al volver al modo "Marketplace completo" se renderea el mega footer.
const tiendasOnlyLinks = [
  { href: "/", label: "Inicio" },
  { href: "/tiendas", label: "Tiendas" },
  { href: "/marketplace/ofertas", label: "Ofertas" },
  { href: "/marketplace/como-pagar", label: "Cómo pagar" },
  { href: "/abrir-tienda", label: "Abre tu tienda" },
  { href: "/cuenta/pedidos", label: "Mis pedidos" },
  { href: "/ayuda", label: "Ayuda" },
  { href: "/terminos", label: "Términos" },
  { href: "/privacidad", label: "Privacidad" },
];

// ── LinkGroup ─────────────────────────────────────────────────────────────
// Grupo de links del footer v2. En mobile funciona como acordeón
// colapsable (click en el header toggle). En desktop (lg:+) siempre abierto
// y sin chevron. Esto reduce la altura del footer en mobile drásticamente.
function LinkGroup({
  title,
  icon: Icon,
  links,
  accent,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number; "aria-hidden"?: boolean }>;
  links: ReadonlyArray<{ href: string; label: string }>;
  accent: "amber" | "emerald" | "sky" | "rose";
}) {
  const [open, setOpen] = useState(false);
  const accentColor = {
    amber: "text-amber-300",
    emerald: "text-emerald-300",
    sky: "text-sky-300",
    rose: "text-rose-300",
  }[accent];

  return (
    <div className="border-b border-white/10 lg:border-0 py-1 lg:py-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between py-4 lg:py-0 lg:mb-5 lg:cursor-default lg:pointer-events-none"
      >
        <span className="inline-flex items-center gap-2.5">
          <Icon className={`h-4 w-4 ${accentColor}`} strokeWidth={2.5} aria-hidden />
          <span className="text-sm font-extrabold uppercase tracking-[var(--ls-wider)] text-white">
            {title}
          </span>
        </span>
        <ChevronDown
          className={`h-5 w-5 text-white/60 transition-transform duration-200 lg:hidden ${open ? "rotate-180" : ""}`}
          strokeWidth={2.5}
          aria-hidden
        />
      </button>
      <ul className={`space-y-3 pb-4 lg:pb-0 ${open ? "block" : "hidden lg:block"}`}>
        {links.map((link) => (
          <li key={link.label}>
            <a
              href={link.href}
              className="text-sm font-semibold text-white/75 hover:text-amber-200 transition-colors"
            >
              {link.label}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function Footer() {
  const { t } = useLocale();
  // SSR-safe (Next 16 prerender-current-time): hidratación en cliente.
  const [year, setYear] = useState(2026);
  const [todayDow, setTodayDow] = useState<number | null>(null);
  useEffect(() => {
    const d = new Date();
    setYear(d.getFullYear());
    setTodayDow(d.getDay());
  }, []);

  const { homepage: hp, deliveryConfig, storeTheme } = useSettings();
  const pathname = usePathname();

  // Brandon mayo 15 v4 2026: footer oculto en /marketplace/carrito y /checkout/*.
  // Razón: en el flujo de compra (carrito → datos → entrega → confirmar), el
  // footer mete ruido visual y compite con el CTA "Continuar al checkout".
  // El cliente debe estar 100% enfocado en cerrar la compra, sin links salidos.
  // (Early return va abajo, tras todos los hooks, para no romper rules-of-hooks.)
  const isCheckoutFlow =
    pathname === "/marketplace/carrito" ||
    pathname?.startsWith("/checkout/") ||
    pathname === "/checkout";

  const isStoreMode = isStoreModePath(pathname);
  // Mayo 2026: footer simplificado en landing pages — antes 5 columnas
  // (Marketplace / Mi Cuenta / Vendé en Buleje / Ayuda / Más) era aspiracional
  // para el tamaño actual del negocio y proyectaba desconfianza.
  const isLandingMode =
    pathname === "/" ||
    pathname.startsWith("/repartidores") ||
    pathname.startsWith("/abrir-tienda") ||
    pathname.startsWith("/vender");

  // Brandon mayo 2026: si el superadmin tiene activo el modo "Solo Tiendas"
  // (NavegacionTab) y el visitante está en /tiendas, mostramos un footer
  // compacto sin links del ecosistema marketplace. Cuando vuelva al modo
  // "Marketplace completo" se renderea el mega-footer normalmente.
  const navMode = useMarketplaceNavMode();
  // Brandon 2026-05-18: pad-bottom dinámico cuando hay items en carrito.
  // El StickyCartBar (52px pegado al BottomNav) tapa el copyright en
  // /marketplace/[slug] al hacer scroll abajo. Detectamos items > 0 y
  // sumamos su altura al padding inferior solo en mobile.
  const { itemCount } = useMarketplaceCart();
  const hasCart = itemCount > 0;
  const isTiendasOnlyMode =
    pathname.startsWith("/tiendas") && navMode === "tiendas-only";
  // Marca de la plataforma (gestionada en /superadmin/marca).
  // Cuando storeTheme está vacío, la marca de la plataforma se usa como fallback.
  const { brand } = usePlatformBrand();
  const platformName = brand?.identity.name || "Buleje";
  const platformPhone = brand?.contact.phone ?? "";
  const platformWa = brand?.contact.whatsapp ?? "";
  const platformCity = brand?.identity.city || "Pucallpa";
  const platformRegion = brand?.identity.country || "Ucayali";
  const fbUrl = brand?.socials.facebook || "";
  const igUrl = brand?.socials.instagram || "";

  if (isCheckoutFlow) return null;

  const DAY_NAMES = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
  const todayName = todayDow !== null ? DAY_NAMES[todayDow] : null;
  const todayEntry = todayName ? deliveryConfig.hours.find((h) => h.day === todayName) : undefined;
  const hoursLabel = todayEntry?.enabled ? `Hoy: ${todayEntry.open} – ${todayEntry.close}` : "Hoy: cerrado";

  return (
    <footer className="relative bg-gradient-to-b from-[#0a1a14] via-[#06120d] to-black text-white">
      {/* Acento ámbar Buleje — hairline superior con identidad amazónica */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-amber-300/70 to-transparent" />
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-emerald-500/[0.06] to-transparent" />

      {/* Modo tienda: footer reducido — links pertinentes a la tienda actual.
          NO muestra Explorar / Recetas / Asistente IA / Buleje en Vivo
          (son del marketplace global). Las redes y datos de contacto se
          conservan via la columna de identidad del mega footer. */}
      {isStoreMode && (
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12">
          <div className="flex flex-col items-start justify-between gap-8 sm:flex-row sm:items-center">
            <nav aria-label="Esta tienda" className="flex flex-wrap items-center gap-x-6 gap-y-3">
              {storeModeLinks.map((link) => (
                <a
                  key={link.label}
                  href={link.href}
                  className="text-sm font-bold text-white/85 transition-colors hover:text-white"
                >
                  {link.label}
                </a>
              ))}
            </nav>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-white/40">
                {storeTheme?.name || "Tienda"}
              </span>
              <span className="rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-white/70">
                Modo tienda
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Landing mode — footer minimalista 2 columnas honesto pre-launch */}
      {isLandingMode && (
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-14 sm:py-16">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-10 sm:gap-16">
            {/* Empresa */}
            <nav aria-label="Empresa">
              <h3 className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-white/40 mb-5">
                Empresa
              </h3>
              <ul className="space-y-2.5">
                <li><a href="/about" className="text-white/75 hover:text-white text-sm font-semibold transition-colors">Nosotros</a></li>
                {/* Brandon 2026-05-20 v9 audit P0: unifica URLs con el body
                    (antes footer apuntaba a /abrir-tienda + /repartidores
                    mientras body usaba /negocios + /marketplace/repartidor —
                    2 rutas distintas para la misma intención). */}
                <li><a href="/negocios" className="text-white/75 hover:text-white text-sm font-semibold transition-colors">Abrir mi tienda</a></li>
                <li><a href="/marketplace/repartidor" className="text-white/75 hover:text-white text-sm font-semibold transition-colors">Para repartidores</a></li>
                <li><a href="/terminos" className="text-white/75 hover:text-white text-sm font-semibold transition-colors">Términos</a></li>
                <li><a href="/privacidad" className="text-white/75 hover:text-white text-sm font-semibold transition-colors">Privacidad</a></li>
              </ul>
            </nav>

            {/* Contacto */}
            <nav aria-label="Contacto">
              <h3 className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-white/40 mb-5">
                Contacto
              </h3>
              <ul className="space-y-2.5">
                {platformWa && (
                  <li>
                    <a
                      href={`https://wa.me/${platformWa.replace(/[^0-9]/g, "")}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 text-white/75 hover:text-white text-sm font-semibold transition-colors"
                    >
                      <MessageCircle className="h-4 w-4" strokeWidth={2} aria-hidden />
                      WhatsApp
                    </a>
                  </li>
                )}
                {platformPhone && (
                  <li>
                    <a
                      href={`tel:${platformPhone.replace(/\s/g, "")}`}
                      className="inline-flex items-center gap-2 text-white/75 hover:text-white text-sm font-semibold transition-colors"
                    >
                      <Phone className="h-4 w-4" strokeWidth={2} aria-hidden />
                      {platformPhone}
                    </a>
                  </li>
                )}
                {igUrl && (
                  <li>
                    <a
                      href={igUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 text-white/75 hover:text-white text-sm font-semibold transition-colors"
                    >
                      <Instagram className="h-4 w-4" strokeWidth={2} aria-hidden />
                      Instagram
                    </a>
                  </li>
                )}
                {fbUrl && (
                  <li>
                    <a
                      href={fbUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 text-white/75 hover:text-white text-sm font-semibold transition-colors"
                    >
                      <Facebook className="h-4 w-4" strokeWidth={2} aria-hidden />
                      Facebook
                    </a>
                  </li>
                )}
                <li className="pt-2 text-xs text-white/50">
                  {platformCity}, {platformRegion} · Perú
                </li>
              </ul>
            </nav>
          </div>
        </div>
      )}

      {/* Footer compacto para /tiendas en modo "Solo Tiendas" — pedido
          Brandon mayo 2026: ocultar el ecosistema marketplace cuando el
          superadmin tiene activa la presentación "tiendas only". */}
      {isTiendasOnlyMode && (
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12">
          <div className="flex flex-col gap-8 sm:flex-row sm:items-center sm:justify-between">
            <nav aria-label="Enlaces de tiendas" className="flex flex-wrap items-center gap-x-6 gap-y-3">
              {tiendasOnlyLinks.map((link) => (
                <a
                  key={link.label}
                  href={link.href}
                  className="text-sm font-bold text-white/85 transition-colors hover:text-white"
                >
                  {link.label}
                </a>
              ))}
            </nav>
            <div className="flex items-center gap-2">
              <span className="rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-white/70">
                Modo Solo Tiendas
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Footer v2 — compacto + identidad amazónica.
          Una sola banda HERO (logo + tagline + CTA WhatsApp) seguida de
          4 grupos de links con acordeón mobile. Marca: verde selva + ámbar
          Buleje como acento. Sin newsletter ni perks duplicados. */}
      {!isStoreMode && !isLandingMode && !isTiendasOnlyMode && (
      <>
        {/* ── HERO BAND v2: 1 banda corta — logo + tagline + CTA WhatsApp ── */}
        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-10 sm:pt-14 pb-8 sm:pb-10">
          <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-6 lg:gap-12 items-center">
            {/* IZQ: marca + tagline amazónico + chips */}
            <div>
              <BulejeWordmark
                size={44}
                strokeWidth={1.75}
                textSize={26}
                className="text-white drop-shadow-[0_0_24px_rgba(252,211,77,0.15)]"
              />
              <p className="mt-4 text-base sm:text-lg leading-snug font-medium max-w-xl">
                <span className="text-amber-300 font-extrabold">Tu mercado desde la selva amazónica.</span>{" "}
                <span className="text-white/80">Bodegas, restaurantes y emprendedores de {platformCity}, en un solo lugar.</span>
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 border border-emerald-400/35 px-3 py-1.5 text-xs font-extrabold text-emerald-200">
                  <MapPin className="h-4 w-4" strokeWidth={2.5} aria-hidden />
                  {platformCity}, {platformRegion}
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-400/15 border border-amber-300/35 px-3 py-1.5 text-xs font-extrabold text-amber-200">
                  <Star className="h-4 w-4 fill-current" strokeWidth={0} aria-hidden />
                  <span className="tabular-nums">{hp.footerRating}</span>
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.05] border border-white/15 px-3 py-1.5 text-xs font-extrabold text-white/85">
                  <Clock className="h-4 w-4 text-white/70" strokeWidth={2.5} aria-hidden />
                  <span className="tabular-nums">{hoursLabel}</span>
                </span>
              </div>
            </div>

            {/* DER: CTA WhatsApp + iconos sociales compactos */}
            <div className="flex flex-col gap-3 lg:items-end">
              {(() => {
                const rawPhone = (storeTheme?.whatsapp || platformWa || hp.footerWhatsApp || "").replace(/\D/g, "");
                if (!rawPhone) return null;
                const text = encodeURIComponent(`Hola ${storeTheme?.name || platformName}, quiero hacer un pedido`);
                return (
                  <a
                    href={`https://wa.me/${rawPhone}?text=${text}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group inline-flex items-center justify-center gap-3 h-14 px-6 w-full lg:w-auto rounded-2xl bg-emerald-500 text-white text-base font-extrabold hover:bg-emerald-400 transition-all shadow-[0_8px_32px_-8px_rgba(16,185,129,0.45)] hover:shadow-[0_8px_40px_-4px_rgba(16,185,129,0.6)]"
                  >
                    <WhatsAppIcon className="h-6 w-6" />
                    Hacé tu pedido por WhatsApp
                    <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-0.5" strokeWidth={2.5} aria-hidden />
                  </a>
                );
              })()}
              <div className="flex items-center gap-2.5 justify-center lg:justify-end">
                <span className="text-sm font-semibold text-white/55">O seguinos</span>
                <a
                  href={fbUrl || hp.footerFacebook}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Facebook"
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full border-2 border-white/15 bg-white/[0.04] hover:border-amber-300/60 hover:bg-amber-300/10 hover:text-amber-200 transition-colors"
                >
                  <Facebook className="h-4 w-4" strokeWidth={2} aria-hidden />
                </a>
                <a
                  href={igUrl || hp.footerInstagram}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Instagram"
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full border-2 border-white/15 bg-white/[0.04] hover:border-amber-300/60 hover:bg-amber-300/10 hover:text-amber-200 transition-colors"
                >
                  <Instagram className="h-4 w-4" strokeWidth={2} aria-hidden />
                </a>
                <a
                  href={`tel:${(storeTheme?.phone || platformPhone || "+51929340532").replace(/\s/g, "")}`}
                  aria-label="Llamar"
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full border-2 border-white/15 bg-white/[0.04] hover:border-amber-300/60 hover:bg-amber-300/10 hover:text-amber-200 transition-colors"
                >
                  <Phone className="h-4 w-4" strokeWidth={2} aria-hidden />
                </a>
              </div>
            </div>
          </div>
        </div>

        {/* Separador con acento verde selva */}
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="h-px bg-gradient-to-r from-transparent via-emerald-400/25 to-transparent" />
        </div>

        {/* ── LINKS: 4 grupos con acordeón mobile (cerrados) + abiertos desktop ── */}
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-4 pb-6 lg:py-10">
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-0 lg:gap-10">
            <LinkGroup title={t("footer.marketplace")} icon={Store} links={marketplaceLinks} accent="amber" />
            <LinkGroup title={t("footer.myAccount")} icon={UserCircle2} links={cuentaLinks} accent="emerald" />
            <LinkGroup title={t("footer.sellOnBuleje")} icon={Briefcase} links={businessLinks} accent="sky" />
            <LinkGroup title={t("footer.help")} icon={LifeBuoy} links={helpLinks} accent="rose" />
          </div>
          {/* Categorías como chips horizontales debajo de los 4 grupos */}
          <div className="mt-6 lg:mt-10 pt-6 lg:pt-8 border-t border-white/10">
            <h4 className="text-xs font-extrabold uppercase tracking-[var(--ls-wider)] text-white/60 mb-3 inline-flex items-center gap-2">
              <Leaf className="h-4 w-4 text-emerald-300" strokeWidth={2.5} aria-hidden />
              Categorías populares
            </h4>
            <ul className="flex flex-wrap gap-2">
              {categoryLinks.map((link) => (
                <li key={link.label}>
                  <a
                    href={link.href}
                    className="inline-flex items-center rounded-full border border-white/15 bg-white/[0.04] px-3.5 py-1.5 text-xs font-bold text-white/85 hover:bg-amber-300/10 hover:text-amber-200 hover:border-amber-300/40 transition-colors"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </>
      )}

      {/* Bottom band — trust/payment compact + copyright. 2 líneas en mobile, 1 en desktop.
          pb-mobile evita que la BottomNav fija (72px + safe-area iOS) tape el
          copyright al hacer scroll hasta el final de la página.
          Brandon 2026-05-18: cuando hay items en carrito, el StickyCartBar
          (~52px pegado encima del BottomNav) también tapa contenido — sumamos
          su altura solo en ese caso. Sin cart: 72px. Con cart: 130px. */}
      <div className={`border-t border-emerald-400/15 bg-black/50 backdrop-blur-sm ${hasCart ? "pb-[calc(130px+env(safe-area-inset-bottom))]" : "pb-[calc(72px+env(safe-area-inset-bottom))]"} sm:pb-0`}>
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-4 sm:py-5">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 sm:gap-4">
            {/* Trust + payment chips — todos en 1 línea */}
            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-1.5">
              <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold text-emerald-200 bg-emerald-500/10 border border-emerald-400/30">
                <ShieldCheck className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
                Sitio seguro
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold text-sky-200 bg-sky-500/10 border border-sky-400/30">
                <CreditCard className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
                Yape · Plin
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold text-amber-200 bg-amber-400/15 border border-amber-300/35">
                <Wallet className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
                Efectivo
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold text-rose-200 bg-rose-500/10 border border-rose-400/30">
                <Truck className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
                Delivery
              </span>
            </div>

            {/* Copyright + legal — 1 línea */}
            <p className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-xs sm:text-sm text-white/60 tabular-nums">
              {/* Brandon 2026-05-20 v9 audit P0: storeTheme.name venía como
                  "Bodega Buleje Test" del tenant resuelto por fallback en
                  rutas marketplace publicas (/, /tiendas, /negocios,
                  /marketplace/[slug]). Forzamos "Buleje" para que el
                  copyright nunca filtre el nombre del tenant interno. */}
              <span className="font-bold text-white/80">© {year} Buleje</span>
              <span aria-hidden className="text-emerald-400/40">·</span>
              <span className="hidden sm:inline">Hecho con cariño en {platformCity}</span>
              <span aria-hidden className="hidden sm:inline text-emerald-400/40">·</span>
              <a href="/privacidad" className="font-semibold hover:text-amber-200 transition-colors">Privacidad</a>
              <span aria-hidden className="text-emerald-400/40">·</span>
              <a href="/terminos" className="font-semibold hover:text-amber-200 transition-colors">Términos</a>
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
