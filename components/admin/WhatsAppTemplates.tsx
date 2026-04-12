"use client";

import { useState, useEffect, useCallback } from "react";
import { Copy, Check, Plus, Pencil, MessageSquare, Trash2 } from "lucide-react";
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
          <span key={i} className="px-1 py-0.5 mx-0.5 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 text-xs font-semibold">
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
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="h-9 w-9 rounded-xl bg-[#25D366] text-white flex items-center justify-center">
            <MessageSquare className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-bold text-gray-900 dark:text-white">Plantillas WhatsApp</p>
            <p className="text-[10px] text-gray-500 dark:text-gray-400">{allTemplates.length} plantillas disponibles</p>
          </div>
        </div>
        {!creating && (
          <button
            onClick={() => { setCreating(true); setEditingId(null); setNewName(""); setNewText(""); }}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#00B4A6] text-white text-xs font-bold hover:bg-[#245a41] transition-colors"
          >
            <Plus className="h-3.5 w-3.5" /> Nueva plantilla
          </button>
        )}
      </div>

      {/* Create/Edit form */}
      {creating && (
        <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl p-4 space-y-3">
          <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">
            {editingId ? "Editar plantilla" : "Nueva plantilla"}
          </p>
          <input
            type="text"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            placeholder="Nombre (ej: Recordatorio pago)"
            className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-card-border bg-white dark:bg-card text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#00B4A6]/40"
          />
          <textarea
            value={newText}
            onChange={e => setNewText(e.target.value)}
            placeholder="Mensaje. Usa {nombre}, {monto}, etc. para variables"
            rows={3}
            className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-card-border bg-white dark:bg-card text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#00B4A6]/40 resize-none"
          />
          {newText && (
            <div className="p-2.5 rounded-lg bg-gray-50 dark:bg-surface text-xs text-gray-700 dark:text-gray-300 leading-relaxed">
              <p className="text-[10px] text-gray-400 mb-1">Vista previa:</p>
              <HighlightedText text={newText} />
            </div>
          )}
          <div className="flex justify-end gap-2">
            <button
              onClick={() => { setCreating(false); setEditingId(null); setNewName(""); setNewText(""); }}
              className="px-3 py-2 rounded-xl text-xs font-medium text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={handleSaveNew}
              disabled={!newName.trim() || !newText.trim()}
              className="px-4 py-2 rounded-xl text-xs font-medium bg-[#00B4A6] text-white hover:bg-[#245a41] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
            className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl p-4 hover:shadow-md transition-shadow"
          >
            <div className="flex items-start justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="text-lg">💬</span>
                <p className="text-sm font-bold text-gray-900 dark:text-white">{template.nombre}</p>
              </div>
              {template.custom && (
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handleEdit(template)}
                    className="p-1 rounded-lg text-gray-400 hover:text-[#00B4A6] hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                    title="Editar"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => handleDelete(template.id)}
                    className="p-1 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                    title="Eliminar"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
            </div>

            <div className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed mb-3">
              <HighlightedText text={template.texto} />
            </div>

            {template.variables.length > 0 && (
              <div className="flex flex-wrap gap-1 mb-3">
                {template.variables.map(v => (
                  <span key={v} className="px-1.5 py-0.5 rounded-md bg-gray-100 dark:bg-surface text-[10px] font-semibold text-gray-500 dark:text-gray-400">
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
                  ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600"
                  : "bg-gray-100 dark:bg-surface text-gray-700 dark:text-gray-300 hover:bg-[#25D366]/10 hover:text-[#25D366]"
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
        <div className="text-center py-12 text-gray-400">
          <MessageSquare className="h-8 w-8 mx-auto mb-2" />
          <p className="text-sm">Sin plantillas disponibles</p>
        </div>
      )}
    </div>
  );
}
