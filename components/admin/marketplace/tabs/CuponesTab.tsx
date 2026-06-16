"use client";
import { CardTitle } from "@buleje/design-system";
import { Field } from "@/components/admin/shared/Field";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { useMarketplaceCoupons } from "@/components/admin/marketplace/hooks/use-marketplace-coupons";
import { TableSkeleton } from "@/components/admin/marketplace/shared";
import { CheckCircle, Clock, DollarSign, Eye, EyeOff, Star, Ticket, X } from "@buleje/design-system/icons";

export function MarketplaceCuponesTab() {
  const {
    coupons, loading, showForm, setShowForm,
    saving, form, setForm,
    handleCreate, toggleActive, deleteCoupon,
  } = useMarketplaceCoupons();
  // PERF (audit React Compiler 2026-05-12): `now` capturado con useState lazy.
  // Refresh cada hora para que "expira en <7d" se mantenga actualizado en
  // sesiones largas del admin.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60 * 60 * 1000);
    return () => clearInterval(id);
  }, []);

  if (loading) return <TableSkeleton />;

  // Stats agregadas
  const activeCount = coupons.filter((c) => c.active).length;
  const totalUses = coupons.reduce((s, c) => s + (c.usedCount || 0), 0);
  const expiringSoon = coupons.filter((c) => {
    if (!c.expiresAt) return false;
    const days = (new Date(c.expiresAt).getTime() - now) / (1000 * 60 * 60 * 24);
    return days > 0 && days < 7;
  }).length;

  return (
    <div className="space-y-6">
      {/* ── Header con stats + CTA ── */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-5">
          <div>
            <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Cupones marketplace</p>
            <p className="text-2xl font-extrabold text-[var(--text-primary)] tabular-nums leading-tight">{coupons.length}</p>
          </div>
          <div className="h-10 w-px bg-[var(--rule-base)]" />
          <div className="flex items-center gap-5">
            <div>
              <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Activos</p>
              <p className="text-base font-bold text-[var(--data-success)] tabular-nums">{activeCount}</p>
            </div>
            <div>
              <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Usos</p>
              <p className="text-base font-bold text-[var(--text-primary)] tabular-nums">{totalUses}</p>
            </div>
            {expiringSoon > 0 && (
              <div>
                <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--data-warning)]">Vencen pronto</p>
                <p className="text-base font-bold text-[var(--data-warning)] tabular-nums">{expiringSoon}</p>
              </div>
            )}
          </div>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-white text-sm font-bold hover:bg-primary-dark transition-colors shadow-sm"
        >
          <Ticket className="h-4 w-4" />
          Nuevo cupón
        </button>
      </div>

      {/* ── Modal "Nuevo cupón" ── */}
      {showForm && (
        <NewCouponModal
          form={form}
          setForm={setForm}
          saving={saving}
          onClose={() => setShowForm(false)}
          onCreate={handleCreate}
        />
      )}

      {coupons.length === 0 ? (
        <div className="text-center py-20 px-6 rounded-2xl border-2 border-dashed border-[var(--rule-base)] bg-white">
          <div className="inline-flex items-center justify-center h-14 w-14 rounded-2xl bg-primary/10 text-primary mb-4">
            <Ticket className="h-6 w-6" />
          </div>
          <p className="text-base font-extrabold text-[var(--text-primary)]">Sin cupones todavía</p>
          <p className="text-sm text-[var(--text-secondary)] mt-1.5 max-w-sm mx-auto">
            Crea un cupón para atraer clientes al marketplace y aumentar tu conversión.
          </p>
          <button
            onClick={() => setShowForm(true)}
            className="mt-5 inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-white text-sm font-bold hover:bg-primary-dark transition-colors"
          >
            <Ticket className="h-4 w-4" />
            Crear primer cupón
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {coupons.map((c) => {
            const expired = c.expiresAt ? new Date(c.expiresAt).getTime() < now : false;
            const usagePct = c.maxUses ? Math.min(100, (c.usedCount / c.maxUses) * 100) : 0;
            return (
              <div
                key={c.id}
                className={cn(
                  "group relative overflow-hidden rounded-2xl border-2 p-4 transition-all",
                  c.active && !expired
                    ? "bg-white border-[var(--rule-base)] hover:border-primary/40 hover:shadow-md"
                    : "bg-[var(--surface-sunken)] border-[var(--rule-base)] opacity-75"
                )}
              >
                {/* Banda lateral con tipo */}
                <div className={cn(
                  "absolute left-0 top-0 bottom-0 w-1.5",
                  c.active && !expired ? "bg-primary" : "bg-[var(--rule-base)]"
                )} />

                <div className="pl-2 flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    {/* Código + estado */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono font-extrabold text-base text-[var(--text-primary)] tracking-tight truncate">
                        {c.code}
                      </span>
                      <span className={cn(
                        "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider",
                        expired
                          ? "bg-[var(--data-error-50)] text-[var(--data-error)]"
                          : c.active
                          ? "bg-[var(--data-success-50)] text-[var(--data-success)]"
                          : "bg-[var(--rule-soft)] text-[var(--text-secondary)]"
                      )}>
                        {expired ? "Vencido" : c.active ? "Activo" : "Pausado"}
                      </span>
                    </div>

                    {/* Descuento principal grande */}
                    <p className="mt-2 text-2xl font-extrabold text-primary tabular-nums leading-none">
                      {c.discountType === "percent" ? `${c.discountValue}%` : `S/${c.discountValue.toFixed(2)}`}
                      <span className="text-xs font-semibold text-[var(--text-tertiary)] ml-1.5">de descuento</span>
                    </p>

                    {/* Descripción */}
                    {c.description && (
                      <p className="mt-1.5 text-xs text-[var(--text-secondary)] line-clamp-1">{c.description}</p>
                    )}

                    {/* Meta info */}
                    <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
                      {c.minPurchase ? (
                        <span className="inline-flex items-center gap-1">
                          <DollarSign className="h-3 w-3" /> Mín S/{c.minPurchase.toFixed(2)}
                        </span>
                      ) : null}
                      {c.expiresAt ? (
                        <span className="inline-flex items-center gap-1">
                          <Clock className="h-3 w-3" /> {new Date(c.expiresAt).toLocaleDateString("es-PE", { day: "2-digit", month: "short" })}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1">
                          <Clock className="h-3 w-3" /> Sin vencimiento
                        </span>
                      )}
                    </div>

                    {/* Barra de uso si hay maxUses */}
                    {c.maxUses ? (
                      <div className="mt-2.5">
                        <div className="flex items-center justify-between text-[length:var(--ts-2xs)] mb-1">
                          <span className="font-bold text-[var(--text-tertiary)]">Usos</span>
                          <span className="tabular-nums font-bold text-[var(--text-secondary)]">{c.usedCount} / {c.maxUses}</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-[var(--rule-soft)] overflow-hidden">
                          <div
                            className={cn("h-full rounded-full transition-all", usagePct >= 80 ? "bg-[var(--data-warning)]" : "bg-primary")}
                            style={{ width: `${usagePct}%` }}
                          />
                        </div>
                      </div>
                    ) : (
                      <p className="mt-2 text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] tabular-nums">{c.usedCount} usos · ilimitado</p>
                    )}
                  </div>

                  {/* Acciones */}
                  <div className="flex flex-col gap-1 shrink-0 opacity-60 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => navigator.clipboard?.writeText(c.code).catch(() => { /* clipboard best-effort */ })}
                      title="Copiar código"
                      className="p-2 rounded-lg hover:bg-primary/10 hover:text-primary transition-colors text-[var(--text-tertiary)]"
                    >
                      <Star className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => toggleActive(c.id, c.active)}
                      title={c.active ? "Desactivar" : "Activar"}
                      className="p-2 rounded-lg hover:bg-[var(--surface-sunken)] transition-colors text-[var(--text-tertiary)]"
                    >
                      {c.active ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4 text-[var(--data-success)]" />}
                    </button>
                    <button
                      onClick={() => deleteCoupon(c.id)}
                      title="Eliminar"
                      className="p-2 rounded-lg hover:bg-[var(--data-error-50)] hover:text-[var(--data-error)] transition-colors text-[var(--text-tertiary)]"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// Modal "Nuevo cupón" — diseño dedicado con preview
// ─────────────────────────────────────────────
function NewCouponModal({
  form,
  setForm,
  saving,
  onClose,
  onCreate,
}: {
  form: ReturnType<typeof useMarketplaceCoupons>["form"];
  setForm: ReturnType<typeof useMarketplaceCoupons>["setForm"];
  saving: boolean;
  onClose: () => void;
  onCreate: () => void;
}) {
  const isPercent = form.discountType === "percent";
  const previewValue = form.discountValue
    ? isPercent
      ? `${form.discountValue}%`
      : `S/${parseFloat(form.discountValue).toFixed(2)}`
    : isPercent
    ? "10%"
    : "S/10";

  // Cerrar con Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-white rounded-3xl shadow-[var(--shadow-xl)] border border-[var(--rule-base)]"
        role="dialog"
        aria-modal="true"
        aria-label="Crear nuevo cupón"
      >
        {/* Header con preview del cupón */}
        <div className="relative overflow-hidden rounded-t-3xl bg-linear-to-br from-primary/15 via-primary/5 to-transparent p-6 border-b border-[var(--rule-base)]">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 h-8 w-8 inline-flex items-center justify-center rounded-full bg-white border border-[var(--rule-base)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:border-[var(--text-tertiary)] transition-colors"
            aria-label="Cerrar"
          >
            <X className="h-4 w-4" />
          </button>

          <div className="flex items-center gap-2 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-primary mb-1">
            <Ticket className="h-3.5 w-3.5" />
            Nuevo cupón marketplace
          </div>
          <CardTitle className="text-xl font-extrabold text-[var(--text-primary)] tracking-tight">Configurá tu descuento</CardTitle>
          <p className="text-sm text-[var(--text-secondary)] mt-1">Aparecerá en el carrito de los clientes que entren al marketplace.</p>

          {/* Preview ticket */}
          <div className="mt-5 relative">
            <div className="relative inline-flex items-stretch rounded-xl bg-white border-2 border-dashed border-primary/40 overflow-hidden shadow-sm">
              <div className="flex items-center justify-center px-4 py-3 bg-primary text-white">
                <Ticket className="h-5 w-5" />
              </div>
              <div className="px-4 py-3 min-w-[180px]">
                <p className="font-mono text-xs font-bold text-[var(--text-tertiary)] tracking-wider truncate max-w-[200px]">
                  {form.code || "MICUPON10"}
                </p>
                <p className="text-2xl font-extrabold text-primary tabular-nums leading-none mt-0.5">{previewValue}</p>
                <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] mt-1">
                  {form.minPurchase ? `Mín S/${form.minPurchase}` : "Sin compra mínima"}
                  {form.expiresAt ? ` · Vence ${new Date(form.expiresAt).toLocaleDateString("es-PE", { day: "2-digit", month: "short" })}` : ""}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Form body */}
        <div className="p-6 space-y-6">
          {/* Sección 1: Identificación */}
          <section className="space-y-4">
            <header className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary text-xs font-extrabold">1</span>
              <h4 className="text-sm font-extrabold text-[var(--text-primary)]">Identificación</h4>
            </header>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Field label="Código del cupón" labelClassName="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--text-secondary)]">
                  <input
                    type="text"
                    placeholder="BIENVENIDO10"
                    value={form.code}
                    onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase().replace(/\s+/g, "") })}
                    className="w-full px-4 py-3 rounded-xl border-2 border-[var(--rule-base)] bg-white text-sm font-mono font-bold text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all uppercase tracking-wider"
                    maxLength={20}
                  />
                </Field>
                <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">Mayúsculas, sin espacios. Ej: BIENVENIDO10</p>
              </div>

              <div className="space-y-1.5">
                <Field label="Descripción interna" labelClassName="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--text-secondary)]">
                  <input
                    type="text"
                    placeholder="Descuento de bienvenida"
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl border-2 border-[var(--rule-base)] bg-white text-sm text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
                  />
                </Field>
              </div>
            </div>
          </section>

          {/* Sección 2: Tipo y valor */}
          <section className="space-y-4">
            <header className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary text-xs font-extrabold">2</span>
              <h4 className="text-sm font-extrabold text-[var(--text-primary)]">Tipo de descuento</h4>
            </header>

            {/* Toggle tipo: percent vs fixed */}
            <div className="grid grid-cols-2 gap-3">
              {[
                { value: "percent", label: "Porcentaje", hint: "Descuenta un % del total", icon: "%" },
                { value: "fixed",   label: "Monto fijo", hint: "Resta soles directos",    icon: "S/" },
              ].map((opt) => {
                const active = form.discountType === opt.value;
                return (
                  <button
                    key={opt.value}
                    onClick={() => setForm({ ...form, discountType: opt.value as "percent" | "fixed" })}
                    className={cn(
                      "flex items-center gap-3 px-4 py-3 rounded-xl border-2 text-left transition-all",
                      active
                        ? "border-primary bg-primary/5"
                        : "border-[var(--rule-base)] bg-white hover:border-[var(--text-tertiary)]"
                    )}
                  >
                    <span className={cn(
                      "flex h-10 w-10 items-center justify-center rounded-lg font-extrabold text-base",
                      active ? "bg-primary text-white" : "bg-[var(--surface-sunken)] text-[var(--text-secondary)]"
                    )}>
                      {opt.icon}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className={cn("text-sm font-bold", active ? "text-primary" : "text-[var(--text-primary)]")}>{opt.label}</p>
                      <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">{opt.hint}</p>
                    </div>
                    {active && <CheckCircle className="h-4 w-4 text-primary shrink-0" />}
                  </button>
                );
              })}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Field
                  label={`Valor ${isPercent ? "(%)" : "(S/)"}`}
                  labelClassName="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--text-secondary)]"
                >
                  {(id) => (
                    <div className="flex items-stretch rounded-xl border-2 border-[var(--rule-base)] bg-white focus-within:ring-2 focus-within:ring-primary/30 focus-within:border-primary transition-all overflow-hidden">
                      <input
                        id={id}
                        type="number"
                        placeholder={isPercent ? "10" : "5.00"}
                        value={form.discountValue}
                        onChange={(e) => setForm({ ...form, discountValue: e.target.value })}
                        min={0}
                        max={isPercent ? 100 : undefined}
                        step={isPercent ? 1 : 0.5}
                        className="flex-1 min-w-0 px-4 py-3 bg-transparent text-base font-extrabold text-[var(--text-primary)] outline-none tabular-nums"
                      />
                      <span className="inline-flex items-center px-4 text-sm font-bold text-[var(--text-tertiary)] bg-[var(--surface-sunken)] border-l-2 border-[var(--rule-base)]">
                        {isPercent ? "%" : "S/"}
                      </span>
                    </div>
                  )}
                </Field>
              </div>

              <div className="space-y-1.5">
                <Field label="Compra mínima (S/)" labelClassName="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--text-secondary)]">
                  <input
                    type="number"
                    placeholder="Sin mínimo"
                    value={form.minPurchase}
                    onChange={(e) => setForm({ ...form, minPurchase: e.target.value })}
                    min={0}
                    step={0.5}
                    className="w-full px-4 py-3 rounded-xl border-2 border-[var(--rule-base)] bg-white text-sm font-semibold text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all tabular-nums"
                  />
                </Field>
              </div>
            </div>
          </section>

          {/* Sección 3: Límites */}
          <section className="space-y-4">
            <header className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary text-xs font-extrabold">3</span>
              <h4 className="text-sm font-extrabold text-[var(--text-primary)]">Límites</h4>
            </header>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Field label="Usos máximos" labelClassName="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--text-secondary)]">
                  <input
                    type="number"
                    placeholder="Ilimitado"
                    value={form.maxUses}
                    onChange={(e) => setForm({ ...form, maxUses: e.target.value })}
                    min={1}
                    className="w-full px-4 py-3 rounded-xl border-2 border-[var(--rule-base)] bg-white text-sm font-semibold text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all tabular-nums"
                  />
                </Field>
                <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">Vacío = sin tope de canjes</p>
              </div>

              <div className="space-y-1.5">
                <Field label="Vence el" labelClassName="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--text-secondary)]">
                  <input
                    type="datetime-local"
                    value={form.expiresAt ? form.expiresAt.slice(0, 16) : ""}
                    onChange={(e) => setForm({ ...form, expiresAt: e.target.value ? new Date(e.target.value).toISOString() : "" })}
                    className="w-full px-4 py-3 rounded-xl border-2 border-[var(--rule-base)] bg-white text-sm font-semibold text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
                  />
                </Field>
                <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">Vacío = sin vencimiento</p>
              </div>
            </div>
          </section>
        </div>

        {/* Footer sticky */}
        <div className="sticky bottom-0 flex items-center justify-between gap-3 px-6 py-4 border-t border-[var(--rule-base)] bg-white/95 backdrop-blur rounded-b-3xl">
          <p className="text-xs text-[var(--text-tertiary)] hidden sm:block">
            Podés activar/desactivar el cupón después.
          </p>
          <div className="flex items-center gap-3 ml-auto">
            <button
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl text-sm font-bold text-[var(--text-secondary)] border-2 border-[var(--rule-base)] hover:bg-[var(--surface-sunken)] transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={onCreate}
              disabled={saving || !form.code || !form.discountValue}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-white text-sm font-bold hover:bg-primary-dark transition-colors disabled:opacity-50 shadow-sm"
            >
              {saving ? (
                <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <Ticket className="h-4 w-4" />
              )}
              {saving ? "Creando…" : "Crear cupón"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Sub-tab: Reseñas
// ─────────────────────────────────────────────
