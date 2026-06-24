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
  BookText,
  Scale,
} from "lucide-react";
import { useSettingsSafe, DEFAULT_DELIVERY } from "@/contexts/settings-context";
import { DEFAULT_HOMEPAGE } from "@/lib/homepage-content";
import { BulejeWordmark } from "@/components/ui-system/illustrations";
import { usePlatformBrand } from "@/lib/use-platform-brand";
import { extractWaNumber } from "@/lib/wa-number";
import { useMarketplaceNavMode } from "@/hooks/use-marketplace-nav-mode";
import { useMarketplaceCart } from "@/hooks/use-marketplace-cart";
import { readNavVisibility, subscribeNavVisibility, type NavVisibilityMap } from "@/lib/nav-visibility";
import { BRAND_GEO } from "@/lib/geo";
import { LEGAL, LEGAL_COMPLETO } from "@/lib/legal";


// ── Columna 1: Marketplace ──────────────────────────────────────────────
const marketplaceLinks = [
  // Brandon 2026-06-08: "Explorar marketplace" (/marketplace) + "Catálogo
  // completo" (/marketplace/explorar) REMOVIDOS — ambos redirigían a la home
  // (la fusión hizo / = el marketplace) y se veían como una "segunda página
  // igual". Reemplazados por destinos reales y distintos: Inicio + Tiendas.
  { href: "/", label: "Inicio" },
  { href: "/tiendas", label: "Tiendas" },
  { href: "/marketplace/comparar", label: "Comparar productos" },
  { href: "/marketplace/gift-cards", label: "Gift Cards" },
  { href: "/marketplace/en-vivo", label: "Buleje en Vivo" },
  { href: "/marketplace/ofertas", label: "Ofertas flash" },
  { href: "/recetas", label: "Recetas" },
  { href: "/asistente", label: "Asistente IA" },
];

