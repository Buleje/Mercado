"use client";

/**
 * SuperAdminModuleTabs — barra de tabs que unifica rutas hermanas en un solo
 * "módulo con funciones completas" (Brandon 2026-06-17, consolidación superadmin).
 *
 * Cada tab es una ruta real (deep-link intacto, sin remontar componentes
 * pesados ni juggling de SSR). La pestaña activa se resuelve por pathname.
 * Se inyecta al tope de cada página del módulo (justo dentro de SUPERADMIN_PAGE).
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type RefObject } from "react";
import {
  Receipt,
  CreditCard,
  Smartphone,
  SlidersHorizontal,
  Webhook,
  Building2,
  TrendingUp,
  Gauge,
  Rocket,
  Cable,
  MapPin,
  Boxes,
  BarChart3,
  Activity,
  Layers,
  HeartPulse,
  AlertOctagon,
  ShieldAlert,
  MessageSquare,
  Megaphone,
  Inbox,
  ShieldCheck,
  Scale,
  History,
  FileCheck,
  Store,
  Sparkles,
  Palette,
  Image as ImageIcon,
  Bell,
  HeartHandshake,
  TreePine,
  AlertTriangle,
  ClipboardCheck,
  type LucideIcon,
} from "@buleje/design-system/icons";

export interface ModuleTab {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Contador opcional (ej. nº de alertas, solicitudes pendientes). 0/undefined = sin badge. */
  badge?: number;
}

/** Desvanecido del borde que tiene más pestañas escondidas (sólo alfa: sin color). */
const BORDE_IZQ = "[mask-image:linear-gradient(to_right,transparent,black_2rem)]";
const BORDE_DER = "[mask-image:linear-gradient(to_right,black_calc(100%_-_2rem),transparent)]";
const BORDE_AMBOS =
  "[mask-image:linear-gradient(to_right,transparent,black_2rem,black_calc(100%_-_2rem),transparent)]";

/**
 * Bordes con pestañas escondidas de una fila con scroll horizontal, y la rueda
 * vertical convertida en horizontal mientras la fila tenga para dónde moverse
 * (con mouse no hay otra forma de ver las del final: la barra va oculta).
 */
function useBordesDeScroll(navRef: RefObject<HTMLElement | null>, activo: boolean, clave: string) {
  const [bordes, setBordes] = useState({ izq: false, der: false });
  useEffect(() => {
    const nav = navRef.current;
    if (!activo || !nav) return;
    const medir = () => {
      const izq = nav.scrollLeft > 1;
      const der = nav.scrollLeft + nav.clientWidth < nav.scrollWidth - 1;
      setBordes((b) => (b.izq === izq && b.der === der ? b : { izq, der }));
    };
    const rueda = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      const max = nav.scrollWidth - nav.clientWidth;
      if (max <= 0) return;
      const puede = e.deltaY > 0 ? nav.scrollLeft < max - 1 : nav.scrollLeft > 1;
      if (!puede) return;
      e.preventDefault();
      nav.scrollLeft += e.deltaY;
    };
    medir();
    nav.addEventListener("scroll", medir, { passive: true });
    nav.addEventListener("wheel", rueda, { passive: false });
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(medir) : null;
    ro?.observe(nav);
    return () => {
      nav.removeEventListener("scroll", medir);
      nav.removeEventListener("wheel", rueda);
      ro?.disconnect();
    };
  }, [navRef, activo, clave]);
  return bordes;
}

