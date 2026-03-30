"use client";

import React from "react";
import { cn } from "@/lib/utils";
import {
  Trash2, Check, X, AlertTriangle,
  Users, Star, ShoppingCart, Loader2, Truck,
  Monitor, Calculator, Activity,
  RotateCcw, FileBarChart,
  Wallet, Package, Bell, Megaphone,
} from "lucide-react";

// ── Keyboard Shortcuts Modal ──────────────────────────────────────────────────

interface ShortcutsModalProps {
  open: boolean;
  onClose: () => void;
}

const SHORTCUT_SECTIONS = [
  {
    title: "General",
    shortcuts: [
      ["Ctrl + K", "Búsqueda global"],
      ["Alt + ?", "Panel de atajos"],
      ["Alt + T", "Cambiar tema (claro/oscuro)"],
      ["Alt + S", "Buscar módulo"],
      ["Alt + L", "Cerrar sesión"],
    ],
  },
  {
    title: "Navegación",
    shortcuts: [
      ["Alt + 1", "Asistente IA"],
      ["Alt + 2", "Ventas & Caja"],
      ["Alt + 3", "Inventario"],
      ["Alt + 4", "Pedidos"],
      ["Alt + 5", "Productos & Precios"],
      ["Alt + 6", "Compras"],
      ["Alt + 7", "Mi Plata"],
      ["Alt + 8", "Mis Clientes"],
      ["Alt + 9", "Configuración"],
      ["Alt + 0", "Mi Plan"],
    ],
  },
  {
    title: "POS & Caja",
    shortcuts: [
      ["F1", "Buscar producto"],
      ["F2", "Cobrar / Finalizar venta"],
      ["F3", "Vaciar carrito"],
      ["F4", "Último ticket"],
      ["Ctrl + M", "Micrófono (voz)"],
      ["Ctrl + Shift + C", "Cerrar día"],
    ],
  },
];

