"use client";

import { useState, useEffect, useCallback } from "react";
import { Copy, Check, Plus, Pencil, MessageSquare, Trash2 } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

type WATemplate = {
  id: string;
  nombre: string;
  texto: string;
  variables: string[];
  custom?: boolean;
};

// ── Predefined templates ──────────────────────────────────────────────────────

const PREDEFINED: WATemplate[] = [
  {
    id: "cobro-fiado",
    nombre: "Cobrar fiado",
    texto: "Hola {nombre}, te recordamos que tienes un pendiente de S/{monto} en Buleje. ¿Cuándo puedes pasar? 😊",
    variables: ["nombre", "monto"],
  },
  {
    id: "confirmar-pedido",
    nombre: "Confirmar pedido",
    texto: "✅ Hola {nombre}, tu pedido #{pedido} ha sido confirmado. Lo tendremos listo pronto. 🛒",
    variables: ["nombre", "pedido"],
  },
  {
    id: "cumpleanos",
    nombre: "Feliz cumpleaños",
    texto: "🎂 ¡Feliz cumpleaños {nombre}! Te regalamos un 10% de descuento. Usa el código: CUMPLE-{codigo}. ¡Te esperamos! 🎁",
    variables: ["nombre", "codigo"],
  },
  {
    id: "reactivacion",
    nombre: "Reactivar cliente",
    texto: "Hola {nombre}, ¡te extrañamos! Tenemos ofertas especiales esperándote en Buleje. ¡Visítanos! 🛍",
    variables: ["nombre"],
  },
  {
    id: "stock-disponible",
    nombre: "Producto disponible",
    texto: "📦 Hola {nombre}, {producto} ya está disponible en Buleje. ¡No te quedes sin el tuyo! 🏃",
    variables: ["nombre", "producto"],
  },
  {
    id: "agradecimiento",
    nombre: "Agradecimiento",
    texto: "🙏 Hola {nombre}, gracias por tu compra de hoy (S/{monto}). ¡Vuelve pronto a Buleje! 😊",
    variables: ["nombre", "monto"],
  },
];

const LS_KEY = "buleje-whatsapp-templates";

function loadCustomTemplates(): WATemplate[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? (JSON.parse(raw) as WATemplate[]) : [];
  } catch { return []; }
}

function saveCustomTemplates(templates: WATemplate[]) {
  localStorage.setItem(LS_KEY, JSON.stringify(templates));
}

// ── Variable highlight ────────────────────────────────────────────────────────

