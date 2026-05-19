import Link from "next/link";
import { cookies } from "next/headers";
import {
  ImageIcon,
  Truck,
  ShoppingBag,
  Percent,
  Users,
  ArrowUpRight,
  Lock,
  Sparkles,
  TrendingUp,
  Store,
  AlertCircle,
} from "lucide-react";
import { MarketplaceAdminDB } from "@/lib/db/marketplace-public.db";
import { SupplierSignupDB } from "@/lib/db/supplier-signup.db";

/**
 * /superadmin/marketplace — Hub multi-vendor.
 *
 * Server component con KPIs reales del platform overview.
 * Patrón: hero envolvente + LiveCard con pulse data + SoonCard aspiracional.
 */

type Status = "live" | "soon";

interface Section {
  href: string;
  title: string;
  desc: string;
  hint: string;
  icon: typeof Truck;
  status: Status;
  ariaLabel: string;
  eta?: string;
  metricKey?: "pending" | "stores" | "categories";
  cta: string;
}

const SECTIONS: Section[] = [
  {
    href: "/superadmin/marketplace/suppliers",
    title: "Proveedores",
    desc: "Aprueba o rechaza solicitudes de proveedores que quieren listar productos en el marketplace cross-vendor.",
    hint: "Cola de aprobación",
    icon: Truck,
    status: "live",
    ariaLabel: "Ir a la cola de proveedores",
    metricKey: "pending",
    cta: "Revisar cola",
  },
  {
    href: "/superadmin/marketplace/category-images",
    title: "Imágenes de categorías",
    desc: "Define la imagen visible para cada categoría en el grid público (Abarrotes, Bebidas, Carnes…).",
    hint: "Editor visual",
    icon: ImageIcon,
    status: "live",
    ariaLabel: "Editar imágenes de categorías",
    metricKey: "categories",
    cta: "Editar imágenes",
  },
  {
    href: "/superadmin/stores",
    title: "Tiendas publicadas",
    desc: "Listado de tiendas (vendors) publicadas. Activa o pausa su visibilidad pública en el marketplace.",
    hint: "Gestión vendors",
    icon: ShoppingBag,
    status: "live",
    ariaLabel: "Ir a tiendas publicadas",
    metricKey: "stores",
    cta: "Gestionar tiendas",
  },
  {
    href: "/superadmin/marketplace/commissions",
    title: "Comisiones",
    desc: "Configura porcentajes de comisión por categoría, por plan o por vendor individual.",
    hint: "Modelo de revenue",
    icon: Percent,
    status: "soon",
    ariaLabel: "Comisiones — próximamente",
    eta: "Q3 2026",
    cta: "Próximamente",
  },
  {
    href: "/superadmin/marketplace/vendors",
    title: "Vendors avanzado",
    desc: "Gestión completa de vendors aprobados: payouts, contratos, rating, métricas de venta.",
    hint: "Payouts & ratings",
    icon: Users,
    status: "soon",
    ariaLabel: "Vendors avanzado — próximamente",
    eta: "Q4 2026",
    cta: "Próximamente",
  },
];

interface HubMetrics {
  pendingSuppliers: number;
  activeStores: number;
  totalStores: number;
  monthRevenueSoles: number;
  monthOrders: number;
  monthCommissionSoles: number;
  pendingOrders: number;
}

async function loadMetrics(): Promise<HubMetrics> {
  try {
    const [overview, pendingSup] = await Promise.all([
      MarketplaceAdminDB.getPlatformOverview(),
      SupplierSignupDB.listPendingReview(500),
    ]);
    return {
      pendingSuppliers: pendingSup.length,
      activeStores: overview.activeStores ?? 0,
      totalStores: overview.totalStores ?? 0,
      monthRevenueSoles: Number(overview.monthOrders?._sum?.total ?? 0),
      monthOrders: overview.monthOrders?._count ?? 0,
      monthCommissionSoles: Number(overview.totalCommissions?._sum?.amount ?? 0),
      pendingOrders: overview.pendingOrders ?? 0,
    };
  } catch {
    return {
      pendingSuppliers: 0,
      activeStores: 0,
      totalStores: 0,
      monthRevenueSoles: 0,
      monthOrders: 0,
      monthCommissionSoles: 0,
      pendingOrders: 0,
    };
  }
}

const PESOS = new Intl.NumberFormat("es-PE", {
  style: "currency",
  currency: "PEN",
  maximumFractionDigits: 0,
});
const NUM = new Intl.NumberFormat("es-PE");

