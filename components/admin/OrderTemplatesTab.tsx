"use client";

import { useState, useEffect, useCallback, useId } from "react";
import {
  Plus, Trash2, Pencil, ClipboardList, Check, X,
  ChevronDown, ChevronUp, Package, AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface TemplateItem {
  name: string;
  qty: number;
  price: number;
}

interface OrderTemplate {
  id: string;
  name: string;
  items: TemplateItem[];
  createdAt: string;
}

interface Props {
  onApplyTemplate?: (items: TemplateItem[]) => void;
  className?: string;
}

// ── Constantes ────────────────────────────────────────────────────────────────

const STORAGE_KEY = "buleje_order_templates";
const MAX_TEMPLATES = 20;
const MAX_ITEMS_PER_TEMPLATE = 30;

// ── Helpers ───────────────────────────────────────────────────────────────────

function loadTemplates(): OrderTemplate[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveTemplates(templates: OrderTemplate[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(templates));
  } catch {
    // silencioso — localStorage lleno u otro error
  }
}

function generateId(): string {
  return `tpl_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function fmt(n: number) {
  return `S/${n.toFixed(2)}`;
}

function totalItems(items: TemplateItem[]): number {
  return items.reduce((acc, i) => acc + i.qty, 0);
}

function totalPrice(items: TemplateItem[]): number {
  return items.reduce((acc, i) => acc + i.qty * i.price, 0);
}

// ── Subcomponente: fila de item editable ──────────────────────────────────────

interface ItemRowProps {
  item: TemplateItem;
  index: number;
  onChange: (index: number, field: keyof TemplateItem, value: string) => void;
  onRemove: (index: number) => void;
  canRemove: boolean;
}

function ItemRow({ item, index, onChange, onRemove, canRemove }: ItemRowProps) {
  const nameId  = useId();
  const qtyId   = useId();
  const priceId = useId();

  return (
    <div className="grid grid-cols-[1fr_80px_90px_32px] gap-2 items-center">
      <div>
        <label htmlFor={nameId} className="sr-only">Nombre del producto</label>
        <input
          id={nameId}
          type="text"
          placeholder="Nombre del producto"
          value={item.name}
          onChange={(e) => onChange(index, "name", e.target.value)}
          maxLength={120}
          className={cn(
            "w-full px-2.5 py-1.5 rounded-lg text-sm border bg-white dark:bg-card",
            "border-[var(--rule-base)] dark:border-card-border text-gray-900 dark:text-foreground",
            "placeholder:text-gray-400 dark:placeholder:text-muted",
            "focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors"
          )}
        />
      </div>
      <div>
        <label htmlFor={qtyId} className="sr-only">Cantidad</label>
        <input
          id={qtyId}
          type="number"
          placeholder="Cant."
          min={1}
          step={1}
          value={item.qty === 0 ? "" : item.qty}
          onChange={(e) => onChange(index, "qty", e.target.value)}
          className={cn(
            "w-full px-2.5 py-1.5 rounded-lg text-sm border bg-white dark:bg-card",
            "border-[var(--rule-base)] dark:border-card-border text-gray-900 dark:text-foreground",
            "placeholder:text-gray-400 dark:placeholder:text-muted",
            "focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors"
          )}
        />
      </div>
      <div>
        <label htmlFor={priceId} className="sr-only">Precio</label>
        <input
          id={priceId}
          type="number"
          placeholder="Precio"
          min={0}
          step={0.01}
          value={item.price === 0 ? "" : item.price}
          onChange={(e) => onChange(index, "price", e.target.value)}
          className={cn(
            "w-full px-2.5 py-1.5 rounded-lg text-sm border bg-white dark:bg-card",
            "border-[var(--rule-base)] dark:border-card-border text-gray-900 dark:text-foreground",
            "placeholder:text-gray-400 dark:placeholder:text-muted",
            "focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors"
          )}
        />
      </div>
      <button
        type="button"
        onClick={() => onRemove(index)}
        disabled={!canRemove}
        className={cn(
          "flex items-center justify-center w-8 h-8 rounded-lg transition-colors",
          canRemove
            ? "text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-600"
            : "text-gray-200 dark:text-card-border cursor-not-allowed"
        )}
        title="Quitar fila"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

// ── Subcomponente: formulario de creacion/edicion ──────────────────────────────

interface TemplateFormProps {
  initial?: OrderTemplate;
  onSave: (name: string, items: TemplateItem[]) => void;
  onCancel: () => void;
}

const EMPTY_ITEM: TemplateItem = { name: "", qty: 1, price: 0 };

function TemplateForm({ initial, onSave, onCancel }: TemplateFormProps) {
  const [name, setName]   = useState(initial?.name ?? "");
  const [items, setItems] = useState<TemplateItem[]>(
    initial?.items.length ? initial.items.map(i => ({ ...i })) : [{ ...EMPTY_ITEM }]
  );
  const [error, setError] = useState("");
  const nameId = useId();

  const handleItemChange = useCallback((index: number, field: keyof TemplateItem, value: string) => {
    setItems(prev => {
      const next = [...prev];
      if (field === "name") {
        next[index] = { ...next[index], name: value };
      } else if (field === "qty") {
        const parsed = parseInt(value, 10);
        next[index] = { ...next[index], qty: isNaN(parsed) || parsed < 1 ? 1 : parsed };
      } else if (field === "price") {
        const parsed = parseFloat(value);
        next[index] = { ...next[index], price: isNaN(parsed) || parsed < 0 ? 0 : parsed };
      }
      return next;
    });
  }, []);

  const addItem = useCallback(() => {
    if (items.length >= MAX_ITEMS_PER_TEMPLATE) return;
    setItems(prev => [...prev, { ...EMPTY_ITEM }]);
  }, [items.length]);

  const removeItem = useCallback((index: number) => {
    setItems(prev => prev.filter((_, i) => i !== index));
  }, []);

  const handleSave = () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("El nombre de la plantilla es obligatorio.");
      return;
    }
    const validItems = items.filter(i => i.name.trim());
    if (validItems.length === 0) {
      setError("Agrega al menos un producto con nombre.");
      return;
    }
    setError("");
    onSave(trimmedName, validItems.map(i => ({ ...i, name: i.name.trim() })));
  };

  return (
    <div className="space-y-6">
      {/* Nombre de la plantilla */}
      <div>
        <label htmlFor={nameId} className="block text-xs font-semibold text-gray-600 dark:text-muted mb-1.5">
          Nombre de la plantilla
        </label>
        <input
          id={nameId}
          type="text"
          placeholder="Ej: Pedido diario de Carmen"
          value={name}
          onChange={(e) => { setName(e.target.value); setError(""); }}
          maxLength={80}
          autoFocus
          className={cn(
            "w-full px-3 py-2 rounded-lg text-sm border bg-white dark:bg-card",
            "border-[var(--rule-base)] dark:border-card-border text-gray-900 dark:text-foreground",
            "placeholder:text-gray-400 dark:placeholder:text-muted",
            "focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors"
          )}
        />
      </div>

      {/* Cabecera de tabla */}
      <div>
        <div className="grid grid-cols-[1fr_80px_90px_32px] gap-2 mb-1.5">
          <span className="text-[length:var(--ts-2xs)] font-bold text-gray-400 dark:text-muted px-0.5">Producto</span>
          <span className="text-[length:var(--ts-2xs)] font-bold text-gray-400 dark:text-muted px-0.5">Cant.</span>
          <span className="text-[length:var(--ts-2xs)] font-bold text-gray-400 dark:text-muted px-0.5">Precio</span>
          <span />
        </div>

        {/* Filas de items */}
        <div className="space-y-2">
          {items.map((item, idx) => (
            <ItemRow
              key={idx}
              item={item}
              index={idx}
              onChange={handleItemChange}
              onRemove={removeItem}
              canRemove={items.length > 1}
            />
          ))}
        </div>

        {/* Agregar fila */}
        {items.length < MAX_ITEMS_PER_TEMPLATE && (
          <button
            type="button"
            onClick={addItem}
            className="mt-2 flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 font-semibold transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            Agregar producto
          </button>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Botones */}
      <div className="flex items-center justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 rounded-lg text-sm font-semibold text-gray-600 dark:text-muted hover:bg-gray-100 dark:hover:bg-surface transition-colors"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={handleSave}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold bg-primary text-white hover:bg-primary/90 transition-colors "
        >
          <Check className="h-4 w-4" />
          {initial ? "Guardar cambios" : "Crear plantilla"}
        </button>
      </div>
    </div>
  );
}

// ── Subcomponente: card de plantilla ──────────────────────────────────────────

interface TemplateCardProps {
  template: OrderTemplate;
  onApply: (template: OrderTemplate) => void;
  onEdit: (template: OrderTemplate) => void;
  onDelete: (id: string) => void;
}

function TemplateCard({ template, onApply, onEdit, onDelete }: TemplateCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const units = totalItems(template.items);
  const total = totalPrice(template.items);

  return (
    <div className={cn(
      "rounded-xl border bg-white dark:bg-card overflow-hidden transition-shadow",
      "border-[var(--rule-base)] dark:border-card-border  hover:shadow-sm"
    )}>
      {/* Cabecera */}
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="w-9 h-9 rounded-lg bg-primary/10 dark:bg-primary/20 flex items-center justify-center shrink-0">
          <ClipboardList className="h-4.5 w-4.5 text-primary" style={{ width: 18, height: 18 }} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-gray-900 dark:text-foreground truncate">{template.name}</p>
          <p className="text-[length:var(--ts-xs)] text-gray-400 dark:text-muted">
            {template.items.length} {template.items.length === 1 ? "producto" : "productos"}
            {" · "}
            {units} {units === 1 ? "unidad" : "unidades"}
            {" · "}
            <span className="font-semibold text-gray-600 dark:text-foreground">{fmt(total)}</span>
          </p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => onApply(template)}
            className="px-3 py-1.5 rounded-lg text-xs font-bold bg-primary text-white hover:bg-primary/90 transition-colors "
            title="Usar esta plantilla"
          >
            Usar
          </button>
          <button
            onClick={() => { setExpanded(e => !e); setConfirmDelete(false); }}
            className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-surface transition-colors text-gray-400"
            title={expanded ? "Cerrar detalle" : "Ver detalle"}
          >
            {expanded
              ? <ChevronUp className="h-4 w-4" />
              : <ChevronDown className="h-4 w-4" />
            }
          </button>
        </div>
      </div>

      {/* Detalle expandible */}
      {expanded && (
        <div className="border-t border-[var(--rule-soft)] dark:border-card-border">
          {/* Lista de items */}
          <div className="px-4 py-3 space-y-1.5 bg-gray-50/50 dark:bg-surface/30">
            {template.items.map((item, idx) => (
              <div key={idx} className="flex items-center gap-2 text-sm">
                <Package className="h-3.5 w-3.5 text-gray-300 shrink-0" />
                <span className="flex-1 text-gray-700 dark:text-foreground truncate">{item.name}</span>
                <span className="text-gray-400 dark:text-muted tabular-nums text-xs">x{item.qty}</span>
                <span className="font-mono text-xs text-gray-600 dark:text-foreground">{fmt(item.price)}</span>
                <span className="font-semibold text-xs text-primary tabular-nums">{fmt(item.qty * item.price)}</span>
              </div>
            ))}
          </div>

          {/* Acciones */}
          <div className="flex items-center justify-between px-4 py-2.5 border-t border-[var(--rule-soft)] dark:border-card-border">
            <p className="text-[length:var(--ts-2xs)] text-gray-400 dark:text-muted">
              Creada {new Date(template.createdAt).toLocaleDateString("es-PE", {
                day: "2-digit", month: "short", year: "numeric",
              })}
            </p>
            <div className="flex items-center gap-1">
              <button
                onClick={() => { onEdit(template); setExpanded(false); }}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold text-gray-600 dark:text-foreground hover:bg-gray-100 dark:hover:bg-surface transition-colors"
              >
                <Pencil className="h-3.5 w-3.5" />
                Editar
              </button>
              {confirmDelete ? (
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => onDelete(template.id)}
                    className="px-2.5 py-1 rounded-lg text-xs font-bold text-white bg-red-500 hover:bg-red-600 transition-colors"
                  >
                    Confirmar
                  </button>
                  <button
                    onClick={() => setConfirmDelete(false)}
                    className="px-2.5 py-1 rounded-lg text-xs font-semibold text-gray-600 dark:text-muted hover:bg-gray-100 dark:hover:bg-surface transition-colors"
                  >
                    No
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmDelete(true)}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Eliminar
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────

type FormMode = { type: "create" } | { type: "edit"; template: OrderTemplate } | null;

export default function OrderTemplatesTab({ onApplyTemplate, className }: Props) {
  const [templates, setTemplates]   = useState<OrderTemplate[]>([]);
  const [formMode, setFormMode]     = useState<FormMode>(null);
  const [appliedId, setAppliedId]   = useState<string | null>(null);

  // Cargar desde localStorage al montar
  useEffect(() => {
    setTemplates(loadTemplates());
  }, []);

  // Persistir cambios
  const persist = useCallback((updated: OrderTemplate[]) => {
    setTemplates(updated);
    saveTemplates(updated);
  }, []);

  // Crear / guardar
  const handleSave = useCallback((name: string, items: TemplateItem[]) => {
    if (formMode?.type === "edit") {
      const updated = templates.map(t =>
        t.id === formMode.template.id ? { ...t, name, items } : t
      );
      persist(updated);
    } else {
      if (templates.length >= MAX_TEMPLATES) return;
      const newTpl: OrderTemplate = {
        id: generateId(),
        name,
        items,
        createdAt: new Date().toISOString(),
      };
      persist([newTpl, ...templates]);
    }
    setFormMode(null);
  }, [formMode, templates, persist]);

  // Eliminar
  const handleDelete = useCallback((id: string) => {
    persist(templates.filter(t => t.id !== id));
  }, [templates, persist]);

  // Aplicar
  const handleApply = useCallback((template: OrderTemplate) => {
    setAppliedId(template.id);
    onApplyTemplate?.(template.items.map(i => ({ ...i })));
    setTimeout(() => setAppliedId(null), 2000);
  }, [onApplyTemplate]);

  const isCreating = formMode?.type === "create";
  const editingTemplate = formMode?.type === "edit" ? formMode.template : undefined;

  return (
    <div className={cn("space-y-4", className)}>
      {/* ── Encabezado ── */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-gray-900 dark:text-foreground">Plantillas de pedidos</h2>
          <p className="text-xs text-gray-400 dark:text-muted mt-0.5">
            Guarda combos de productos frecuentes y cargalos con un clic.
          </p>
        </div>
        {!formMode && templates.length < MAX_TEMPLATES && (
          <button
            onClick={() => setFormMode({ type: "create" })}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold bg-primary text-white hover:bg-primary/90 transition-colors  shrink-0"
          >
            <Plus className="h-4 w-4" />
            Nueva
          </button>
        )}
      </div>

      {/* ── Formulario (crear / editar) ── */}
      {formMode && (
        <div className="rounded-xl border border-primary/30 bg-primary/5 dark:bg-primary/10 p-4 space-y-1">
          <p className="text-xs font-bold text-primary mb-3">
            {isCreating ? "Nueva plantilla" : `Editando: ${editingTemplate?.name}`}
          </p>
          <TemplateForm
            initial={editingTemplate}
            onSave={handleSave}
            onCancel={() => setFormMode(null)}
          />
        </div>
      )}

      {/* ── Lista de plantillas ── */}
      {templates.length === 0 && !formMode && (
        <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
          <div className="w-14 h-14 rounded-xl bg-gray-100 dark:bg-surface flex items-center justify-center">
            <ClipboardList className="h-7 w-7 text-gray-300 dark:text-muted" />
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-500 dark:text-muted">Sin plantillas todavia</p>
            <p className="text-xs text-gray-400 dark:text-muted mt-1 max-w-xs">
              Crea una plantilla con los productos que pide siempre el mismo cliente y cargala con un clic.
            </p>
          </div>
          <button
            onClick={() => setFormMode({ type: "create" })}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold bg-primary text-white hover:bg-primary/90 transition-colors "
          >
            <Plus className="h-4 w-4" />
            Crear primera plantilla
          </button>
        </div>
      )}

      {templates.length > 0 && (
        <div className="space-y-3">
          {/* Feedback de "aplicada" */}
          {appliedId && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 text-sm font-semibold">
              <Check className="h-4 w-4 shrink-0" />
              Plantilla cargada en el pedido
            </div>
          )}

          {templates.map(tpl => (
            <TemplateCard
              key={tpl.id}
              template={tpl}
              onApply={handleApply}
              onEdit={(t) => setFormMode({ type: "edit", template: t })}
              onDelete={handleDelete}
            />
          ))}

          {templates.length >= MAX_TEMPLATES && (
            <p className="text-xs text-center text-gray-400 dark:text-muted py-2">
              Limite de {MAX_TEMPLATES} plantillas alcanzado. Elimina alguna para crear una nueva.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