function HighlightedText({ text }: { text: string }) {
  const parts = text.split(/(\{[^}]+\})/g);
  return (
    <span>
      {parts.map((part, i) =>
        part.startsWith("{") && part.endsWith("}") ? (
          <span key={i} className="px-1 py-0.5 mx-0.5 rounded bg-[var(--data-warning-100)] dark:bg-[var(--data-warning-500)]/30 text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)] text-xs font-semibold">
            {part}
          </span>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </span>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function WhatsAppTemplates() {
  const [customTemplates, setCustomTemplates] = useState<WATemplate[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newText, setNewText] = useState("");

  useEffect(() => {
    setCustomTemplates(loadCustomTemplates());
  }, []);

  const allTemplates = [...PREDEFINED, ...customTemplates];

  const handleCopy = useCallback(async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch { /* silent */ }
  }, []);

  const handleSaveNew = useCallback(() => {
    if (!newName.trim() || !newText.trim()) return;
    // Extract variables from {var} pattern
    const vars = [...newText.matchAll(/\{(\w+)\}/g)].map(m => m[1]);
    const unique = [...new Set(vars)];
    const newTemplate: WATemplate = {
      id: `custom-${Date.now()}`,
      nombre: newName.trim(),
      texto: newText.trim(),
      variables: unique,
      custom: true,
    };

    if (editingId) {
      const updated = customTemplates.map(t => t.id === editingId ? { ...newTemplate, id: editingId } : t);
      setCustomTemplates(updated);
      saveCustomTemplates(updated);
      setEditingId(null);
    } else {
      const updated = [...customTemplates, newTemplate];
      setCustomTemplates(updated);
      saveCustomTemplates(updated);
    }
    setCreating(false);
    setNewName("");
    setNewText("");
  }, [newName, newText, editingId, customTemplates]);

  const handleDelete = useCallback((id: string) => {
    const updated = customTemplates.filter(t => t.id !== id);
    setCustomTemplates(updated);
    saveCustomTemplates(updated);
  }, [customTemplates]);

  const handleEdit = useCallback((template: WATemplate) => {
    setEditingId(template.id);
    setNewName(template.nombre);
    setNewText(template.texto);
    setCreating(true);
  }, []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="h-9 w-9 rounded-lg bg-[#25D366] text-white flex items-center justify-center">
            <MessageSquare className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-bold text-[var(--text-primary)]">Plantillas WhatsApp</p>
            <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">{allTemplates.length} plantillas disponibles</p>
          </div>
        </div>
        {!creating && (
          <button
            onClick={() => { setCreating(true); setEditingId(null); setNewName(""); setNewText(""); }}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-white text-xs font-bold hover:bg-primary-dark transition-colors"
          >
            <Plus className="h-3.5 w-3.5" /> Nueva plantilla
          </button>
        )}
      </div>

      {/* Create/Edit form */}
      {creating && (
        <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-xl p-4 space-y-3">
          <p className="text-sm font-semibold text-[var(--text-secondary)]">
            {editingId ? "Editar plantilla" : "Nueva plantilla"}
          </p>
          <input
            type="text"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            placeholder="Nombre (ej: Recordatorio pago)"
            className="w-full px-3 py-2 rounded-lg border border-[var(--rule-base)] dark:border-[var(--rule-base)] bg-[var(--surface-raised)] text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
          <textarea
            value={newText}
            onChange={e => setNewText(e.target.value)}
            placeholder="Mensaje. Usa {nombre}, {monto}, etc. para variables"
            rows={3}
            className="w-full px-3 py-2 rounded-lg border border-[var(--rule-base)] dark:border-[var(--rule-base)] bg-[var(--surface-raised)] text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none"
          />
          {newText && (
            <div className="p-2.5 rounded-lg bg-gray-50 dark:bg-surface text-xs text-[var(--text-secondary)] leading-relaxed">
              <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] mb-1">Vista previa:</p>
              <HighlightedText text={newText} />
            </div>
          )}
          <div className="flex justify-end gap-2">
            <button
              onClick={() => { setCreating(false); setEditingId(null); setNewName(""); setNewText(""); }}
              className="px-3 py-2 rounded-lg text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={handleSaveNew}
              disabled={!newName.trim() || !newText.trim()}
              className="px-4 py-2 rounded-lg text-xs font-medium bg-primary text-white hover:bg-primary-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {editingId ? "Guardar cambios" : "Crear plantilla"}
            </button>
          </div>
        </div>
      )}

      {/* Templates grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {allTemplates.map(template => (
          <div
            key={template.id}
            className="bg-[var(--surface-raised)] border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-xl p-4 hover:shadow-sm transition-shadow"
          >
            <div className="flex items-start justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="text-lg">💬</span>
                <p className="text-sm font-bold text-[var(--text-primary)]">{template.nombre}</p>
              </div>
              {template.custom && (
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handleEdit(template)}
                    className="p-1 rounded-lg text-[var(--text-tertiary)] hover:text-primary hover:bg-[var(--surface-sunken)] transition-colors"
                    title="Editar"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => handleDelete(template.id)}
                    className="p-1 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--data-error-500)] hover:bg-[var(--data-error-50)] dark:hover:bg-[var(--data-error-500)]/20 transition-colors"
                    title="Eliminar"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
            </div>

            <div className="text-xs text-[var(--text-secondary)] leading-relaxed mb-3">
              <HighlightedText text={template.texto} />
            </div>

            {template.variables.length > 0 && (
              <div className="flex flex-wrap gap-1 mb-3">
                {template.variables.map(v => (
                  <span key={v} className="px-1.5 py-0.5 rounded-md bg-gray-100 dark:bg-surface text-[length:var(--ts-2xs)] font-semibold text-[var(--text-tertiary)]">
                    {v}
                  </span>
                ))}
              </div>
            )}

            <button
              onClick={() => handleCopy(template.id, template.texto)}
              className={cn(
                "w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-colors",
                copiedId === template.id
                  ? "bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] text-[var(--data-success-500)]"
                  : "bg-gray-100 dark:bg-surface text-[var(--text-secondary)] hover:bg-[#25D366]/10 hover:text-[#25D366]"
              )}
            >
              {copiedId === template.id ? (
                <><Check className="h-3.5 w-3.5" /> Copiado</>
              ) : (
                <><Copy className="h-3.5 w-3.5" /> Copiar mensaje</>
              )}
            </button>
          </div>
        ))}
      </div>

      {allTemplates.length === 0 && (
        <div className="text-center py-12 text-[var(--text-tertiary)]">
          <MessageSquare className="h-8 w-8 mx-auto mb-2" />
          <p className="text-sm">Sin plantillas disponibles</p>
        </div>
      )}
    </div>
  );
}
