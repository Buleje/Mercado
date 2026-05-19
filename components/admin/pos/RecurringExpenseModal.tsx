"use client";

/**
 * Modal "Nuevo gasto recurrente" — versión completa.
 *
 * Reemplaza al modal inline de PuntoCompraView (3 campos) por uno con:
 *  - Categoría (con soporte para crear custom)
 *  - Descripción
 *  - Monto
 *  - Frecuencia (mensual/quincenal/semanal/anual/único)
 *  - Día de pago (1-31 o día de semana según frecuencia)
 *  - Método de pago
 *  - Proveedor opcional (texto libre)
 *  - Notas internas
 *  - Color e ícono visual (para distinguir cards en el catálogo)
 *
 * La metadata extra se serializa dentro de `description` (ver lib/expense-meta.ts)
 * para no requerir migración de schema.
 */

import { useState, useEffect, useMemo, useRef, type ReactNode } from "react";
import {
  X,
  Tag,
  DollarSign,
  Calendar,
  Building2,
  Palette,
  Plus,
  Check,
  Loader2,
  Wallet,
  CreditCard,
  Banknote,
  Repeat,
  Bell,
  StickyNote,
  Hash,
  Smartphone,
  Clock,
  Edit3,
  Trash2,
} from "@buleje/design-system/icons";
import { getCategoryIcon } from "@/lib/expense-icons";
import { cn } from "@/lib/utils";
import { csrfHeaders } from "@/lib/csrf-client";
import {
  type ExpenseCategoryDef,
  DEFAULT_EXPENSE_CATEGORIES,
  getCustomCategories,
  saveCustomCategory,
  removeCustomCategory,
  CATEGORY_COLOR_CLASSES,
  AVAILABLE_COLORS,
  AVAILABLE_ICON_KEYS,
} from "@/lib/expense-categories";
import {
  encodeExpenseDescription,
  type ExpenseMeta,
  type ExpenseFrequency,
  type ExpensePaymentMethod,
  FREQUENCY_LABELS,
  PAYMENT_METHOD_LABELS,
  DAYS_OF_WEEK,
} from "@/lib/expense-meta";

type Props = {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  tenantSlug: string; // para localStorage de categorías custom
  defaultCategory?: string;
};

const FREQUENCIES: ExpenseFrequency[] = ["mensual", "quincenal", "semanal", "anual", "unico"];
const PAYMENT_METHODS: ExpensePaymentMethod[] = ["efectivo", "yape", "plin", "transferencia", "tarjeta", "credito"];

