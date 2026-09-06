"use client";
import { CardTitle, SectionTitle } from "@buleje/design-system";
import { Field } from "@/components/admin/shared/Field";
import { AlertCircle, CheckCircle, DollarSign, ExternalLink, Eye, Globe, Clock, EyeOff, MapPin, Save, Star, Store, Zap } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { useMarketplaceTienda } from "@/components/admin/marketplace/hooks/use-marketplace-tienda";
import { Spinner } from "@/components/admin/marketplace/shared";
import ImageUpload from "@/components/admin/ImageUpload";
import CategoryZonePicker from "@/components/admin/unified/marketplace/CategoryZonePicker";

// ─────────────────────────────────────────────
// Sub-tab: Mi Tienda Personal
// ─────────────────────────────────────────────
export function MarketplaceTiendaTab() {
  const { store, setStore, loading, saving, error, saved, handleSave } = useMarketplaceTienda();

  if (loading) return <Spinner />;

  // Iniciales para el avatar fallback (cuando no hay logo)
  const initials = (store.name || store.slug || "BS")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("") || "BS";

  const statusBadge = !store.isActive
    ? { label: "Borrador", className: "bg-[var(--surface-sunken)] text-[var(--text-secondary)] border-2 border-[var(--rule-base)]" }
    : store.vacationMode
    ? { label: "Vacaciones", className: "bg-[var(--data-warning-50)] text-[var(--data-warning)] border-2 border-[var(--data-warning)]/40" }
    : { label: "Publicada", className: "bg-[var(--data-success-50)] text-[var(--data-success)] border-2 border-[var(--data-success)]/40" };

  return (
    <div className="space-y-6 pb-24">
      {error && (
        <div className="flex items-center gap-3 p-4 bg-[var(--data-error-50)] border-2 border-[var(--data-error)] rounded-2xl text-base font-medium text-[var(--data-error)]">
          <AlertCircle className="h-5 w-5 shrink-0" />
          {error}
        </div>
      )}

      {/* ── HERO BANNER ───────────────────────────────── */}
      <header className="relative overflow-hidden rounded-3xl border-2 border-[var(--rule-base)] bg-linear-to-br from-primary/8 via-[var(--surface-canvas)] to-[var(--accent-soft)]/30 px-6 py-7 sm:px-8 sm:py-8">
        <div className="absolute -top-24 -right-24 h-72 w-72 rounded-full bg-primary/15 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-20 -left-10 h-56 w-56 rounded-full bg-[var(--accent)]/10 blur-3xl pointer-events-none" />
        <div className="relative flex flex-col md:flex-row items-start md:items-center gap-6">
          {/* Logo grande */}
          <div className="relative shrink-0">
            <div className="h-24 w-24 sm:h-28 sm:w-28 rounded-3xl overflow-hidden border-4 border-[var(--surface-canvas)] shadow-xl bg-[var(--surface-raised)] flex items-center justify-center">
              {store.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={store.logoUrl} alt={store.name || store.slug} className="h-full w-full object-cover" />
              ) : (
                <span className="text-3xl font-extrabold text-primary">{initials}</span>
              )}
            </div>
          </div>

          {/* Identidad */}
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-3 mb-2">
              <span className={cn("inline-flex items-center h-7 px-3 rounded-full text-xs font-extrabold uppercase tracking-wider", statusBadge.className)}>
                {statusBadge.label}
              </span>
              {store.slug && (
                <span className="inline-flex items-center gap-1.5 text-sm font-bold text-[var(--text-tertiary)]">
                  <Globe className="h-3.5 w-3.5" />
                  <span className="font-mono">/marketplace/{store.slug}</span>
                </span>
              )}
            </div>
            <SectionTitle className="text-2xl sm:text-3xl font-extrabold text-[var(--text-primary)] tracking-tight truncate">
              {store.name || "Tu tienda en el marketplace"}
            </SectionTitle>
            <p className="mt-2 text-base text-[var(--text-secondary)] line-clamp-2 max-w-2xl leading-relaxed">
              {store.description || "Sin descripción todavía. Cuéntale a los clientes qué te hace especial."}
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full bg-[var(--surface-canvas)] border border-[var(--rule-base)] text-sm font-bold text-[var(--text-primary)]">
                <Store className="h-4 w-4 text-primary" />
                {store.category || "Sin categoría"}
              </span>
              <span className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full bg-[var(--surface-canvas)] border border-[var(--rule-base)] text-sm font-bold text-[var(--text-primary)]">
                <MapPin className="h-4 w-4 text-[var(--accent)]" />
                {(store.coverageZones?.length ?? 0) > 0
                  ? `${store.coverageZones!.length} zona${store.coverageZones!.length === 1 ? "" : "s"}`
                  : store.zone || "Sin zonas"}
              </span>
              <span className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full bg-[var(--surface-canvas)] border border-[var(--rule-base)] text-sm font-bold text-[var(--text-primary)]">
                <DollarSign className="h-4 w-4 text-[var(--data-success)]" />
                {store.commissionRate}% comisión
              </span>
            </div>
          </div>

          {/* CTAs */}
          {store.slug && (
            <a
              href={`/marketplace/${store.slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 inline-flex items-center gap-2 h-12 px-5 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] text-base font-extrabold text-[var(--text-primary)] hover:border-primary hover:text-primary hover:shadow-md transition-all"
            >
              <Eye className="h-5 w-5" />
              Ver pública
              <ExternalLink className="h-4 w-4 opacity-60" />
            </a>
          )}
        </div>
      </header>

      {/* ── LAYOUT 2-COLUMNAS ─────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* ── COLUMNA PRINCIPAL ────────────────────────── */}
        <div className="lg:col-span-8 space-y-6">
          {/* Identidad */}
          <section className="bg-[var(--surface-raised)] border-2 border-[var(--rule-base)] rounded-2xl overflow-hidden">
            <header className="flex items-start gap-3 px-6 pt-5 pb-4 border-b-2 border-[var(--rule-base)]">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)] shrink-0">
                <Store className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <CardTitle className="text-base font-bold text-[var(--text-primary)]">Identidad</CardTitle>
                <p className="text-sm text-[var(--text-secondary)] mt-1 leading-relaxed">
                  Cómo te encuentran los clientes en el marketplace.
                </p>
              </div>
            </header>
            <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div className="space-y-2 sm:col-span-1">
                <Field
                  label={<span className="flex items-center gap-1.5"><Globe className="h-4 w-4" /> URL pública</span>}
                  labelClassName="text-sm font-bold uppercase tracking-wider text-[var(--text-secondary)]"
                >
                  {(id) => (
                    <div className="flex items-stretch h-12 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] focus-within:ring-2 focus-within:ring-primary/30 focus-within:border-primary transition-all overflow-hidden">
                      <span className="inline-flex items-center px-4 text-sm font-extrabold text-[var(--text-tertiary)] bg-[var(--surface-sunken)] border-r-2 border-[var(--rule-base)] whitespace-nowrap">/marketplace/</span>
                      <input
                        id={id}
                        type="text"
                        value={store.slug}
                        onChange={(e) => setStore((p) => ({ ...p, slug: e.target.value.toLowerCase().replace(/\s+/g, "-") }))}
                        placeholder="mi-bodega"
                        className="flex-1 min-w-0 px-4 bg-transparent text-base font-semibold text-[var(--text-primary)] outline-none"
                      />
                    </div>
                  )}
                </Field>
                <p className="text-sm text-[var(--text-tertiary)] leading-relaxed">
                  Solo minúsculas y guiones. Evita cambiarla — los links viejos dejan de funcionar.
                </p>
              </div>
              <div className="space-y-2 sm:col-span-1">
                <Field
                  label={<>Nombre visible <span className="text-[var(--data-error)]">*</span></>}
                  labelClassName="text-sm font-bold uppercase tracking-wider text-[var(--text-secondary)]"
                >
                  <input
                    type="text"
                    value={store.name}
                    onChange={(e) => setStore((p) => ({ ...p, name: e.target.value }))}
                    placeholder="Bodega San Martín"
                    maxLength={60}
                    className="w-full h-12 px-4 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] text-base font-semibold text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
                  />
                </Field>
                <p className="text-sm text-[var(--text-tertiary)]">
                  <span className="font-bold tabular-nums">{store.name.length}</span>/60 caracteres
                </p>
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Field
                  label={
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-bold uppercase tracking-wider text-[var(--text-secondary)]">Descripción</span>
                      <span className="text-sm text-[var(--text-tertiary)] tabular-nums">
                        <span className="font-bold">{(store.description ?? "").length}</span>/240
                      </span>
                    </div>
                  }
                  labelClassName=""
                >
                  <textarea
                    rows={3}
                    maxLength={240}
                    value={store.description}
                    onChange={(e) => setStore((p) => ({ ...p, description: e.target.value }))}
                    placeholder="Describe tu tienda: horarios, especialidades, qué te hace única…"
                    className="w-full px-4 py-3 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] text-base font-medium text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary resize-none transition-all leading-relaxed"
                  />
                </Field>
              </div>
            </div>
          </section>

          {/* Categoría + subcategoría + zonas de cobertura */}
          <CategoryZonePicker
            value={{
              category: store.category ?? "",
              subcategory: store.subcategory ?? null,
              coverageZones: store.coverageZones ?? [],
              customCategories: store.customCategories ?? [],
            }}
            onChange={(next) =>
              setStore((p) => ({
                ...p,
                category: next.category,
                subcategory: next.subcategory,
                coverageZones: next.coverageZones,
                customCategories: next.customCategories,
                // Mantiene `zone` legacy en sync con el 1er coverageZone marcado.
                zone: next.coverageZones[0] ?? p.zone,
              }))
            }
          />

          {/* Comisión */}
          <section className="bg-[var(--surface-raised)] border-2 border-[var(--rule-base)] rounded-2xl overflow-hidden">
            <header className="flex items-start gap-3 px-6 pt-5 pb-4 border-b-2 border-[var(--rule-base)]">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--data-success)]/10 text-[var(--data-success)] shrink-0">
                <DollarSign className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <CardTitle className="text-base font-bold text-[var(--text-primary)]">Comisión Buleje</CardTitle>
                <p className="text-sm text-[var(--text-secondary)] mt-1 leading-relaxed">
                  Lo que Buleje cobra por cada venta. La fija la plataforma — para revisarla, contáctanos por WhatsApp.
                </p>
              </div>
            </header>
            <div className="p-6">
              <div className="flex items-center justify-between gap-4 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-sunken)] px-6 py-5">
                <span className="text-4xl font-extrabold tabular-nums text-[var(--text-primary)]">
                  {store.commissionRate}%
                </span>
                <span className="text-xs font-extrabold uppercase tracking-wider text-[var(--text-tertiary)]">
                  Solo lectura
                </span>
              </div>
            </div>
          </section>

          {/* Marca visual: logo + URL backup */}
          <section className="bg-[var(--surface-raised)] border-2 border-[var(--rule-base)] rounded-2xl overflow-hidden">
            <header className="flex items-start gap-3 px-6 pt-5 pb-4 border-b-2 border-[var(--rule-base)]">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--accent)]/10 text-[var(--accent)] shrink-0">
                <Star className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <CardTitle className="text-base font-bold text-[var(--text-primary)]">Imagen de la tienda</CardTitle>
                <p className="text-sm text-[var(--text-secondary)] mt-1 leading-relaxed">
                  Logo cuadrado 200×200 — aparece en la tarjeta de tu tienda en /tiendas y en cada pedido.
                </p>
              </div>
            </header>
            <div className="p-6 grid grid-cols-1 sm:grid-cols-[220px_1fr] gap-6 items-start">
              <ImageUpload
                value={store.logoUrl}
                onChange={(url) => setStore((p) => ({ ...p, logoUrl: url }))}
                onClear={() => setStore((p) => ({ ...p, logoUrl: "" }))}
                folder="marketplace-logos"
                label=""
                hint=""
                aspectRatio="square"
              />
              <div className="space-y-3">
                <Field label="…o pega una URL de imagen" labelClassName="text-sm font-bold uppercase tracking-wider text-[var(--text-secondary)]">
                  <input
                    type="url"
                    value={store.logoUrl}
                    onChange={(e) => setStore((p) => ({ ...p, logoUrl: e.target.value }))}
                    placeholder="https://…"
                    className="w-full h-12 px-4 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] text-base font-medium text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
                  />
                </Field>
                {store.logoUrl ? (
                  <div className="flex items-center gap-2 text-sm font-bold text-[var(--data-success)]">
                    <CheckCircle className="h-4 w-4" /> Logo configurado
                  </div>
                ) : (
                  <div className="flex items-start gap-2 text-sm text-[var(--text-secondary)] leading-relaxed">
                    <AlertCircle className="h-4 w-4 mt-0.5 shrink-0 text-[var(--text-tertiary)]" />
                    Sin logo, usaremos las iniciales de tu tienda como avatar.
                  </div>
                )}
              </div>
            </div>
          </section>
        </div>

        {/* ── ASIDE (sticky) ────────────────────────────── */}
        <aside className="lg:col-span-4 space-y-6 lg:sticky lg:top-4 self-start">
          {/* Vista previa */}
          <section className="bg-[var(--surface-raised)] border-2 border-[var(--rule-base)] rounded-2xl overflow-hidden">
            <header className="flex items-start gap-3 px-6 pt-5 pb-4 border-b-2 border-[var(--rule-base)]">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)] shrink-0">
                <Eye className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <CardTitle className="text-base font-bold text-[var(--text-primary)]">Vista previa</CardTitle>
                <p className="text-sm text-[var(--text-secondary)] mt-1 leading-relaxed">
                  Cómo te ven los clientes en el listado.
                </p>
              </div>
            </header>
            <div className="p-5">
              <div className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] overflow-hidden">
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
          <section className="bg-[var(--surface-raised)] border-2 border-[var(--rule-base)] rounded-2xl overflow-hidden">
            <header className="flex items-start gap-3 px-6 pt-5 pb-4 border-b-2 border-[var(--rule-base)]">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--data-warning)]/10 text-[var(--data-warning)] shrink-0">
                <Zap className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <CardTitle className="text-base font-bold text-[var(--text-primary)]">Estado</CardTitle>
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
      </div>

      {/* ── STICKY SAVE BAR ─────────────────────────────── */}
      <div className="sticky bottom-4 z-20 flex items-center justify-between gap-4 px-5 py-4 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)]/95 backdrop-blur shadow-xl">
        <p className="text-sm text-[var(--text-tertiary)] hidden sm:block font-medium">
          Los cambios se aplican al instante en tu tienda pública.
        </p>
        <div className="flex items-center gap-3 ml-auto">
          {saved && (
            <span className="inline-flex items-center gap-2 text-base font-bold text-[var(--data-success)]">
              <CheckCircle className="h-5 w-5" /> Guardado
            </span>
          )}
          <button
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-2 h-12 px-6 rounded-2xl bg-primary text-white text-base font-extrabold hover:bg-primary-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-primary/20"
          >
            {saving ? (
              <div className="h-5 w-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <Save className="h-5 w-5" />
            )}
            {saving ? "Guardando..." : "Guardar cambios"}
          </button>
        </div>
      </div>
    </div>
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
            "inline-block h-5 w-5 transform rounded-full bg-white shadow-md transition-transform",
            active ? "translate-x-6" : "translate-x-1",
          )}
        />
      </span>
    </button>
  );
}

