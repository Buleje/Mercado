"use client";

import { Tag, Plus, Check, Palette, Trash2 } from "@buleje/design-system/icons";
import { getCategoryIcon } from "@/lib/expense-icons";
import { cn } from "@/lib/utils";
import { CATEGORY_COLOR_CLASSES, AVAILABLE_COLORS, AVAILABLE_ICON_KEYS } from "@/lib/expense-categories";
import { Label, Section } from "./piezas";
import type { GastoRecurrente } from "./use-gasto-recurrente";

/** Categoría del gasto fijo, con las categorías propias del negocio. */
export default function CategoriaRecurrente({ r }: { r: GastoRecurrente }) {
  const { allCats, selectedCategoryName, setSelectedCategoryName, handleRemoveCategory, showNewCategoryForm, setShowNewCategoryForm, newCatName, setNewCatName, newCatColor, setNewCatColor, newCatIcon, setNewCatIcon, handleCreateCategory } = r;
  return (
    <>
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
                  : "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:border-[var(--text-secondary)]",
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
            className="inline-flex items-center gap-2 h-11 px-3.5 rounded-2xl border-2 border-dashed border-[var(--text-tertiary)]/40 text-sm font-semibold text-[var(--text-secondary)] hover:border-primary hover:text-[var(--accent-ink)] dark:text-[var(--accent)] hover:bg-primary/5 transition-all"
          >
            <Plus className="h-4 w-4" />
            Nueva categoría
          </button>
        )}
      </div>

      {/* Sub-form: crear categoría custom */}
      {showNewCategoryForm && (
        <div className="mt-4 p-4 rounded-2xl bg-[var(--surface-sunken)] border border-dashed border-[var(--rule-base)] space-y-3">
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
              aria-label="Nombre de la categoría"
              className="mt-1 w-full h-12 px-3.5 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] text-sm font-medium focus:outline-none focus:border-primary"
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
                    aria-label={`Ícono ${key}`}
                    aria-pressed={active}
                    className={cn(
                      "aspect-square inline-flex items-center justify-center rounded-xl border-2 transition-all",
                      active
                        ? cn(cls.iconBg, cls.text, cls.border)
                        : "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:border-[var(--text-secondary)]",
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
            className="w-full h-11 inline-flex items-center justify-center gap-2 rounded-2xl bg-primary text-white text-sm font-semibold hover:bg-primary-dark transition-colors disabled:opacity-50"
          >
            <Check className="h-4 w-4" />
            Guardar categoría
          </button>
        </div>
      )}
    </Section>
    </>
  );
}