export function SuperAdminModuleTabs({
  tabs,
  enLinea = false,
}: {
  tabs: ModuleTab[];
  /**
   * Fila en línea para el slot `pestanas` de la cabecera (`CabeceraConPestanas`
   * o `AdminTabShell`): sin regla ni márgenes propios, al lado del título.
   */
  enLinea?: boolean;
}) {
  const pathname = usePathname();
  const navRef = useRef<HTMLElement>(null);
  const activeRef = useRef<HTMLAnchorElement>(null);
  // En hubs con varias tabs (mobile/narrow), traer la tab activa a la vista.
  useEffect(() => {
    const nav = navRef.current;
    const act = activeRef.current;
    if (!act) return;
    if (enLinea && nav) {
      // Sólo la fila: `scrollIntoView` también movía la página si la fila no
      // estaba entera a la vista.
      nav.scrollLeft = act.offsetLeft - (nav.clientWidth - act.offsetWidth) / 2;
    } else {
      act.scrollIntoView({ inline: "center", block: "nearest" });
    }
  }, [pathname, enLinea]);
  const bordes = useBordesDeScroll(navRef, enLinea, `${pathname}|${tabs.map((t) => `${t.href}:${t.badge ?? 0}`).join(",")}`);
  const mascara = bordes.izq && bordes.der ? BORDE_AMBOS : bordes.izq ? BORDE_IZQ : bordes.der ? BORDE_DER : "";
  return (
    // Minimalista: fila flush a la izquierda (sin padding propio — hereda el del
    // <main>, así alinea con el título de abajo) + regla fina inferior para
    // separar del contenido. El tab activo es una pastilla teal sólida.
    // `enLinea`: va dentro de la banda del título; scroll propio sin barra.
    <nav
      ref={navRef}
      className={
        enLinea
          ? `relative flex min-w-0 items-center gap-0.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${mascara}`
          : "-mt-1 mb-4 flex items-center gap-0.5 overflow-x-auto border-b border-[var(--rule-soft)] pb-2"
      }
      aria-label="Secciones del módulo"
    >
      {tabs.map(({ label, href, icon: Icon, badge }) => {
        const active = pathname === href;
        return (
          <Link
            key={href}
            ref={active ? activeRef : undefined}
            href={href}
            aria-current={active ? "page" : undefined}
            className={[
              "inline-flex shrink-0 items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-semibold whitespace-nowrap transition-colors duration-150",
              active
                ? "bg-[var(--accent)] text-white shadow-sm"
                : "text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]",
            ].join(" ")}
          >
            <Icon className="h-4 w-4 shrink-0" strokeWidth={2.25} aria-hidden />
            {label}
            {typeof badge === "number" && badge > 0 && (
              <span
                className={[
                  "ml-0.5 inline-flex min-w-[1.25rem] items-center justify-center rounded-full px-1.5 text-[length:var(--ts-2xs)] font-bold tabular-nums",
                  active
                    ? "bg-white/25 text-white"
                    : "bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]",
                ].join(" ")}
                aria-label={`${badge} pendientes`}
              >
                {badge > 99 ? "99+" : badge}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

// ─── Configs por módulo (single source) ──────────────────────────────────────

export const FINANZAS_TABS: ModuleTab[] = [
  { label: "Billing & Stripe", href: "/superadmin/billing", icon: Receipt },
  { label: "Pagos pendientes", href: "/superadmin/pagos-pendientes", icon: CreditCard },
  { label: "Pagos Yape (IA)", href: "/superadmin/pagos-yape", icon: Smartphone },
];

export const SETTINGS_TABS: ModuleTab[] = [
  { label: "Plataforma", href: "/superadmin/settings", icon: SlidersHorizontal },
  { label: "Integraciones & Flags", href: "/superadmin/configuracion", icon: Webhook },
];

export const TENANTS_TABS: ModuleTab[] = [
  { label: "Tiendas", href: "/superadmin/tenants", icon: Building2 },
  { label: "Crecimiento", href: "/superadmin/tenants/growth", icon: TrendingUp },
  { label: "Uso & límites", href: "/superadmin/tenants/usage", icon: Gauge },
  { label: "Activación", href: "/superadmin/tenants/onboarding", icon: Rocket },
  { label: "Integraciones", href: "/superadmin/tenants/integrations", icon: Cable },
  { label: "Mapa", href: "/superadmin/tenants/map", icon: MapPin },
  { label: "Qué tiene cada negocio", href: "/superadmin/specializations", icon: Boxes },
];

// Consolidación 2026 (Brandon): clusters de rutas hermanas unificados en módulos
// con tabs. El nav muestra UNA entrada por cluster; las demás rutas siguen vivas
// como tabs (deep-link intacto).

export const ANALYTICS_TABS: ModuleTab[] = [
  { label: "Analytics", href: "/superadmin/analytics", icon: BarChart3 },
  { label: "Adopción", href: "/superadmin/feature-adoption", icon: TrendingUp },
  { label: "Cohortes", href: "/superadmin/cohorts", icon: Layers },
  { label: "Inteligencia de Barrio", href: "/superadmin/intelligence", icon: Activity },
];

export const SALUD_TABS: ModuleTab[] = [
  { label: "Salud", href: "/superadmin/health", icon: HeartPulse },
  { label: "SLO & budgets", href: "/superadmin/slo", icon: TrendingUp },
  { label: "Dead-letter", href: "/superadmin/dlq", icon: AlertOctagon },
  { label: "Errores negocios", href: "/superadmin/tenant-errors", icon: ShieldAlert },
];

export const COMUNICACION_TABS: ModuleTab[] = [
  { label: "Chat", href: "/superadmin/chat", icon: MessageSquare },
  { label: "Comunicados", href: "/superadmin/comunicados", icon: Megaphone },
  { label: "Soporte", href: "/superadmin/support", icon: Inbox },
];

export const SEGURIDAD_TABS: ModuleTab[] = [
  { label: "Seguridad", href: "/superadmin/security", icon: ShieldCheck },
  { label: "Ley 29733", href: "/superadmin/compliance", icon: Scale },
  { label: "Auditoría", href: "/superadmin/audit-log", icon: History },
];

export const VENDORS_TABS: ModuleTab[] = [
  { label: "Solicitudes", href: "/superadmin/vendor-applications", icon: FileCheck },
  { label: "Salud de vendors", href: "/superadmin/vendor-health", icon: HeartPulse },
];

export const MARKETPLACE_TABS: ModuleTab[] = [
  { label: "Resumen", href: "/superadmin/marketplace", icon: Store },
  { label: "Tiendas", href: "/superadmin/stores", icon: Boxes },
];

export const MARCA_TABS: ModuleTab[] = [
  { label: "Marca", href: "/superadmin/marca", icon: Sparkles },
  { label: "Banners", href: "/superadmin/banners", icon: ImageIcon },
  { label: "Banco de imágenes", href: "/superadmin/banco-imagenes", icon: ImageIcon },
];

export const DISENO_TABS: ModuleTab[] = [
  { label: "Centro de diseño", href: "/superadmin/design-system", icon: Palette },
  { label: "Plantilla del admin", href: "/superadmin/plantilla", icon: Layers },
];

export const RETENCION_TABS: ModuleTab[] = [
  { label: "Alertas", href: "/superadmin/alerts", icon: Bell },
  { label: "Rescate", href: "/superadmin/rescue", icon: HeartHandshake },
];

/** Aserraderos con el libro forestal: control de volumen e inspección (17-10). */
export const PLANTAS_TABS: ModuleTab[] = [
  { label: "Plantas", href: "/superadmin/plantas", icon: TreePine },
  { label: "Incoherencias", href: "/superadmin/plantas/incoherencias", icon: AlertTriangle },
  { label: "Inspecciones", href: "/superadmin/plantas/inspecciones", icon: ClipboardCheck },
];