export function ShortcutsModal({ open, onClose }: ShortcutsModalProps) {
  if (!open) return null;

  // Close on Escape
  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-white dark:bg-card rounded-2xl shadow-2xl w-full max-w-lg mx-4 border border-gray-200 dark:border-card-border overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-card-border">
          <h3 className="text-lg font-extrabold text-foreground flex items-center gap-2">
            <Monitor className="h-5 w-5 text-primary" />
            Atajos de teclado
          </h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-surface transition-colors">
            <X className="h-4 w-4 text-gray-500" />
          </button>
        </div>

        {/* Body — sections in 2-column grid */}
        <div className="px-6 py-4 max-h-[60vh] overflow-y-auto space-y-5">
          {SHORTCUT_SECTIONS.map((section) => (
            <div key={section.title}>
              <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-muted mb-2">
                {section.title}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5">
                {section.shortcuts.map(([key, label]) => (
                  <div key={key} className="flex items-center justify-between py-1">
                    <span className="text-sm text-gray-600 dark:text-muted">{label}</span>
                    <kbd className="ml-2 bg-gray-100 dark:bg-surface text-foreground px-2 py-0.5 rounded-md text-xs font-mono border border-gray-200 dark:border-card-border shadow-sm shrink-0">
                      {key}
                    </kbd>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-gray-200 dark:border-card-border bg-gray-50 dark:bg-surface">
          <button
            onClick={onClose}
            className="w-full py-2.5 rounded-xl bg-primary text-white font-bold text-sm hover:bg-primary/90 transition-colors"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Clear Data Confirmation Modal ─────────────────────────────────────────────

const ALL_CLEAR_CATS = [
  { key: "products", label: "Productos", icon: Package, desc: "Productos, combos, historial precios, inventario" },
  { key: "customers", label: "Clientes", icon: Users, desc: "Clientes, ubicaciones, carritos, listas de compra" },
  { key: "orders", label: "Pedidos", icon: ShoppingCart, desc: "Pedidos online y slots de entrega" },
  { key: "sales", label: "Ventas POS", icon: Monitor, desc: "Ventas del punto de venta" },
  { key: "suppliers", label: "Proveedores", icon: Truck, desc: "Proveedores, compras, cuentas por pagar" },
  { key: "promotions", label: "Promociones & Cupones", icon: Megaphone, desc: "Promociones y cupones de descuento" },
  { key: "cash", label: "Caja", icon: Calculator, desc: "Registros de caja y movimientos" },
  { key: "reviews", label: "Reseñas", icon: Star, desc: "Opiniones de clientes" },
  { key: "expenses", label: "Gastos", icon: Wallet, desc: "Gastos operativos" },
  { key: "returns", label: "Devoluciones", icon: RotateCcw, desc: "Devoluciones y reembolsos" },
  { key: "activity", label: "Actividad & Chat", icon: Activity, desc: "Logs, mensajes internos, chat" },
  { key: "cms", label: "CMS & Tests", icon: FileBarChart, desc: "Páginas, A/B tests, encuestas, media" },
  { key: "notifications", label: "Notificaciones", icon: Bell, desc: "Suscripciones push, notificaciones" },
] as const;

interface ClearDataModalProps {
  open: boolean;
  clearConfirmStep: 1 | 2 | 3;
  setClearConfirmStep: (step: 1 | 2 | 3) => void;
  clearConfirmText: string;
  setClearConfirmText: (text: string) => void;
  clearCategories: Set<string>;
  setClearCategories: React.Dispatch<React.SetStateAction<Set<string>>>;
  clearingData: boolean;
  setClearingData: (v: boolean) => void;
  onClose: () => void;
  demoDataModuleKeys: string[];
}

export function ClearDataModal({
  open,
  clearConfirmStep,
  setClearConfirmStep,
  clearConfirmText,
  setClearConfirmText,
  clearCategories,
  setClearCategories,
  clearingData,
  setClearingData,
  onClose,
  demoDataModuleKeys,
}: ClearDataModalProps) {
  if (!open) return null;

  const allSelected = clearCategories.size === ALL_CLEAR_CATS.length;
  const toggleCat = (key: string) => {
    setClearCategories(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };
  const toggleAll = () => {
    if (allSelected) setClearCategories(new Set());
    else setClearCategories(new Set(ALL_CLEAR_CATS.map(c => c.key)));
  };
  const handleCancel = () => {
    onClose();
    setClearConfirmStep(1);
    setClearConfirmText("");
  };
  const handleExecute = () => {
    if (clearConfirmText !== "BORRAR_TODO") return;
    setClearingData(true);
    onClose();
    setClearConfirmStep(1);
    setClearConfirmText("");

    // Nuclear localStorage clear: wipe everything EXCEPT UI preferences
    const KEEP_KEYS = new Set([
      "admin_compact", "admin_fav_tabs", "admin_hidden_tabs",
      "admin_recent_tabs", "bsm-admin-theme-set", "theme",
    ]);
    try {
      const allKeys: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && !KEEP_KEYS.has(k)) allKeys.push(k);
      }
      allKeys.forEach(k => { try { localStorage.removeItem(k); } catch {} });
    } catch { /* ignore */ }

    const cats = [...clearCategories];
    fetch("/api/admin/clear-data", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirm: "BORRAR_TODO", categories: allSelected ? undefined : cats }),
    })
      .then(r => r.json())
      .then(d => {
        if (d.success) {
          try { localStorage.setItem("admin_demo_cleared", JSON.stringify(demoDataModuleKeys)); } catch {}
          window.location.reload();
        } else {
          alert(d.error || "Error al borrar datos");
        }
      })
      .catch((err) => alert(`Error de conexión: ${err?.message ?? "verifica tu red"}`))
      .finally(() => setClearingData(false));
  };

  return (
    <div className="fixed inset-0 z-100 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={handleCancel}>
      <div className="bg-white dark:bg-card rounded-2xl shadow-2xl max-w-lg w-full mx-4 p-6 space-y-4 max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>

        {/* Step indicator */}
        <div className="flex items-center gap-2">
          {([1, 2, 3] as const).map(n => (
            <div key={n} className="flex items-center gap-2">
              <div className={cn(
                "h-6 w-6 rounded-full flex items-center justify-center text-xs font-bold transition-colors",
                clearConfirmStep >= n
                  ? "bg-red-600 text-white"
                  : "bg-gray-200 dark:bg-surface text-gray-400"
              )}>{n}</div>
              {n < 3 && <div className={cn("h-0.5 w-6 rounded transition-colors", clearConfirmStep > n ? "bg-red-600" : "bg-gray-200 dark:bg-surface")} />}
            </div>
          ))}
          <span className="ml-2 text-xs text-gray-400 dark:text-muted">
            {clearConfirmStep === 1 && "Seleccionar categorías"}
            {clearConfirmStep === 2 && "Leer advertencia"}
            {clearConfirmStep === 3 && "Confirmar borrado"}
          </span>
        </div>

        {/* STEP 1: Category selection */}
        {clearConfirmStep === 1 && (
          <>
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-full bg-red-100 dark:bg-red-950/40 flex items-center justify-center shrink-0">
                <Trash2 className="h-6 w-6 text-red-600" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-gray-900 dark:text-foreground">Borrar datos</h3>
                <p className="text-sm text-gray-500 dark:text-muted">Selecciona qué datos eliminar</p>
              </div>
            </div>

            <div className="flex items-center justify-between px-1">
              <button onClick={toggleAll} className="text-xs font-semibold text-primary hover:underline">
                {allSelected ? "Deseleccionar todo" : "Seleccionar todo"}
              </button>
              <span className="text-xs text-gray-400 dark:text-muted">{clearCategories.size} de {ALL_CLEAR_CATS.length}</span>
            </div>

            <div className="overflow-y-auto flex-1 space-y-1 -mx-1 px-1">
              {ALL_CLEAR_CATS.map(cat => {
                const CatIcon = cat.icon;
                const selected = clearCategories.has(cat.key);
                return (
                  <label
                    key={cat.key}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2.5 rounded-xl border cursor-pointer transition-all",
                      selected
                        ? "border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/20"
                        : "border-gray-200 dark:border-card-border hover:bg-gray-50 dark:hover:bg-surface"
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() => toggleCat(cat.key)}
                      className="rounded border-gray-300 text-red-500 focus:ring-red-500"
                    />
                    <CatIcon className={cn("h-5 w-5 shrink-0", selected ? "text-red-500" : "text-gray-400")} />
                    <div className="flex-1 min-w-0">
                      <p className={cn("text-sm font-semibold", selected ? "text-red-700 dark:text-red-400" : "text-gray-700 dark:text-foreground")}>{cat.label}</p>
                      <p className="text-xs text-gray-500 dark:text-muted truncate">{cat.desc}</p>
                    </div>
                  </label>
                );
              })}
            </div>

            <div className="flex gap-3 pt-2">
              <button onClick={handleCancel} className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-gray-600 dark:text-muted border border-gray-200 dark:border-card-border hover:bg-gray-50 dark:hover:bg-surface transition-colors">
                Cancelar
              </button>
              <button
                onClick={() => setClearConfirmStep(2)}
                disabled={clearCategories.size === 0}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white bg-red-600 hover:bg-red-700 transition-colors disabled:opacity-50"
              >
                Siguiente →
              </button>
            </div>
          </>
        )}

        {/* STEP 2: Warning */}
        {clearConfirmStep === 2 && (
          <>
            <div className="bg-red-50 dark:bg-red-950/30 border-2 border-red-200 dark:border-red-800 rounded-xl p-5 space-y-3">
              <div className="flex items-center gap-3">
                <AlertTriangle className="h-8 w-8 text-red-600 shrink-0" />
                <h3 className="text-lg font-bold text-red-700 dark:text-red-400">Advertencia</h3>
              </div>
              <ul className="space-y-2 text-sm text-red-700 dark:text-red-400">
                <li className="flex items-start gap-2"><X className="h-4 w-4 shrink-0 mt-0.5" /> Esta acción <strong>NO se puede deshacer</strong></li>
                <li className="flex items-start gap-2"><X className="h-4 w-4 shrink-0 mt-0.5" /> Se borrarán <strong>{clearCategories.size} categoría{clearCategories.size !== 1 ? "s" : ""}</strong></li>
                <li className="flex items-start gap-2"><X className="h-4 w-4 shrink-0 mt-0.5" /> Todos los registros serán eliminados permanentemente</li>
                <li className="flex items-start gap-2"><Check className="h-4 w-4 shrink-0 mt-0.5 text-emerald-500" /> La configuración del negocio se mantendrá</li>
              </ul>
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={() => setClearConfirmStep(1)} className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-gray-600 dark:text-muted border border-gray-200 dark:border-card-border hover:bg-gray-50 dark:hover:bg-surface transition-colors">
                ← Volver
              </button>
              <button onClick={() => setClearConfirmStep(3)} className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white bg-red-600 hover:bg-red-700 transition-colors">
                Entiendo, continuar →
              </button>
            </div>
          </>
        )}

        {/* STEP 3: Confirm text */}
        {clearConfirmStep === 3 && (
          <>
            <div className="space-y-3">
              <p className="text-sm text-gray-700 dark:text-foreground">
                Para confirmar, escribe <code className="bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 px-1.5 py-0.5 rounded font-mono text-xs">BORRAR_TODO</code> en el campo de abajo:
              </p>
              <input
                type="text"
                value={clearConfirmText}
                onChange={e => setClearConfirmText(e.target.value)}
                placeholder="Escribe BORRAR_TODO"
                autoFocus
                className="w-full px-4 py-3 text-center text-lg font-mono rounded-xl border-2 border-red-300 dark:border-red-800 outline-none focus:border-red-500 focus:ring-2 focus:ring-red-200 dark:bg-surface text-red-700 dark:text-red-400 placeholder:text-gray-300 dark:placeholder:text-muted"
              />
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={() => setClearConfirmStep(2)} className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-gray-600 dark:text-muted border border-gray-200 dark:border-card-border hover:bg-gray-50 dark:hover:bg-surface transition-colors">
                ← Volver
              </button>
              <button
                onClick={handleExecute}
                disabled={clearConfirmText !== "BORRAR_TODO" || clearingData}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white bg-red-600 hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {clearingData ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                Borrar datos seleccionados
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