// Brandon 2026-05-27 (FIX 404): /tienda/categoria/* no existe como ruta.
// Apuntamos al buscador del marketplace filtrado por categoría de producto
// (mismo destino que el subnav de categorías), que sí renderiza el grid.
const categoryLinks = [
  { href: "/marketplace/buscar?cat=abarrotes", label: "Abarrotes" },
  { href: "/marketplace/buscar?cat=bebidas", label: "Bebidas" },
  { href: "/marketplace/buscar?cat=carnes", label: "Carne y Pollo" },
  { href: "/marketplace/buscar?cat=lácteos", label: "Lácteos" },
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

// ── Columna 3: Vende en Buleje ──────────────────────────────────────────
const businessLinks = [
  { href: "/vender", label: "Vende en Buleje" },
  { href: "/vender/registro", label: "Registra tu tienda" },
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

// ── Footer unificado (sin "modo tienda") ─────────────────────────────────
// Brandon 2026-06-11: el "modo tienda" SOLO se activaba en `/marketplace/<slug>`
// (la ficha de tienda DENTRO del marketplace) y mostraba un footer recortado con
// la etiqueta "Modo tienda". Pero esa página ES del marketplace, no la tienda
// individual del comerciante (esa vive en subdominio / `/t/<slug>`, con su propio
// chrome StorefrontNavbar). Mostrar un footer distinto ahí confundía: el nav era
// el del marketplace y el footer decía "Modo tienda". Ahora `/marketplace/<slug>`
// usa el MISMO footer que el resto del marketplace (tiendas-only o mega según
// el modo de navegación del superadmin). Footer único = cero confusión.

// Brandon 2026-05-30: el footer "Solo Tiendas" (tiendasFooterLinks) ahora se
// construye DINÁMICO dentro del componente — gateado por la config del
// superadmin (lib/nav-visibility) + Inicio/Tiendas siempre. Ver el cuerpo de
// Footer(). Se usa en TODAS las páginas en modo tienda (footer único).

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
  // Minimalista: un solo acento de marca (turquesa) para los 4 grupos.
  // Antes 4 colores (amber/emerald/sky/rose) → ruido visual incoherente.
  const accentColor = {
    amber: "text-teal-300",
    emerald: "text-teal-300",
    sky: "text-teal-300",
    rose: "text-teal-300",
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
      <ul className={`space-y-2.5 pb-3 lg:pb-0 ${open ? "block" : "hidden lg:block"}`}>
        {links.map((link) => (
          <li key={link.label}>
            <a
              href={link.href}
              className="text-sm font-semibold text-white/75 hover:text-teal-200 transition-colors"
            >
              {link.label}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

type FooterProps = {
  /**
   * Override del modo del navbar resuelto desde un segment layout server-side.
   * Si se pasa, evita el flash post-hidratación que producía el hook client
   * `useMarketplaceNavMode()` (arranca `null` en SSR → mega-footer marketplace
   * se renderea primero → cliente recorta al compacto al resolver el modo).
   * Brandon 2026-05-21 perf FOUC v2.
   */
  modeOverride?: import("@/lib/nav-visibility").MarketplaceNavMode;
};

export default function Footer({ modeOverride }: FooterProps = {}) {
  const { t } = useLocale();
  // SSR-safe (Next 16 prerender-current-time): hidratación en cliente.
  const [year, setYear] = useState(2026);
  const [todayDow, setTodayDow] = useState<number | null>(null);
  useEffect(() => {
    const d = new Date();
    setYear(d.getFullYear());
    setTodayDow(d.getDay());
  }, []);

  // Brandon 2026-05-27: footer portable — usa el accessor SEGURO de settings.
  // Antes `useSettings()` lanzaba si no había SettingsProvider (solo montado en
  // layouts store/marketplace), lo que impedía reusar este footer en páginas
  // fuera de ese árbol (ej. /saas). Con fallback a defaults, el MISMO footer
  // renderiza idéntico en cualquier página del dominio Buleje.
  const settingsCtx = useSettingsSafe();
  const hp = settingsCtx?.homepage ?? DEFAULT_HOMEPAGE;
  const deliveryConfig = settingsCtx?.deliveryConfig ?? DEFAULT_DELIVERY;
  const storeTheme = settingsCtx?.storeTheme;
  const pathname = usePathname();

  // Brandon mayo 15 v4 2026: footer oculto en /marketplace/carrito y /checkout/*.
  // Razón: en el flujo de compra (carrito → datos → entrega → confirmar), el
  // footer mete ruido visual y compite con el CTA "Continuar al checkout".
  // El cliente debe estar 100% enfocado en cerrar la compra, sin links salidos.
  // (Early return va abajo, tras todos los hooks, para no romper rules-of-hooks.)
  // Brandon 2026-05-31: mi-cuenta es el panel personal del cliente — el footer
  // de marketing (Explorar/Recetas/Gift Cards/redes) distrae y alarga. Lo
  // ocultamos igual que el flujo de checkout. El BottomNav sigue dando navegación.
  const isCheckoutFlow =
    pathname === "/marketplace/carrito" ||
    pathname?.startsWith("/checkout/") ||
    pathname === "/checkout" ||
    pathname?.startsWith("/marketplace/mi-cuenta");

  // Mayo 2026: footer simplificado en landing pages — antes 5 columnas
  // (Marketplace / Mi Cuenta / Vende en Buleje / Ayuda / Más) era aspiracional
  // para el tamaño actual del negocio y proyectaba desconfianza.
  // Brandon 2026-06-03: /negocios agregado para paridad con /abrir-tienda —
  // ambas son landings de marketing y deben caer SIEMPRE en el mismo modo de
  // footer (antes /negocios caía en el mega-footer y /abrir-tienda en el slim,
  // divergiendo cuando el nav no estaba en "tiendas-only").
  // Brandon 2026-06-13: `/` SALE de isLandingMode. El inicio ES el marketplace
  // (no una landing de marketing), así que debe usar el MISMO footer que la
  // ficha de tienda y el resto del marketplace — footer único en todas las
  // páginas. Las landings reales (/negocios, /vender, /abrir-tienda,
  // /repartidores) conservan el footer slim.
  // Brandon 2026-06-24: /abrir-tienda SALE de isLandingMode → usa el MISMO
  // footer completo (4 columnas) que el inicio, en vez del slim de landing.
  const isLandingMode =
    pathname.startsWith("/repartidores") ||
    pathname.startsWith("/negocios") ||
    pathname.startsWith("/vender");

  // Brandon mayo 2026: si el superadmin tiene activo el modo "Solo Tiendas"
  // (NavegacionTab) y el visitante está en /tiendas, mostramos un footer
  // compacto sin links del ecosistema marketplace. Cuando vuelva al modo
  // "Marketplace completo" se renderea el mega-footer normalmente.
  //
  // Brandon 2026-05-21 perf FOUC v2: si el segment layout pasa modeOverride
  // (ej. `/tiendas/layout.tsx` → "tiendas-only"), úsalo como verdad. Sin él,
  // el SSR renderaba mega-footer y el cliente recortaba post-hidratación.
  const navModeHook = useMarketplaceNavMode();
  const navMode = modeOverride ?? navModeHook;
  // Brandon 2026-05-18: pad-bottom dinámico cuando hay items en carrito.
  // El StickyCartBar (52px pegado al BottomNav) tapa el copyright en
  // /marketplace/[slug] al hacer scroll abajo. Detectamos items > 0 y
  // sumamos su altura al padding inferior solo en mobile.
  const { itemCount } = useMarketplaceCart();
  const hasCart = itemCount > 0;
  // Brandon 2026-05-30: el footer de tiendas (rico, "Solo Tiendas") ahora se usa
  // en TODAS las páginas (inicio incluido) cuando el superadmin tiene el modo
  // tienda activo — footer ÚNICO y consistente. Antes solo aplicaba en /tiendas;
  // la home caía en isLandingMode (2 columnas), rompiendo la consistencia.
  // navMode === null (SSR / antes de hidratar el hook) se trata como
  // "tiendas-only" porque ES el default del marketplace → evita el FOUC
  // (mega-footer parpadeando antes de recortar al footer de tiendas).
  const isTiendasOnlyMode = navMode === "tiendas-only" || navMode === null;

  // Links del footer modo tienda gateados por la config del superadmin
  // (lib/nav-visibility). Inicio + Tiendas siempre; los demás solo si están
  // habilitados. Cómo pagar / Ayuda / legal son esenciales (siempre).
  // Init con los defaults SSR-safe (readNavVisibility devuelve defaultStore en
  // el server) → el render inicial YA respeta el modo tienda (ofertas/recetas/
  // explorar/en-vivo ocultos por default) sin flash de "todos los links".
  const [navVis, setNavVis] = useState<NavVisibilityMap>(() => readNavVisibility().marketplace);
  useEffect(() => {
    const read = () => setNavVis(readNavVisibility().marketplace);
    read();
    return subscribeNavVisibility(read);
  }, []);
  const linkOn = (id: string) => navVis[id] ?? true;
  const tiendasFooterLinks = [
    { href: "/", label: "Inicio" },
    { href: "/tiendas", label: "Tiendas" },
    ...(linkOn("ofertas") ? [{ href: "/marketplace/ofertas", label: "Ofertas" }] : []),
    ...(linkOn("recetas") ? [{ href: "/recetas", label: "Recetas" }] : []),
    ...(linkOn("explorar") ? [{ href: "/marketplace/explorar", label: "Explorar" }] : []),
    ...(linkOn("en-vivo") ? [{ href: "/marketplace/en-vivo", label: "En Vivo" }] : []),
    ...(linkOn("negocios") ? [{ href: "/negocios", label: "Negocios" }] : []),
    ...(linkOn("abrir-tienda") ? [{ href: "/abrir-tienda", label: "Abre tu tienda" }] : []),
    { href: "/marketplace/como-pagar", label: "Cómo pagar" },
    { href: "/cuenta/pedidos", label: "Mis pedidos" },
    { href: "/ayuda", label: "Ayuda" },
    { href: "/terminos", label: "Términos" },
    { href: "/privacidad", label: "Privacidad" },
    { href: "/libro-de-reclamaciones", label: "Libro de Reclamaciones" },
  ];
  // Marca de la plataforma (gestionada en /superadmin/marca).
  // Cuando storeTheme está vacío, la marca de la plataforma se usa como fallback.
  const { brand } = usePlatformBrand();
  const platformName = brand?.identity.name || "Buleje";
  const platformPhone = brand?.contact.phone ?? "";
  const platformWa = brand?.contact.whatsapp ?? "";
  const platformCity = brand?.identity.city || BRAND_GEO.city;
  const platformRegion = brand?.identity.country || BRAND_GEO.region;
  const fbUrl = brand?.socials.facebook || "";
  const igUrl = brand?.socials.instagram || "";

  if (isCheckoutFlow) return null;

  const DAY_NAMES = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
  const todayName = todayDow !== null ? DAY_NAMES[todayDow] : null;
  const todayEntry = todayName ? deliveryConfig.hours.find((h) => h.day === todayName) : undefined;
  const hoursLabel = todayEntry?.enabled ? `Hoy: ${todayEntry.open} – ${todayEntry.close}` : "Hoy: cerrado";

  return (
    <footer className="relative bg-gradient-to-b from-[#0d1414] via-[#0a1010] to-black text-white">
      {/* Hairline superior — acento teal de marca (minimalista, 1 solo color) */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-teal-400/50 to-transparent" />
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-teal-500/[0.05] to-transparent" />

      {/* Landing mode — footer minimalista 2 columnas honesto pre-launch.
          Solo si NO estamos en modo tienda (tiendas-only tiene precedencia →
          footer único consistente en inicio + tiendas + demás). */}
      {isLandingMode && !isTiendasOnlyMode && (
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
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-12 sm:pt-14 pb-8">
          {/* ── Banda de marca: identidad + contacto (formato verde-selva/ámbar) ── */}
          <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-8 lg:gap-12 items-start lg:items-center">
            {/* IZQ — wordmark + tagline + chips de confianza */}
            <div>
              {/* Logo blanco con glow teal sutil — firma de marca que se
                  despega del fondo grafito sin saturar (minimalista).
                  forceDark: el footer es SIEMPRE oscuro (grafito→negro) sin
                  importar el tema de la página, así que forzamos la "b" blanca
                  (mark-dark). Sin esto, en modo claro salía la "b oscura" →
                  negro sobre negro, sin contraste (fix Brandon 2026-06-02). */}
              <BulejeWordmark
                forceDark
                size={46}
                textSize={28}
                className="text-white drop-shadow-[0_0_18px_rgba(0,160,160,0.22)]"
              />
              <p className="mt-3.5 max-w-xl text-sm sm:text-base leading-snug font-medium">
                <span className="text-teal-300 font-extrabold">Tu mercado desde la selva amazónica.</span>{" "}
                <span className="text-white/70">Bodegas y tiendas de {platformCity} con delivery, en un solo lugar.</span>
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-teal-500/12 border border-teal-400/25 px-3 py-1.5 text-xs font-extrabold text-teal-200">
                  <MapPin className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
                  {platformCity}, {platformRegion}
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.04] border border-white/10 px-3 py-1.5 text-xs font-extrabold text-white/75">
                  <Star className="h-3.5 w-3.5 text-teal-300 fill-current" strokeWidth={0} aria-hidden />
                  <span className="tabular-nums">{hp.footerRating}</span>
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.04] border border-white/10 px-3 py-1.5 text-xs font-extrabold text-white/75">
                  <Clock className="h-3.5 w-3.5 text-white/55" strokeWidth={2.5} aria-hidden />
                  <span className="tabular-nums">{hoursLabel}</span>
                </span>
              </div>
            </div>

            {/* DER — CTA WhatsApp + redes (compacto, idéntico al mega footer) */}
            <div className="flex flex-col gap-3 lg:items-end">
              {(() => {
                // Bug fix 2026-05-30 (audit): hp.footerWhatsApp es una URL
                // (wa.me/<num>?text=...); el replace(/\D/g) viejo conservaba los
                // dígitos del query (%2C/%20) y rompía el número. extractWaNumber
                // corta en el `?` y maneja número crudo o URL. [[lib/wa-number]]
                const rawPhone = extractWaNumber(storeTheme?.whatsapp || platformWa || hp.footerWhatsApp);
                if (!rawPhone) return null;
                const text = encodeURIComponent(`Hola ${platformName}, quiero hacer un pedido`);
                return (
                  <a
                    href={`https://wa.me/${rawPhone}?text=${text}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group inline-flex h-12 items-center justify-center gap-2.5 rounded-2xl bg-emerald-500 px-5 text-sm font-extrabold text-white transition-all hover:bg-emerald-400 shadow-[0_8px_32px_-8px_rgba(16,185,129,0.45)] w-full lg:w-auto"
                  >
                    <WhatsAppIcon className="h-5 w-5" />
                    Pide por WhatsApp
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" strokeWidth={2.5} aria-hidden />
                  </a>
                );
              })()}
              <div className="flex items-center gap-2.5 justify-center lg:justify-end">
                <span className="text-sm font-semibold text-white/50">O síguenos</span>
                <a href={fbUrl || hp.footerFacebook} target="_blank" rel="noopener noreferrer" aria-label="Facebook" className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/12 bg-white/[0.04] hover:border-teal-300/60 hover:bg-teal-300/10 hover:text-teal-200 transition-colors">
                  <Facebook className="h-4 w-4" strokeWidth={2} aria-hidden />
                </a>
                <a href={igUrl || hp.footerInstagram} target="_blank" rel="noopener noreferrer" aria-label="Instagram" className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/12 bg-white/[0.04] hover:border-teal-300/60 hover:bg-teal-300/10 hover:text-teal-200 transition-colors">
                  <Instagram className="h-4 w-4" strokeWidth={2} aria-hidden />
                </a>
              </div>
            </div>
          </div>

          {/* Separador con acento verde selva */}
          <div className="mt-8 h-px bg-gradient-to-r from-transparent via-teal-400/20 to-transparent" />

          {/* ── Links: una fila limpia, sin badge de jerga interna ── */}
          <nav aria-label="Enlaces de tiendas" className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2.5">
            {tiendasFooterLinks.map((link) => (
              <a
                key={link.label}
                href={link.href}
                className="text-sm font-semibold text-white/70 transition-colors hover:text-teal-200"
              >
                {link.label}
              </a>
            ))}
          </nav>
        </div>
      )}

      {/* Footer v2 — compacto + identidad amazónica.
          Una sola banda HERO (logo + tagline + CTA WhatsApp) seguida de
          4 grupos de links con acordeón mobile. Marca: verde selva + ámbar
          Buleje como acento. Sin newsletter ni perks duplicados. */}
      {!isLandingMode && !isTiendasOnlyMode && (
      <>
        {/* ── HERO BAND v2: 1 banda corta — logo + tagline + CTA WhatsApp ── */}
        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-8 sm:pt-10 pb-6 sm:pb-8">
          <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-5 lg:gap-10 items-center">
            {/* IZQ: marca + tagline amazónico + chips */}
            <div>
              <BulejeWordmark
                forceDark
                size={44}
                strokeWidth={1.75}
                textSize={26}
                className="text-white drop-shadow-[0_0_18px_rgba(0,160,160,0.22)]"
              />
              <p className="mt-3 text-base leading-snug font-medium max-w-xl">
                <span className="text-teal-300 font-extrabold">Tu mercado desde la selva amazónica.</span>{" "}
                <span className="text-white/80">Bodegas, restaurantes y emprendedores de {platformCity}, en un solo lugar.</span>
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-teal-500/12 border border-teal-400/25 px-3 py-1 text-xs font-extrabold text-teal-200">
                  <MapPin className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
                  {platformCity}, {platformRegion}
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.04] border border-white/10 px-3 py-1 text-xs font-extrabold text-white/75">
                  <Star className="h-3.5 w-3.5 text-teal-300 fill-current" strokeWidth={0} aria-hidden />
                  <span className="tabular-nums">{hp.footerRating}</span>
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.04] border border-white/10 px-3 py-1 text-xs font-extrabold text-white/75">
                  <Clock className="h-3.5 w-3.5 text-white/55" strokeWidth={2.5} aria-hidden />
                  <span className="tabular-nums">{hoursLabel}</span>
                </span>
              </div>
            </div>

            {/* DER: CTA WhatsApp + iconos sociales compactos */}
            <div className="flex flex-col gap-3 lg:items-end">
              {(() => {
                // Bug fix 2026-05-30 (audit): hp.footerWhatsApp es una URL
                // (wa.me/<num>?text=...); el replace(/\D/g) viejo conservaba los
                // dígitos del query (%2C/%20) y rompía el número. extractWaNumber
                // corta en el `?` y maneja número crudo o URL. [[lib/wa-number]]
                const rawPhone = extractWaNumber(storeTheme?.whatsapp || platformWa || hp.footerWhatsApp);
                if (!rawPhone) return null;
                const text = encodeURIComponent(`Hola ${storeTheme?.name || platformName}, quiero hacer un pedido`);
                return (
                  <a
                    href={`https://wa.me/${rawPhone}?text=${text}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group inline-flex items-center justify-center gap-2.5 h-12 px-5 w-full lg:w-auto rounded-xl bg-emerald-500 text-white text-base font-extrabold hover:bg-emerald-400 transition-all shadow-[0_8px_28px_-10px_rgba(16,185,129,0.45)]"
                  >
                    <WhatsAppIcon className="h-6 w-6" />
                    Haz tu pedido por WhatsApp
                    <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-0.5" strokeWidth={2.5} aria-hidden />
                  </a>
                );
              })()}
              <div className="flex items-center gap-2.5 justify-center lg:justify-end">
                <span className="text-sm font-semibold text-white/55">O síguenos</span>
                <a
                  href={fbUrl || hp.footerFacebook}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Facebook"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-white/[0.04] hover:border-teal-300/60 hover:bg-teal-300/10 hover:text-teal-200 transition-colors"
                >
                  <Facebook className="h-4 w-4" strokeWidth={2} aria-hidden />
                </a>
                <a
                  href={igUrl || hp.footerInstagram}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Instagram"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-white/[0.04] hover:border-teal-300/60 hover:bg-teal-300/10 hover:text-teal-200 transition-colors"
                >
                  <Instagram className="h-4 w-4" strokeWidth={2} aria-hidden />
                </a>
                <a
                  href={`tel:${(storeTheme?.phone || platformPhone || "+51929340532").replace(/\s/g, "")}`}
                  aria-label="Llamar"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-white/[0.04] hover:border-teal-300/60 hover:bg-teal-300/10 hover:text-teal-200 transition-colors"
                >
                  <Phone className="h-4 w-4" strokeWidth={2} aria-hidden />
                </a>
              </div>
            </div>
          </div>
        </div>

        {/* Separador con acento verde selva */}
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="h-px bg-gradient-to-r from-transparent via-teal-400/20 to-transparent" />
        </div>

        {/* ── LINKS: 4 grupos con acordeón mobile (cerrados) + abiertos desktop ── */}
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-3 pb-5 lg:py-8">
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-0 lg:gap-10">
            <LinkGroup title={t("footer.marketplace")} icon={Store} links={marketplaceLinks} accent="amber" />
            <LinkGroup title={t("footer.myAccount")} icon={UserCircle2} links={cuentaLinks} accent="emerald" />
            <LinkGroup title={t("footer.sellOnBuleje")} icon={Briefcase} links={businessLinks} accent="sky" />
            <LinkGroup title={t("footer.help")} icon={LifeBuoy} links={helpLinks} accent="rose" />
          </div>
          {/* Categorías como chips horizontales debajo de los 4 grupos */}
          <div className="mt-5 lg:mt-8 pt-5 lg:pt-6 border-t border-white/10">
            <h4 className="text-xs font-extrabold uppercase tracking-[var(--ls-wider)] text-white/60 mb-3 inline-flex items-center gap-2">
              <Leaf className="h-4 w-4 text-emerald-300" strokeWidth={2.5} aria-hidden />
              Categorías populares
            </h4>
            <ul className="flex flex-wrap gap-2">
              {categoryLinks.map((link) => (
                <li key={link.label}>
                  <a
                    href={link.href}
                    className="inline-flex items-center rounded-full border border-white/15 bg-white/[0.04] px-3.5 py-1.5 text-xs font-bold text-white/85 hover:bg-teal-300/10 hover:text-teal-200 hover:border-teal-300/40 transition-colors"
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
      <div className={`border-t border-teal-400/15 bg-black/50 backdrop-blur-sm ${hasCart ? "pb-[calc(130px+env(safe-area-inset-bottom))]" : "pb-[calc(72px+env(safe-area-inset-bottom))]"} sm:pb-0`}>
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-3.5 sm:py-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 sm:gap-4">
            {/* Trust + payment chips — minimalista: pills neutras + ícono teal
                (mono + 1 acento de marca). Sin 4 colores distintos. */}
            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-1.5">
              {([
                { Icon: ShieldCheck, label: "Sitio seguro" },
                { Icon: CreditCard, label: "Yape · Plin" },
                { Icon: Wallet, label: "Efectivo" },
                { Icon: Truck, label: "Delivery" },
              ] as const).map(({ Icon, label }) => (
                <span
                  key={label}
                  className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold text-white/70 bg-white/[0.04] border border-white/10"
                >
                  <Icon className="h-3.5 w-3.5 text-teal-300" strokeWidth={2.5} aria-hidden />
                  {label}
                </span>
              ))}
            </div>

            {/* Copyright + legal — 1 línea */}
            <p className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-xs sm:text-sm text-white/60 tabular-nums">
              {/* Brandon 2026-05-20 v9 audit P0: storeTheme.name venía como
                  "Bodega Buleje Test" del tenant resuelto por fallback en
                  rutas marketplace publicas (/, /tiendas, /negocios,
                  /marketplace/[slug]). Forzamos "Buleje" para que el
                  copyright nunca filtre el nombre del tenant interno. */}
              <span className="font-bold text-white/80">© {year} Buleje</span>
              <span aria-hidden className="text-teal-400/40">·</span>
              <span className="hidden sm:inline">Hecho con cariño en {platformCity}</span>
              <span aria-hidden className="hidden sm:inline text-teal-400/40">·</span>
              <a href="/privacidad" className="font-semibold hover:text-teal-200 transition-colors">Privacidad</a>
              <span aria-hidden className="text-teal-400/40">·</span>
              <a href="/terminos" className="font-semibold hover:text-teal-200 transition-colors">Términos</a>
              <span aria-hidden className="text-teal-400/40">·</span>
              <a
                href="/libro-de-reclamaciones"
                className="inline-flex items-center gap-1 font-semibold text-teal-200 hover:text-teal-100 transition-colors"
              >
                <BookText className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
                Libro de Reclamaciones
              </a>
            </p>
          </div>

          {/* Identificación legal del titular (Ley 29571) — visible en todos los
              modos. Solo se muestra cuando lib/legal.ts ya tiene los datos reales
              (LEGAL_COMPLETO) para no publicar placeholders. */}
          {LEGAL_COMPLETO && (
            <p className="mt-3 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 border-t border-white/10 pt-3 text-xs text-white/45 sm:justify-start">
              <Scale className="h-3.5 w-3.5 text-white/40" strokeWidth={2.5} aria-hidden />
              <span className="font-semibold text-white/60">{LEGAL.razonSocial}</span>
              <span aria-hidden className="text-teal-400/30">·</span>
              <span className="tabular-nums">RUC {LEGAL.ruc}</span>
              <span aria-hidden className="text-teal-400/30">·</span>
              <span>{LEGAL.domicilioFiscal}</span>
            </p>
          )}
        </div>
      </div>
    </footer>
  );
}