export default async function SuperadminMarketplaceHubPage() {
  // Next 16 cacheComponents: leer Request data ANTES de cualquier new Date()
  // dentro de las funciones del DB layer evita el prerender error.
  await cookies();
  const m = await loadMetrics();
  const live = SECTIONS.filter((s) => s.status === "live");
  const soon = SECTIONS.filter((s) => s.status === "soon");

  const cardMetric = (key?: Section["metricKey"]): { value: string; label: string; tone: "warn" | "accent" | "neutral" } | null => {
    if (!key) return null;
    if (key === "pending") {
      return {
        value: NUM.format(m.pendingSuppliers),
        label: m.pendingSuppliers === 1 ? "solicitud pendiente" : "solicitudes pendientes",
        tone: m.pendingSuppliers > 0 ? "warn" : "neutral",
      };
    }
    if (key === "stores") {
      return {
        value: NUM.format(m.activeStores),
        label: `de ${m.totalStores} publicadas`,
        tone: "accent",
      };
    }
    if (key === "categories") {
      return { value: "9", label: "categorías base", tone: "neutral" };
    }
    return null;
  };

  return (
    <div className="min-h-screen bg-[var(--surface-canvas)]">
      {/* ── HERO envolvente con accent strip y KPIs grandes ─────────────── */}
      <header className="relative overflow-hidden border-b border-[var(--rule-base)] bg-[var(--surface-raised)]">
        {/* Accent strip superior */}
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[var(--accent)] via-[var(--accent)]/60 to-transparent" />
        {/* Glow decorativo derecho */}
        <div
          aria-hidden
          className="pointer-events-none absolute right-0 top-0 hidden h-full w-1/2 bg-gradient-to-l from-[var(--accent)]/[0.06] to-transparent lg:block"
        />

        <div className="relative mx-auto max-w-[1400px] px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div className="flex items-start gap-4">
              <span className="relative inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[var(--accent-600,var(--accent))] text-white shadow-lg shadow-[var(--accent)]/20">
                <Store className="h-7 w-7" strokeWidth={1.75} aria-hidden />
                <span className="absolute -right-1 -top-1 inline-flex h-3 w-3 items-center justify-center">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--data-success-500)]/60" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[var(--data-success-500)] ring-2 ring-[var(--surface-raised)]" />
                </span>
              </span>
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-[var(--ls-wider)] text-[var(--accent)]">
                    Plataforma multi-vendor
                  </p>
                  <span className="inline-flex items-center gap-1 rounded-full bg-[var(--data-success-500)]/10 px-2 py-0.5 text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--data-success-500)]">
                    <span className="h-1.5 w-1.5 rounded-full bg-[var(--data-success-500)]" />
                    Live
                  </span>
                </div>
                <h1 className="mt-1 font-display text-3xl font-extrabold tracking-tight text-[var(--text-primary)] sm:text-4xl">
                  Marketplace
                </h1>
                <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[var(--text-secondary)] sm:text-base">
                  Centro de control cross-store. Aprueba vendors, gestiona categorías y monitorea
                  el revenue del marketplace multi-tenant desde un solo lugar.
                </p>
              </div>
            </div>

            {m.pendingSuppliers > 0 && (
              <Link
                href="/superadmin/marketplace/suppliers"
                className="group inline-flex items-center gap-2.5 rounded-2xl border border-[var(--data-warning-500,#f59e0b)]/30 bg-[var(--data-warning-500,#f59e0b)]/10 px-4 py-2.5 text-sm font-bold text-[var(--data-warning-700,#b45309)] transition hover:border-[var(--data-warning-500,#f59e0b)]/50 hover:bg-[var(--data-warning-500,#f59e0b)]/15 dark:text-[var(--data-warning-300,#fbbf24)]"
              >
                <AlertCircle className="h-4 w-4" strokeWidth={2} aria-hidden />
                <span>
                  {m.pendingSuppliers} {m.pendingSuppliers === 1 ? "proveedor espera" : "proveedores esperan"} revisión
                </span>
                <ArrowUpRight className="h-4 w-4 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5" aria-hidden />
              </Link>
            )}
          </div>

          {/* KPI Row — métricas reales */}
          <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
            <KpiTile
              label="Tiendas activas"
              value={NUM.format(m.activeStores)}
              hint={`de ${m.totalStores} totales`}
              tone="accent"
            />
            <KpiTile
              label="Pedidos mes"
              value={NUM.format(m.monthOrders)}
              hint={m.pendingOrders > 0 ? `${m.pendingOrders} pendientes` : "Sin pendientes"}
              tone={m.pendingOrders > 0 ? "warn" : "default"}
            />
            <KpiTile
              label="Revenue mes"
              value={PESOS.format(m.monthRevenueSoles)}
              hint="GMV marketplace"
              tone="default"
              trending
            />
            <KpiTile
              label="Comisión mes"
              value={PESOS.format(m.monthCommissionSoles)}
              hint="Generado por plataforma"
              tone="success"
            />
          </div>
        </div>
      </header>

      {/* ── Content ─────────────────────────────────────────────────────── */}
      <div className="mx-auto max-w-[1400px] space-y-10 px-4 py-8 sm:px-6 lg:px-8">
        {/* Operaciones activas */}
        <section className="space-y-5">
          <SectionHeading
            title="Operaciones activas"
            subtitle="Acciones disponibles ahora en producción."
            count={live.length}
            countLabel="LIVE"
            tone="live"
          />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {live.map((s) => (
              <LiveCard key={s.href} section={s} metric={cardMetric(s.metricKey)} />
            ))}
          </div>
        </section>

        {/* Roadmap */}
        {soon.length > 0 && (
          <section className="space-y-5">
            <SectionHeading
              title="Roadmap"
              subtitle="Próximas capacidades del marketplace."
              count={soon.length}
              countLabel="SOON"
              tone="soon"
            />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {soon.map((s) => (
                <SoonCard key={s.href} section={s} />
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

/* ─────────────────────── components ─────────────────────── */

function KpiTile({
  label,
  value,
  hint,
  tone = "default",
  trending,
}: {
  label: string;
  value: string;
  hint: string;
  tone?: "default" | "accent" | "success" | "warn";
  trending?: boolean;
}) {
  const toneClass =
    tone === "accent"
      ? "border-[var(--accent)]/25 bg-[var(--accent)]/[0.04]"
      : tone === "success"
        ? "border-[var(--data-success-500)]/25 bg-[var(--data-success-500)]/[0.05]"
        : tone === "warn"
          ? "border-[var(--data-warning-500,#f59e0b)]/30 bg-[var(--data-warning-500,#f59e0b)]/[0.06]"
          : "border-[var(--rule-base)] bg-[var(--surface-canvas)]";

  const valueClass =
    tone === "accent"
      ? "text-[var(--accent)]"
      : tone === "success"
        ? "text-[var(--data-success-500)]"
        : tone === "warn"
          ? "text-[var(--data-warning-700,#b45309)] dark:text-[var(--data-warning-300,#fbbf24)]"
          : "text-[var(--text-primary)]";

  return (
    <div className={`relative overflow-hidden rounded-2xl border px-4 py-3.5 ${toneClass}`}>
      <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--text-tertiary)] leading-none">
        {label}
      </p>
      <div className="mt-2 flex items-baseline gap-2">
        <p className={`font-display text-2xl font-extrabold tabular-nums tracking-tight leading-none sm:text-3xl ${valueClass}`}>
          {value}
        </p>
        {trending && (
          <TrendingUp className="h-3.5 w-3.5 text-[var(--text-tertiary)]" strokeWidth={2.25} aria-hidden />
        )}
      </div>
      <p className="mt-2 text-xs text-[var(--text-tertiary)] leading-tight">{hint}</p>
    </div>
  );
}

function SectionHeading({
  title,
  subtitle,
  count,
  countLabel,
  tone,
}: {
  title: string;
  subtitle: string;
  count: number;
  countLabel: string;
  tone: "live" | "soon";
}) {
  const isLive = tone === "live";
  return (
    <div className="flex items-end justify-between gap-4">
      <div>
        <h2 className="font-display text-xl font-extrabold tracking-tight text-[var(--text-primary)] sm:text-2xl">
          {title}
        </h2>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">{subtitle}</p>
      </div>
      <span
        className={`shrink-0 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider tabular-nums ${
          isLive
            ? "bg-[var(--data-success-500)]/10 text-[var(--data-success-500)]"
            : "border border-[var(--rule-base)] bg-[var(--surface-canvas)] text-[var(--text-tertiary)]"
        }`}
      >
        {isLive && <span className="h-1.5 w-1.5 rounded-full bg-[var(--data-success-500)]" />}
        {count} {countLabel}
      </span>
    </div>
  );
}

function LiveCard({
  section,
  metric,
}: {
  section: Section;
  metric: { value: string; label: string; tone: "warn" | "accent" | "neutral" } | null;
}) {
  const Icon = section.icon;
  const hasPulse = metric?.tone === "warn";
  const metricColor =
    metric?.tone === "warn"
      ? "text-[var(--data-warning-700,#b45309)] dark:text-[var(--data-warning-300,#fbbf24)]"
      : metric?.tone === "accent"
        ? "text-[var(--accent)]"
        : "text-[var(--text-primary)]";

  return (
    <Link
      href={section.href}
      aria-label={section.ariaLabel}
      className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] transition-all hover:-translate-y-0.5 hover:border-[var(--accent)]/40 hover:shadow-lg hover:shadow-[var(--accent)]/[0.06]"
    >
      {/* Accent edge top */}
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-[var(--accent)]/0 via-[var(--accent)]/40 to-[var(--accent)]/0 opacity-0 transition-opacity group-hover:opacity-100"
      />

      <div className="flex items-start justify-between gap-3 p-5">
        <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--accent)]/10 text-[var(--accent)] transition group-hover:bg-[var(--accent)]/15">
          <Icon className="h-5 w-5" strokeWidth={1.75} aria-hidden />
        </span>

        {metric && (
          <div className="relative text-right">
            {hasPulse && (
              <span aria-hidden className="absolute -right-1 -top-1 inline-flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--data-warning-500,#f59e0b)]/50" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[var(--data-warning-500,#f59e0b)]" />
              </span>
            )}
            <p className={`font-display text-2xl font-extrabold tabular-nums leading-none ${metricColor}`}>
              {metric.value}
            </p>
            <p className="mt-1 text-[length:var(--ts-2xs)] uppercase tracking-wider text-[var(--text-tertiary)] leading-none">
              {metric.label}
            </p>
          </div>
        )}
      </div>

      <div className="flex-1 px-5">
        <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--accent)]">
          {section.hint}
        </p>
        <h3 className="mt-1 font-display text-lg font-extrabold tracking-tight text-[var(--text-primary)]">
          {section.title}
        </h3>
        <p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">
          {section.desc}
        </p>
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-[var(--rule-soft)] bg-[var(--surface-canvas)]/40 px-5 py-3 text-sm font-bold text-[var(--text-primary)] transition group-hover:bg-[var(--accent)]/5 group-hover:text-[var(--accent)]">
        <span>{section.cta}</span>
        <ArrowUpRight
          className="h-4 w-4 transition-all group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
          aria-hidden
        />
      </div>
    </Link>
  );
}

