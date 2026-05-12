import Link from "next/link";
import {
  ImageIcon,
  Truck,
  ShoppingBag,
  Percent,
  Users,
  ArrowUpRight,
  Layers,
  Clock,
  Store,
} from "lucide-react";

/**
 * /superadmin/marketplace — Hub del marketplace multi-vendor.
 *
 * Sigue el patrón canónico (banners/marca):
 *   - Header con border-b + surface-raised + icon badge sólido --accent
 *   - StatPill canónico (rounded-xl border min-w-[88px])
 *   - max-w-[1400px] container
 *   - Color: --accent (teal). Sin gradientes custom.
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
  },
  {
    href: "/superadmin/marketplace/category-images",
    title: "Imágenes de categorías",
    desc: "Define la imagen visible para cada categoría en el grid público (Abarrotes, Bebidas, Carnes…).",
    hint: "Editor visual",
    icon: ImageIcon,
    status: "live",
    ariaLabel: "Editar imágenes de categorías",
  },
  {
    href: "/superadmin/stores",
    title: "Tiendas publicadas",
    desc: "Listado de tiendas (vendors) publicadas. Activa o pausa su visibilidad pública en el marketplace.",
    hint: "Gestión vendors",
    icon: ShoppingBag,
    status: "live",
    ariaLabel: "Ir a tiendas publicadas",
  },
  {
    href: "/superadmin/marketplace/commissions",
    title: "Comisiones",
    desc: "Configura porcentajes de comisión por categoría, por plan o por vendor individual.",
    hint: "Modelo de revenue",
    icon: Percent,
    status: "soon",
    ariaLabel: "Comisiones — próximamente",
  },
  {
    href: "/superadmin/marketplace/vendors",
    title: "Vendors avanzado",
    desc: "Gestión completa de vendors aprobados: payouts, contratos, rating, métricas de venta.",
    hint: "Payouts & ratings",
    icon: Users,
    status: "soon",
    ariaLabel: "Vendors avanzado — próximamente",
  },
];

export default function SuperadminMarketplaceHubPage() {
  const live = SECTIONS.filter((s) => s.status === "live");
  const soon = SECTIONS.filter((s) => s.status === "soon");

  return (
    <div className="min-h-screen bg-[var(--surface-canvas)]">
      {/* ── Hero canónico ─────────────────────────────────────────── */}
      <header className="border-b border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <div className="max-w-[1400px] mx-auto">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex items-start gap-3.5">
              <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--accent-600,var(--accent))] text-white shrink-0">
                <Store className="h-6 w-6" strokeWidth={1.75} aria-hidden />
              </span>
              <div>
                <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-[var(--ls-wider)] text-[var(--accent)] mb-1">
                  Plataforma multi-vendor
                </p>
                <h1 className="font-display text-2xl sm:text-3xl font-extrabold tracking-tight text-[var(--text-primary)]">
                  Marketplace
                </h1>
                <p className="text-sm text-[var(--text-secondary)] mt-1 max-w-2xl">
                  Hub de control del marketplace multi-vendor. Aprueba proveedores, gestiona imágenes
                  de categorías y controla las tiendas publicadas desde un solo lugar.
                </p>
              </div>
            </div>

            <div className="flex items-stretch gap-2 flex-wrap">
              <StatPill label="Activas" value={live.length} accent="success" />
              <StatPill label="Roadmap" value={soon.length} />
              <StatPill label="Total" value={SECTIONS.length} />
            </div>
          </div>
        </div>
      </header>

      {/* ── Content ───────────────────────────────────────────────── */}
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-8">
        {/* Operaciones activas */}
        <section className="space-y-4">
          <SectionHeading
            icon={Layers}
            title="Operaciones activas"
            subtitle="Acciones disponibles ahora en producción."
            count={live.length}
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {live.map((s) => (
              <LiveCard key={s.href} section={s} />
            ))}
          </div>
        </section>

        {/* Próximamente */}
        {soon.length > 0 && (
          <section className="space-y-4">
            <SectionHeading
              icon={Clock}
              title="Próximamente"
              subtitle="En el roadmap del marketplace. Vista previa de lo que viene."
              count={soon.length}
              muted
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
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

/* ─────────────────────── canonical components ─────────────────────── */

function StatPill({
  label,
  value,
  accent,
}: {
  label: string;
  value: string | number;
  accent?: "success" | "default";
}) {
  const isSuccess = accent === "success";
  return (
    <div
      className={`rounded-xl border px-3.5 py-2 min-w-[88px] ${
        isSuccess
          ? "border-[var(--data-success-500)]/30 bg-[var(--data-success-500)]/5"
          : "border-[var(--rule-base)] bg-[var(--surface-canvas)]"
      }`}
    >
      <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--text-tertiary)] leading-none">
        {label}
      </p>
      <p
        className={`font-display text-xl font-extrabold tabular-nums tracking-tight mt-1 leading-none ${
          isSuccess ? "text-[var(--data-success-500)]" : "text-[var(--text-primary)]"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function SectionHeading({
  icon: Icon,
  title,
  subtitle,
  count,
  muted,
}: {
  icon: typeof Layers;
  title: string;
  subtitle: string;
  count: number;
  muted?: boolean;
}) {
  return (
    <div className="flex items-end justify-between gap-4 border-b border-[var(--rule-soft)] pb-3">
      <div className="flex items-start gap-3">
        <span
          className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
            muted
              ? "bg-[var(--surface-sunken)] text-[var(--text-tertiary)]"
              : "bg-[var(--accent-soft,var(--accent))]/10 text-[var(--accent)]"
          }`}
        >
          <Icon className="h-4.5 w-4.5" strokeWidth={1.75} aria-hidden />
        </span>
        <div>
          <h2 className="font-display text-lg sm:text-xl font-extrabold tracking-tight text-[var(--text-primary)]">
            {title}
          </h2>
          <p className="mt-0.5 text-sm text-[var(--text-secondary)]">{subtitle}</p>
        </div>
      </div>
      <span
        className={`shrink-0 rounded-full px-3 py-1 text-xs font-extrabold tabular-nums ${
          muted
            ? "border border-[var(--rule-base)] bg-[var(--surface-canvas)] text-[var(--text-tertiary)]"
            : "bg-[var(--accent)]/10 text-[var(--accent)]"
        }`}
      >
        {count}
      </span>
    </div>
  );
}