export default function RecurringExpenseModal({ open, onClose, onCreated, tenantSlug, defaultCategory }: Props) {
  // ── State ─────────────────────────────────────────────────────────
  const [customCats, setCustomCats] = useState<ExpenseCategoryDef[]>([]);
  const allCats = useMemo(
    () => [...DEFAULT_EXPENSE_CATEGORIES, ...customCats],
    [customCats],
  );

  const [selectedCategoryName, setSelectedCategoryName] = useState<string>(defaultCategory ?? "Servicios");
  const selectedCategory = useMemo(
    () => allCats.find((c) => c.name === selectedCategoryName) ?? allCats[0],
    [allCats, selectedCategoryName],
  );

  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [frequency, setFrequency] = useState<ExpenseFrequency>("mensual");
  const [paymentDay, setPaymentDay] = useState<string>("1");
  const [paymentMethod, setPaymentMethod] = useState<ExpensePaymentMethod>("efectivo");
  const [supplierName, setSupplierName] = useState("");
  const [notes, setNotes] = useState("");
  const [reminderEnabled, setReminderEnabled] = useState(false);

  // Sub-form: crear nueva categoría
  const [showNewCategoryForm, setShowNewCategoryForm] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [newCatIcon, setNewCatIcon] = useState("package");
  const [newCatColor, setNewCatColor] = useState("teal");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const descriptionRef = useRef<HTMLInputElement>(null);

  // Cargar custom cats cuando se abre el modal
  useEffect(() => {
    if (open) {
      setCustomCats(getCustomCategories(tenantSlug));
      setError(null);
      // Auto-focus en descripción
      setTimeout(() => descriptionRef.current?.focus(), 80);
    }
  }, [open, tenantSlug]);

  // Reset al cerrar
  useEffect(() => {
    if (!open) {
      setDescription("");
      setAmount("");
      setSupplierName("");
      setNotes("");
      setFrequency("mensual");
      setPaymentDay("1");
      setPaymentMethod("efectivo");
      setReminderEnabled(false);
      setShowNewCategoryForm(false);
      setNewCatName("");
      setError(null);
    }
  }, [open]);

  // ── Submit ────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    setError(null);
    const desc = description.trim();
    const numAmount = Number(amount);
    if (!desc) {
      setError("Falta describir el gasto");
      return;
    }
    if (!numAmount || numAmount <= 0) {
      setError("Monto inválido");
      return;
    }

    setSubmitting(true);
    try {
      const meta: ExpenseMeta = {
        frequency,
        paymentDay: frequency === "unico" ? undefined : Number(paymentDay),
        paymentMethod,
        supplierName: supplierName.trim() || undefined,
        notes: notes.trim() || undefined,
        reminderEnabled: reminderEnabled || undefined,
        iconKey: selectedCategory.iconKey,
        colorKey: selectedCategory.color,
      };

      const res = await fetch("/api/expenses", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          category: selectedCategoryName,
          description: encodeExpenseDescription(desc, meta),
          amount: numAmount,
          recurring: true,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "No se pudo guardar el gasto");
        return;
      }

      onCreated();
      onClose();
    } catch {
      setError("Error de conexión");
    } finally {
      setSubmitting(false);
    }
  };

  // ── Crear nueva categoría ─────────────────────────────────────────
  const handleCreateCategory = () => {
    const name = newCatName.trim();
    if (!name) return;
    if (allCats.some((c) => c.name.toLowerCase() === name.toLowerCase())) {
      setError(`Ya existe una categoría "${name}"`);
      return;
    }
    const next = saveCustomCategory(tenantSlug, {
      name,
      iconKey: newCatIcon,
      color: newCatColor,
    });
    setCustomCats(next);
    setSelectedCategoryName(name);
    setShowNewCategoryForm(false);
    setNewCatName("");
    setNewCatIcon("package");
    setNewCatColor("teal");
  };

  const handleRemoveCategory = (name: string) => {
    if (!confirm(`¿Eliminar la categoría "${name}"? Los gastos existentes no se borran.`)) return;
    const next = removeCustomCategory(tenantSlug, name);
    setCustomCats(next);
    if (selectedCategoryName === name) setSelectedCategoryName("Otros");
  };

  if (!open) return null;

  const colorCls = CATEGORY_COLOR_CLASSES[selectedCategory.color] ?? CATEGORY_COLOR_CLASSES.gray;
  const SelectedIcon = getCategoryIcon(selectedCategory.iconKey);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="recurring-expense-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-3 sm:p-4 overflow-y-auto"
      onClick={(e) => { if (e.target === e.currentTarget && !submitting) onClose(); }}
      onKeyDown={(e) => { if (e.key === "Escape" && !submitting) onClose(); }}
    >
      <div className="bg-white dark:bg-[var(--color-card)] rounded-2xl shadow-2xl w-full max-w-3xl my-8 overflow-hidden border border-[var(--rule-base)]">
        {/* ── Header ── */}
        <header className={cn("px-5 sm:px-6 py-4 border-b border-[var(--rule-base)] flex items-center gap-3", colorCls.bg)}>
          <span className={cn("inline-flex items-center justify-center h-12 w-12 rounded-xl ring-1", colorCls.iconBg, colorCls.border)}>
            <SelectedIcon className={cn("h-6 w-6", colorCls.text)} strokeWidth={2} />
          </span>
          <div className="flex-1 min-w-0">
            <h2 id="recurring-expense-title" className="text-lg font-extrabold text-[var(--text-primary)]">
              Nuevo gasto recurrente
            </h2>
            <p className="text-sm text-[var(--text-secondary)] truncate">
              Configurá un pago fijo (alquiler, internet, etc.) para registrarlo en 1 click cuando llegue la fecha.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            aria-label="Cerrar"
            className="shrink-0 h-10 w-10 inline-flex items-center justify-center rounded-xl text-[var(--text-secondary)] hover:bg-white/60 dark:hover:bg-white/10 transition-colors disabled:opacity-50"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        {/* ── Body ── */}
        <div className="max-h-[70vh] overflow-y-auto px-5 sm:px-6 py-5 space-y-6">
          {/* Categoría ─────────────────────────────────────────────── */}
          <Section icon={<Tag className="h-4 w-4" />} title="Categoría">
            <div className="flex flex-wrap gap-2">
              {allCats.map((cat) => {
                const Icon = getCategoryIcon(cat.iconKey);
                const active = cat.name === selectedCategoryName;
                const cls = CATEGORY_COLOR_CLASSES[cat.color] ?? CATEGORY_COLOR_CLASSES.gray;
                return (
                  <button
                    key={cat.name}
                    type="button"
                    onClick={() => setSelectedCategoryName(cat.name)}
                    className={cn(
                      "group inline-flex items-center gap-2 h-11 px-3.5 rounded-2xl border-2 text-sm font-semibold transition-all",
                      active
                        ? cn(cls.bg, cls.text, cls.border, "ring-2", cls.ring)
                        : "border-[var(--rule-base)] bg-white dark:bg-[var(--surface-canvas)] text-[var(--text-secondary)] hover:border-[var(--text-secondary)]",
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    {cat.name}
                    {cat.isCustom && (
                      <span
                        role="button"
                        tabIndex={0}
                        onClick={(e) => { e.stopPropagation(); handleRemoveCategory(cat.name); }}
                        onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); handleRemoveCategory(cat.name); } }}
                        className="ml-0.5 opacity-50 hover:opacity-100 hover:text-[var(--data-error-500)] transition-opacity cursor-pointer"
                        aria-label={`Eliminar categoría ${cat.name}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </span>
                    )}
                  </button>
                );
              })}
              {/* Botón crear nueva */}
              {!showNewCategoryForm && (
                <button
                  type="button"
                  onClick={() => setShowNewCategoryForm(true)}
                  className="inline-flex items-center gap-2 h-11 px-3.5 rounded-2xl border-2 border-dashed border-[var(--text-tertiary)]/40 text-sm font-semibold text-[var(--text-secondary)] hover:border-primary hover:text-primary hover:bg-primary/5 transition-all"
                >
                  <Plus className="h-4 w-4" />
                  Nueva categoría
                </button>
              )}
            </div>

            {/* Sub-form: crear categoría custom */}
            {showNewCategoryForm && (
              <div className="mt-4 p-4 rounded-2xl bg-[var(--surface-sunken)] border-2 border-dashed border-[var(--rule-base)] space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-bold text-[var(--text-primary)]">Crear categoría personalizada</p>
                  <button
                    type="button"
                    onClick={() => setShowNewCategoryForm(false)}
                    className="text-xs font-semibold text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
                  >
                    Cancelar
                  </button>
                </div>
                <div>
                  <Label>Nombre</Label>
                  <input
                    type="text"
                    value={newCatName}
                    onChange={(e) => setNewCatName(e.target.value)}
                    placeholder="Ej. Cuotas máquina"
                    ref={(el) => el?.focus()}
                    className="mt-1 w-full h-12 px-3.5 rounded-2xl border-2 border-[var(--rule-base)] bg-white dark:bg-[var(--surface-canvas)] text-sm font-medium focus:outline-none focus:border-primary"
                  />
                </div>
                <div>
                  <Label className="inline-flex items-center gap-1"><Palette className="h-3 w-3" /> Color</Label>
                  <div className="mt-1 flex flex-wrap gap-2">
                    {AVAILABLE_COLORS.map((c) => {
                      const cls = CATEGORY_COLOR_CLASSES[c];
                      return (
                        <button
                          key={c}
                          type="button"
                          onClick={() => setNewCatColor(c)}
                          aria-label={`Color ${c}`}
                          aria-pressed={newCatColor === c}
                          className={cn(
                            "h-9 w-9 rounded-xl border-2 transition-all",
                            cls.iconBg,
                            newCatColor === c ? cn(cls.border, "ring-2 ring-offset-1", cls.ring, "scale-110") : "border-transparent hover:border-[var(--text-secondary)]",
                          )}
                        />
                      );
                    })}
                  </div>
                </div>
                <div>
                  <Label>Ícono</Label>
                  <div className="mt-1 grid grid-cols-7 sm:grid-cols-10 gap-1.5">
                    {AVAILABLE_ICON_KEYS.map((key) => {
                      const Icon = getCategoryIcon(key);
                      const active = newCatIcon === key;
                      const cls = CATEGORY_COLOR_CLASSES[newCatColor] ?? CATEGORY_COLOR_CLASSES.gray;
                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() => setNewCatIcon(key)}
                          aria-pressed={active}
                          className={cn(
                            "aspect-square inline-flex items-center justify-center rounded-xl border-2 transition-all",
                            active
                              ? cn(cls.iconBg, cls.text, cls.border)
                              : "border-[var(--rule-base)] bg-white dark:bg-[var(--surface-canvas)] text-[var(--text-secondary)] hover:border-[var(--text-secondary)]",
                          )}
                        >
                          <Icon className="h-4 w-4" />
                        </button>
                      );
                    })}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleCreateCategory}
                  disabled={!newCatName.trim()}
                  className="w-full h-11 inline-flex items-center justify-center gap-2 rounded-2xl bg-primary text-white text-sm font-bold hover:bg-primary-dark transition-colors disabled:opacity-50"
                >
                  <Check className="h-4 w-4" />
                  Guardar categoría
                </button>
              </div>
            )}
          </Section>

          {/* Datos básicos ─────────────────────────────────────────── */}
          <Section icon={<Edit3 className="h-4 w-4" />} title="Datos del gasto">
            <div>
              <Label>Descripción</Label>
              <input
                ref={descriptionRef}
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Ej. Alquiler local, Recarga celular Movistar, Servicio limpieza semanal"
                className="mt-1 w-full h-12 px-3.5 rounded-2xl border-2 border-[var(--rule-base)] bg-white dark:bg-[var(--surface-canvas)] text-sm font-medium focus:outline-none focus:border-primary"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="inline-flex items-center gap-1"><DollarSign className="h-3 w-3" /> Monto (S/)</Label>
                <div className="relative mt-1">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-base font-bold text-[var(--text-tertiary)] pointer-events-none">S/</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    step="0.10"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.00"
                    className="w-full h-12 pl-12 pr-3.5 rounded-2xl border-2 border-[var(--rule-base)] bg-white dark:bg-[var(--surface-canvas)] text-base font-bold tabular-nums focus:outline-none focus:border-primary"
                  />
                </div>
              </div>
              <div>
                <Label className="inline-flex items-center gap-1"><Building2 className="h-3 w-3" /> Proveedor / quién recibe (opcional)</Label>
                <input
                  type="text"
                  value={supplierName}
                  onChange={(e) => setSupplierName(e.target.value)}
                  placeholder="Ej. Edelnor, Don Juan (casero), Movistar"
                  className="mt-1 w-full h-12 px-3.5 rounded-2xl border-2 border-[var(--rule-base)] bg-white dark:bg-[var(--surface-canvas)] text-sm font-medium focus:outline-none focus:border-primary"
                />
              </div>
            </div>
          </Section>

          {/* Frecuencia + Día ──────────────────────────────────────── */}
          <Section icon={<Repeat className="h-4 w-4" />} title="Frecuencia">
            <div>
              <Label>Cada cuánto se paga</Label>
              <div className="mt-1 grid grid-cols-2 sm:grid-cols-5 gap-2">
                {FREQUENCIES.map((freq) => {
                  const active = frequency === freq;
                  return (
                    <button
                      key={freq}
                      type="button"
                      onClick={() => setFrequency(freq)}
                      className={cn(
                        "h-11 px-2 rounded-2xl border-2 text-sm font-semibold transition-all",
                        active
                          ? "border-primary bg-primary/10 text-primary ring-2 ring-primary/30"
                          : "border-[var(--rule-base)] bg-white dark:bg-[var(--surface-canvas)] text-[var(--text-secondary)] hover:border-[var(--text-secondary)]",
                      )}
                    >
                      {FREQUENCY_LABELS[freq]}
                    </button>
                  );
                })}
              </div>
            </div>

            {frequency !== "unico" && (
              <div>
                <Label className="inline-flex items-center gap-1"><Calendar className="h-3 w-3" /> Día de pago</Label>
                {frequency === "semanal" ? (
                  <select
                    value={paymentDay}
                    onChange={(e) => setPaymentDay(e.target.value)}
                    className="mt-1 w-full h-12 px-3.5 rounded-2xl border-2 border-[var(--rule-base)] bg-white dark:bg-[var(--surface-canvas)] text-sm font-medium focus:outline-none focus:border-primary"
                  >
                    {DAYS_OF_WEEK.map((d, i) => (
                      <option key={i} value={i}>{d}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="number"
                    min="1"
                    max={frequency === "anual" ? 366 : 31}
                    value={paymentDay}
                    onChange={(e) => setPaymentDay(e.target.value)}
                    placeholder="Día del mes (1-31)"
                    className="mt-1 w-full h-12 px-3.5 rounded-2xl border-2 border-[var(--rule-base)] bg-white dark:bg-[var(--surface-canvas)] text-base font-bold tabular-nums focus:outline-none focus:border-primary"
                  />
                )}
                <p className="mt-1.5 text-xs text-[var(--text-tertiary)]">
                  {frequency === "mensual" && "Te avisaremos el día que toca pagar cada mes."}
                  {frequency === "quincenal" && "Se repite cada 15 días desde la fecha indicada."}
                  {frequency === "semanal" && "Se repite cada semana ese día."}
                  {frequency === "anual" && "Se repite una vez al año."}
                </p>
              </div>
            )}
          </Section>

          {/* Método de pago ───────────────────────────────────────── */}
          <Section icon={<Wallet className="h-4 w-4" />} title="Forma de pago">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {PAYMENT_METHODS.map((m) => {
                const active = paymentMethod === m;
                const Icon = m === "yape" || m === "plin" ? Smartphone
                  : m === "transferencia" ? Banknote
                  : m === "tarjeta" ? CreditCard
                  : m === "credito" ? Clock
                  : Wallet;
                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setPaymentMethod(m)}
                    className={cn(
                      "inline-flex items-center justify-center gap-2 h-11 px-3 rounded-2xl border-2 text-sm font-semibold transition-all",
                      active
                        ? "border-primary bg-primary/10 text-primary ring-2 ring-primary/30"
                        : "border-[var(--rule-base)] bg-white dark:bg-[var(--surface-canvas)] text-[var(--text-secondary)] hover:border-[var(--text-secondary)]",
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    {PAYMENT_METHOD_LABELS[m]}
                  </button>
                );
              })}
            </div>
          </Section>

          {/* Recordatorio + Notas ────────────────────────────────── */}
          <Section icon={<StickyNote className="h-4 w-4" />} title="Notas y recordatorio">
            <label className="flex items-center gap-3 p-3 rounded-2xl border-2 border-[var(--rule-base)] cursor-pointer hover:border-[var(--text-secondary)]">
              <input
                type="checkbox"
                checked={reminderEnabled}
                onChange={(e) => setReminderEnabled(e.target.checked)}
                className="h-5 w-5 rounded accent-primary cursor-pointer"
              />
              <Bell className="h-4 w-4 text-[var(--text-secondary)]" />
              <div className="flex-1">
                <p className="text-sm font-semibold text-[var(--text-primary)]">Recordatorio antes del vencimiento</p>
                <p className="text-xs text-[var(--text-secondary)]">Te avisaremos en notificaciones el día antes que toque pagar.</p>
              </div>
            </label>
            <div>
              <Label className="inline-flex items-center gap-1"><Hash className="h-3 w-3" /> Notas internas (opcional)</Label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Ej. El casero prefiere efectivo, dejar recibo firmado en caja chica..."
                rows={2}
                className="mt-1 w-full px-3.5 py-2.5 rounded-2xl border-2 border-[var(--rule-base)] bg-white dark:bg-[var(--surface-canvas)] text-sm font-medium focus:outline-none focus:border-primary resize-none"
              />
            </div>
          </Section>

          {error && (
            <div className="rounded-2xl border-2 border-[var(--data-error-500)]/50 bg-[var(--data-error-50)] dark:bg-[var(--data-error-500)]/10 px-4 py-3 text-sm font-semibold text-[var(--data-error-500)]">
              {error}
            </div>
          )}
        </div>

        {/* ── Footer sticky ── */}
        <footer className="px-5 sm:px-6 py-4 border-t border-[var(--rule-base)] bg-[var(--surface-sunken)] flex flex-col-reverse sm:flex-row sm:items-center gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="flex-1 h-12 rounded-2xl text-sm font-bold text-[var(--text-secondary)] bg-white dark:bg-[var(--color-card)] border-2 border-[var(--rule-base)] hover:border-[var(--text-secondary)] transition-colors disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="flex-1 sm:flex-[2] h-12 inline-flex items-center justify-center gap-2 rounded-2xl text-sm font-bold text-white bg-primary hover:bg-primary-dark transition-colors disabled:opacity-50"
          >
            {submitting ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Check className="h-5 w-5" />
            )}
            Guardar gasto recurrente
          </button>
        </footer>
      </div>
    </div>
  );
}

// ─── Helpers UI ───────────────────────────────────────────────────────

function Section({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h3 className="inline-flex items-center gap-2 text-sm font-extrabold uppercase tracking-wider text-[var(--text-secondary)]">
        <span className="text-[var(--text-tertiary)]">{icon}</span>
        {title}
      </h3>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function Label({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <label className={cn("block text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)]", className)}>
      {children}
    </label>
  );
}