function SoonCard({ section }: { section: Section }) {
  const Icon = section.icon;
  return (
    <div
      aria-label={section.ariaLabel}
      aria-disabled="true"
      className="relative flex h-full flex-col overflow-hidden rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-sunken)]"
    >
      {/* Shimmer sutil aspiracional */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-gradient-to-br from-[var(--accent)]/[0.03] via-transparent to-transparent"
      />

      <div className="relative flex items-start justify-between gap-3 p-5">
        <span className="relative inline-flex h-11 w-11 items-center justify-center rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] text-[var(--text-tertiary)]">
          <Icon className="h-5 w-5" strokeWidth={1.75} aria-hidden />
          <span className="absolute -bottom-1 -right-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-[var(--surface-canvas)] text-[var(--text-tertiary)] ring-2 ring-[var(--surface-sunken)]">
            <Lock className="h-2.5 w-2.5" strokeWidth={2.5} aria-hidden />
          </span>
        </span>

        {section.eta && (
          <span className="inline-flex items-center gap-1 rounded-full border border-[var(--rule-base)] bg-[var(--surface-raised)] px-2.5 py-1 text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--text-tertiary)]">
            <Sparkles className="h-3 w-3" strokeWidth={2} aria-hidden />
            {section.eta}
          </span>
        )}
      </div>

      <div className="relative flex-1 px-5">
        <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--text-tertiary)]">
          {section.hint}
        </p>
        <h3 className="mt-1 font-display text-lg font-extrabold tracking-tight text-[var(--text-primary)]">
          {section.title}
        </h3>
        <p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">
          {section.desc}
        </p>
      </div>

      <div className="relative mt-4 flex items-center justify-between border-t border-[var(--rule-soft)] bg-[var(--surface-canvas)]/30 px-5 py-3 text-sm font-bold text-[var(--text-tertiary)]">
        <span className="inline-flex items-center gap-1.5">
          <Lock className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
          En desarrollo
        </span>
      </div>
    </div>
  );
}