function LiveCard({ section }: { section: Section }) {
  const Icon = section.icon;
  return (
    <Link
      href={section.href}
      aria-label={section.ariaLabel}
      className="group relative flex h-full flex-col gap-4 rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] p-5 transition-all hover:-translate-y-0.5 hover:border-[var(--accent)]/40 hover:shadow-md"
    >
      <div className="flex items-start justify-between">
        <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--accent)]/10 text-[var(--accent)] transition group-hover:bg-[var(--accent)]/15">
          <Icon className="h-5 w-5" strokeWidth={1.75} aria-hidden />
        </span>
        <ArrowUpRight
          className="h-4 w-4 text-[var(--text-tertiary)] transition-all group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-[var(--accent)]"
          aria-hidden
        />
      </div>
      <div>
        <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--accent)]">
          {section.hint}
        </p>
        <h3 className="mt-1 font-display text-base font-extrabold tracking-tight text-[var(--text-primary)]">
          {section.title}
        </h3>
        <p className="mt-1.5 text-sm leading-relaxed text-[var(--text-secondary)]">
          {section.desc}
        </p>
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
      className="relative flex h-full flex-col gap-4 rounded-2xl border border-dashed border-[var(--rule-base)] bg-[var(--surface-canvas)] p-5"
    >
      <div className="flex items-start justify-between">
        <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] text-[var(--text-tertiary)]">
          <Icon className="h-5 w-5" strokeWidth={1.75} aria-hidden />
        </span>
        <span className="inline-flex items-center gap-1 rounded-full border border-[var(--rule-base)] bg-[var(--surface-raised)] px-2.5 py-0.5 text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--text-tertiary)]">
          <Clock className="h-3 w-3" aria-hidden />
          Próximamente
        </span>
      </div>
      <div>
        <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--text-tertiary)]">
          {section.hint}
        </p>
        <h3 className="mt-1 font-display text-base font-extrabold tracking-tight text-[var(--text-primary)]">
          {section.title}
        </h3>
        <p className="mt-1.5 text-sm leading-relaxed text-[var(--text-secondary)]">
          {section.desc}
        </p>
      </div>
    </div>
  );
}
