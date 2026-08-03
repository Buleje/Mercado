"use client";

import { useEffect, useMemo, useState } from "react";
import { FileText, Plus, Trash2, X, Check } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

/**
 * TemplatesPanel — Tanda 3 · Plantillas con variables (Brandon 2026-06-11).
 *
 * Respuestas guardadas que el vendedor inserta con un toque. Soportan variables
 * que se rellenan con el contexto del hilo:
 *   {nombre}  → primer nombre del cliente
 *   {tienda}  → nombre de la tienda
 *
 * Persistencia: las plantillas DEFAULT vienen hardcodeadas (útiles desde el día
 * cero); las CUSTOM viven en localStorage por tenant (sin migración). Compartir
 * entre cajeros = follow-up con una tabla chica.
 */

export interface ChatTemplate {
  id: string;
  label: string;
  text: string;
}

const DEFAULT_TEMPLATES: ChatTemplate[] = [
  { id: "d-saludo", label: "Saludo", text: "¡Hola {nombre}! 😊 Gracias por escribir, ¿en qué te ayudo?" },
  { id: "d-stock", label: "Confirmar stock", text: "Sí {nombre}, tenemos stock disponible. ¿Cuántos necesitas?" },
  { id: "d-entrega", label: "Tiempo de entrega", text: "Tu pedido llega en unos 30-40 min a tu dirección 🛵" },
  { id: "d-pago", label: "Formas de pago", text: "Puedes pagar con Yape, Plin o efectivo al recibir. ¿Cuál te queda mejor?" },
  { id: "d-cierre", label: "Cerrar venta", text: "¡Listo {nombre}! Tu pedido ya está en camino. Gracias por tu compra 🙏" },
  { id: "d-cerrado", label: "Fuera de horario", text: "Gracias por escribir 🙏 Ahorita estamos cerrados, te respondo apenas abramos." },
];

function storageKey(tenantSlug: string | null): string {
  return `chat-templates-${tenantSlug ?? "default"}`;
}

function loadCustom(tenantSlug: string | null): ChatTemplate[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(storageKey(tenantSlug));
    if (!raw) return [];
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((t): t is ChatTemplate =>
        !!t && typeof (t as ChatTemplate).id === "string" &&
        typeof (t as ChatTemplate).label === "string" &&
        typeof (t as ChatTemplate).text === "string")
      .slice(0, 30);
  } catch {
    return [];
  }
}

/** Rellena {nombre} y {tienda} con el contexto del hilo. */
export function fillTemplate(text: string, customerName: string | undefined, storeName: string | undefined): string {
  const firstName = (customerName ?? "").trim().split(/\s+/)[0] || "";
  return text
    .replace(/\{nombre\}/gi, firstName)
    .replace(/\{tienda\}/gi, (storeName ?? "").trim())
    // Limpia dobles espacios que deja una variable vacía.
    .replace(/\s{2,}/g, " ")
    .trim();
}

interface TemplatesPanelProps {
  tenantSlug: string | null;
  customerName?: string;
  storeName?: string;
  onPick: (text: string) => void;
  onClose: () => void;
}

export function TemplatesPanel({ tenantSlug, customerName, storeName, onPick, onClose }: TemplatesPanelProps) {
  const [custom, setCustom] = useState<ChatTemplate[]>([]);
  const [adding, setAdding] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newText, setNewText] = useState("");

  useEffect(() => {
    setCustom(loadCustom(tenantSlug));
  }, [tenantSlug]);

  const all = useMemo(() => [...DEFAULT_TEMPLATES, ...custom], [custom]);

  function persist(next: ChatTemplate[]) {
    setCustom(next);
    try {
      window.localStorage.setItem(storageKey(tenantSlug), JSON.stringify(next));
    } catch {
      /* cuota llena / modo privado — la sesión igual funciona */
    }
  }

  function addTemplate() {
    const label = newLabel.trim();
    const text = newText.trim();
    if (!label || !text) return;
    persist([...custom, { id: `c-${label}-${custom.length}`, label: label.slice(0, 40), text: text.slice(0, 600) }]);
    setNewLabel("");
    setNewText("");
    setAdding(false);
  }

  function removeTemplate(id: string) {
    persist(custom.filter((t) => t.id !== id));
  }

  const isCustom = (id: string) => id.startsWith("c-");

  return (
    <div className="mb-2 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-2">
      <div className="mb-1.5 flex items-center justify-between px-1">
        <span className="inline-flex items-center gap-1.5 text-[length:var(--ts-xs)] font-bold text-[var(--text-secondary)]">
          <FileText className="h-4 w-4 text-primary" aria-hidden /> Plantillas
        </span>
        <button type="button" onClick={onClose} aria-label="Cerrar plantillas" className="rounded-full p-1 text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)] dark:hover:bg-[var(--surface-sunken)]">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="max-h-56 space-y-1 overflow-y-auto">
        {all.map((t) => (
          <div key={t.id} className="group flex items-center gap-1">
            <button
              type="button"
              onClick={() => onPick(fillTemplate(t.text, customerName, storeName))}
              className="min-w-0 flex-1 rounded-lg px-2.5 py-1.5 text-left hover:bg-[var(--surface-sunken)] dark:hover:bg-[var(--surface-sunken)]"
            >
              <span className="block text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-primary">{t.label}</span>
              <span className="block truncate text-[length:var(--ts-xs)] text-[var(--text-secondary)]">
                {fillTemplate(t.text, customerName, storeName)}
              </span>
            </button>
            {isCustom(t.id) && (
              <button
                type="button"
                onClick={() => removeTemplate(t.id)}
                aria-label={`Borrar plantilla ${t.label}`}
                className="shrink-0 rounded-full p-1.5 text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--data-error-500)] dark:hover:bg-[var(--surface-sunken)]"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden />
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Alta de plantilla custom */}
      {adding ? (
        <div className="mt-2 space-y-1.5 border-t border-[var(--rule-base)] pt-2 dark:border-[var(--rule-base)]">
          <input
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            placeholder="Nombre corto (ej: Promo del día)"
            aria-label="Nombre de la plantilla"
            maxLength={40}
            className="h-9 w-full rounded-lg border border-[var(--rule-base)] bg-[var(--surface-sunken)] px-2.5 text-sm outline-none focus:border-primary"
          />
          <textarea
            value={newText}
            onChange={(e) => setNewText(e.target.value)}
            placeholder="Texto… usá {nombre} y {tienda} como variables"
            aria-label="Texto de la plantilla"
            rows={2}
            maxLength={600}
            className="w-full resize-none rounded-lg border border-[var(--rule-base)] bg-[var(--surface-sunken)] px-2.5 py-1.5 text-sm outline-none focus:border-primary"
          />
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={addTemplate}
              disabled={!newLabel.trim() || !newText.trim()}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary py-2 text-sm font-bold text-white hover:bg-primary/90 disabled:opacity-60"
            >
              <Check className="h-4 w-4" aria-hidden /> Guardar
            </button>
            <button
              type="button"
              onClick={() => { setAdding(false); setNewLabel(""); setNewText(""); }}
              className="rounded-lg border border-[var(--rule-base)] px-3 py-2 text-sm font-semibold text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)] dark:hover:bg-[var(--surface-sunken)]"
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className={cn(
 "mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-[var(--rule-base)] py-2",
 "text-[length:var(--ts-xs)] font-semibold text-[var(--text-tertiary)] hover:border-primary hover:text-primary",
 "dark:border-[var(--rule-base)] ",
          )}
        >
          <Plus className="h-3.5 w-3.5" aria-hidden /> Nueva plantilla
        </button>
      )}
    </div>
  );
}
