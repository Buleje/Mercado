"use client";
import { CardTitle } from "@buleje/design-system";
import { Field } from "@/components/admin/shared/Field";
import { CheckCircle, Clock, DollarSign, Eye, EyeOff, MapPin, Store, Zap } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import type { MarketplaceStoreData } from "@/components/admin/marketplace/hooks/use-marketplace-tienda";
import { inicialesTienda, type SetStore } from "./shared";

/** Columna lateral: vista previa de la tarjeta y estado (publicada / vacaciones). */
export function TiendaAside({ store, setStore }: { store: MarketplaceStoreData; setStore: SetStore }) {
  const initials = inicialesTienda(store);
  return (
  <aside className="lg:col-span-4 space-y-6 lg:sticky lg:top-4 self-start">
    {/* Vista previa */}
    <section className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-2xl overflow-hidden">
      <header className="flex items-start gap-3 px-6 pt-5 pb-4 border-b-2 border-[var(--rule-base)]">
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)] shrink-0">
          <Eye className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <CardTitle className="text-sm font-bold text-[var(--text-primary)]">Vista previa</CardTitle>
          <p className="text-sm text-[var(--text-secondary)] mt-1 leading-relaxed">
            Cómo te ven los clientes en el listado.
          </p>
        </div>
      </header>
      <div className="p-5">
        <div className="rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] overflow-hidden">
          <div className="relative h-24 bg-linear-to-br from-primary/15 via-[var(--surface-raised)] to-[var(--accent-soft)]/40">
            {(store.coverageZones?.length ?? 0) > 0 && (
              <span className="absolute top-3 left-3 inline-flex items-center gap-1 h-7 px-3 rounded-full bg-[var(--surface-canvas)]/95 backdrop-blur text-xs font-extrabold text-[var(--text-primary)] shadow-sm">
                <MapPin className="h-3.5 w-3.5 text-[var(--accent)]" />
                {store.coverageZones![0]}
              </span>
            )}
          </div>
          <div className="px-5 pb-5 -mt-9">
            <div className="h-16 w-16 rounded-2xl border-4 border-[var(--surface-canvas)] bg-[var(--surface-raised)] shadow-md overflow-hidden flex items-center justify-center">
              {store.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={store.logoUrl} alt={store.name} className="h-full w-full object-cover" />
              ) : (
                <span className="text-xl font-extrabold text-primary">{initials}</span>
              )}
            </div>
            <h4 className="mt-3 text-base font-extrabold text-[var(--text-primary)] truncate">
              {store.name || "Tu tienda"}
            </h4>
            <p className="mt-1 text-sm text-[var(--text-secondary)] line-clamp-2 min-h-[2.6em] leading-relaxed">
              {store.description || "Agrega una descripción atractiva para que los clientes te conozcan."}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              {store.category && (
                <span className="inline-flex items-center gap-1 h-6 px-2.5 rounded-full bg-[var(--surface-sunken)] text-xs font-extrabold text-[var(--text-primary)]">
                  <Store className="h-3 w-3" /> {store.category}
                </span>
              )}
              <span className="inline-flex items-center gap-1 h-6 px-2.5 rounded-full bg-[var(--surface-sunken)] text-xs font-extrabold text-[var(--text-primary)]">
                <DollarSign className="h-3 w-3" /> {store.commissionRate}%
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>

    {/* Estado de la tienda */}
    <section className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-2xl overflow-hidden">
      <header className="flex items-start gap-3 px-6 pt-5 pb-4 border-b-2 border-[var(--rule-base)]">
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--data-warning)]/10 text-[var(--data-warning)] shrink-0">
          <Zap className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <CardTitle className="text-sm font-bold text-[var(--text-primary)]">Estado</CardTitle>
          <p className="text-sm text-[var(--text-secondary)] mt-1 leading-relaxed">
            Controla la visibilidad de tu tienda.
          </p>
        </div>
      </header>
      <div className="p-4">
        <ToggleRow
          active={store.isActive}
          onToggle={() => setStore((p) => ({ ...p, isActive: !p.isActive }))}
          title="Publicada en marketplace"
          desc={store.isActive ? "Visible y aceptando pedidos." : "Borrador — solo tú la ves."}
          tone="primary"
          icon={store.isActive ? CheckCircle : EyeOff}
        />
        <div className="border-t-2 border-[var(--rule-base)] my-1" />
        <ToggleRow
          active={!!store.vacationMode}
          onToggle={() => setStore((p) => ({ ...p, vacationMode: !p.vacationMode }))}
          title="Modo vacaciones"
          desc="Pausa pedidos sin despublicar."
          tone="warning"
          icon={Clock}
        />
        {store.vacationMode && (
          <div className="mt-3 px-2 space-y-2">
            <Field label="Mensaje a clientes" labelClassName="text-sm font-bold uppercase tracking-wider text-[var(--text-secondary)]">
              <input
                type="text"
                value={store.vacationMessage ?? ""}
                onChange={(e) => setStore((p) => ({ ...p, vacationMessage: e.target.value }))}
                placeholder="Ej: Volvemos el lunes 15"
                maxLength={140}
                className="w-full h-12 px-4 rounded-2xl border-2 border-[var(--data-warning)]/50 bg-[var(--data-warning-50)] text-base font-medium text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-[var(--data-warning)]/30 transition-all"
              />
            </Field>
          </div>
        )}
      </div>
    </section>
  </aside>
  );
}

// ─────────────────────────────────────────────
// ToggleRow — fila de toggle reutilizable para el aside "Estado"
// ─────────────────────────────────────────────
function ToggleRow({
  active,
  onToggle,
  title,
  desc,
  tone = "primary",
  icon: Icon,
}: {
  active: boolean;
  onToggle: () => void;
  title: string;
  desc: string;
  tone?: "primary" | "warning";
  icon?: React.ElementType;
}) {
  const onColor = tone === "warning" ? "bg-[var(--data-warning)]" : "bg-primary";
  const iconBg = active
    ? tone === "warning"
      ? "bg-[var(--data-warning)]/15 text-[var(--data-warning)]"
      : "bg-primary/15 text-[var(--accent-ink)] dark:text-[var(--accent)]"
    : "bg-[var(--surface-sunken)] text-[var(--text-tertiary)]";
  return (
    <button
      type="button"
      onClick={onToggle}
      className="w-full flex items-center justify-between gap-3 px-2 py-3 rounded-xl hover:bg-[var(--surface-sunken)] transition-colors text-left"
      aria-pressed={active}
    >
      <div className="flex items-start gap-3 min-w-0">
        {Icon && (
          <span className={cn("flex h-9 w-9 items-center justify-center rounded-xl shrink-0 transition-colors", iconBg)}>
            <Icon className="h-4 w-4" />
          </span>
        )}
        <div className="min-w-0">
          <p className="text-base font-extrabold text-[var(--text-primary)]">{title}</p>
          <p className="text-sm text-[var(--text-secondary)] mt-0.5 leading-relaxed">{desc}</p>
        </div>
      </div>
      <span
        className={cn(
          "relative inline-flex h-7 w-12 items-center rounded-full transition-colors shrink-0",
          active ? onColor : "bg-[var(--rule-strong)]",
        )}
      >
        <span
          className={cn(
            "inline-block h-5 w-5 transform rounded-full bg-[var(--surface-raised)] shadow-md transition-transform",
            active ? "translate-x-6" : "translate-x-1",
          )}
        />
      </span>
    </button>
  );
}
