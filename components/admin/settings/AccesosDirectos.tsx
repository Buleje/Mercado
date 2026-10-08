import { Zap, Trash2, Plus } from "@buleje/design-system/icons";

export type AccesoDirecto = { id: string; label: string; tabId: string };

/** Accesos directos del panel (hasta 6), guardados en este navegador. */
export function AccesosDirectos({ customShortcuts, setCustomShortcuts }: {
  customShortcuts: AccesoDirecto[];
  setCustomShortcuts: (v: AccesoDirecto[]) => void;
}) {
    const availableTabs = [
      { value: "dashboard", label: "Ventas hoy" },
      { value: "inventario", label: "Inventario" },
      { value: "pos-caja", label: "Caja POS" },
      { value: "pedidos", label: "Pedidos" },
      { value: "productos", label: "Productos" },
      { value: "clientes-crm", label: "Clientes" },
      { value: "compras", label: "Compras" },
      { value: "fiados", label: "Fiados" },
      { value: "reportes", label: "Reportes" },
      { value: "config", label: "Configuración" },
      { value: "chat", label: "Chat" },
      { value: "cotizaciones", label: "Cotizaciones" },
    ];

    const addShortcut = () => {
      if (customShortcuts.length >= 6) return;
      const newId = `shortcut-${Date.now()}`;
      const updated = [...customShortcuts, { id: newId, label: "Nuevo acceso", tabId: "dashboard" }];
      setCustomShortcuts(updated);
      localStorage.setItem("admin_custom_shortcuts", JSON.stringify(updated));
    };

    const removeShortcut = (id: string) => {
      const updated = customShortcuts.filter(s => s.id !== id);
      setCustomShortcuts(updated);
      localStorage.setItem("admin_custom_shortcuts", JSON.stringify(updated));
    };

    const updateShortcut = (id: string, field: "label" | "tabId", value: string) => {
      const updated = customShortcuts.map(s => s.id === id ? { ...s, [field]: value } : s);
      setCustomShortcuts(updated);
      localStorage.setItem("admin_custom_shortcuts", JSON.stringify(updated));
    };

    return (
      <div className="space-y-4">
          {customShortcuts.length === 0 && (
            <p className="text-sm text-[var(--text-tertiary)] dark:text-muted text-center py-4">No tienes accesos directos aún. Agrega uno para navegar más rápido.</p>
          )}
          <div className="space-y-3">
            {customShortcuts.map(sc => (
              <div key={sc.id} className="flex items-center gap-3 p-3 bg-[var(--surface-sunken)] rounded-xl border border-[var(--rule-soft)] dark:border-[var(--rule-base)]">
                <Zap className="h-4 w-4 text-[var(--data-warning-500)] shrink-0" />
                <input
                  aria-label="Nombre del acceso"
                  value={sc.label}
                  onChange={e => updateShortcut(sc.id, "label", e.target.value)}
                  className="flex-1 px-2 py-1.5 text-sm rounded-xl border border-[var(--rule-base)] dark:border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-primary)] dark:text-[var(--text-primary)]"
                  placeholder="Nombre del acceso"
                />
                <select
                  aria-label="Pantalla a la que apunta el acceso"
                  value={sc.tabId}
                  onChange={e => updateShortcut(sc.id, "tabId", e.target.value)}
                  className="px-2 py-1.5 text-sm rounded-xl border border-[var(--rule-base)] dark:border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-primary)] dark:text-[var(--text-primary)]"
                >
                  {availableTabs.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
                <button aria-label="Eliminar" onClick={() => removeShortcut(sc.id)} className="p-1.5 rounded-xl text-[var(--data-error-500)] hover:bg-[var(--data-error-50)] hover:text-[var(--data-error-500)] transition-colors">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
          {customShortcuts.length < 6 && (
            <button onClick={addShortcut} className="w-full flex items-center justify-center gap-2 px-4 min-h-11 rounded-xl border border-dashed border-[var(--rule-base)] dark:border-[var(--rule-base)] text-sm font-semibold text-[var(--text-secondary)] hover:text-primary hover:border-primary transition-colors mt-2">
              <Plus className="h-4 w-4" /> Agregar acceso directo
            </button>
          )}
      </div>
    );
}
