"use client";

import { usePreferences, exportPreferences, importPreferences, type UserPreferences } from "@/hooks/use-preferences";
import { useTheme } from "@/contexts/theme-context";
import { Settings, Download, Upload, RotateCcw } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { useRef, useState } from "react";

export function PreferencesPanel() {
  const { preferences, updatePreference, resetPreferences } = usePreferences();
  const { setTheme } = useTheme();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importSuccess, setImportSuccess] = useState(false);
  const [importError, setImportError] = useState(false);

  const handleExport = () => {
    const json = exportPreferences();
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `preferences-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const json = event.target?.result as string;
      const success = importPreferences(json);
      
      if (success) {
        setImportSuccess(true);
        setTimeout(() => setImportSuccess(false), 3000);
        
        // Reload page to apply preferences
        window.location.reload();
      } else {
        setImportError(true);
        setTimeout(() => setImportError(false), 4000);
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 rounded-lg">
            <Settings className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-[var(--text-primary)]">Preferencias</h2>
            <p className="text-sm text-muted">Personaliza tu experiencia</p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <button
            onClick={handleExport}
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-surface rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
          >
            <Download className="h-4 w-4" />
            Exportar
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-surface rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
          >
            <Upload className="h-4 w-4" />
            Importar
          </button>
          <button
            onClick={resetPreferences}
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-[var(--data-error-600)] dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
          >
            <RotateCcw className="h-4 w-4" />
            Resetear
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            onChange={handleImport}
            className="hidden"
          />
        </div>
      </div>

      {/* Import Success Message */}
      {importSuccess && (
        <div className="p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
          <p className="text-sm text-green-700 dark:text-green-300 font-semibold">
            ✓ Preferencias importadas correctamente
          </p>
        </div>
      )}

      {/* Import Error Message */}
      {importError && (
        <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
          <p className="text-sm text-[var(--data-error-700)] dark:text-red-300 font-semibold">
            ✗ Archivo inválido. Verifica que sea un JSON de preferencias exportado.
          </p>
        </div>
      )}

      {/* Appearance */}
      <Section title="Apariencia">
        <Select
          label="Tema"
          value={preferences.theme || "system"}
          onChange={(value) => {
              updatePreference("theme", value as UserPreferences["theme"]);
              // "auto" fallback a "system" (Theme no tiene "auto")
              setTheme(value === "auto" ? "system" : (value as "light" | "dark" | "system"));
            }}
          options={[
            { value: "light", label: "Claro" },
            { value: "dark", label: "Oscuro" },
            { value: "system", label: "Sistema" },
            { value: "auto", label: "Automatico (7pm-6am oscuro)" },
          ]}
        />
        <Select
          label="Tamaño de fuente"
          value={preferences.fontSize || "medium"}
          onChange={(value) => updatePreference("fontSize", value as UserPreferences["fontSize"])}
          options={[
            { value: "small", label: "Pequeño" },
            { value: "medium", label: "Mediano" },
            { value: "large", label: "Grande" },
          ]}
        />
        <Toggle
          label="Modo compacto"
          description="Reducir espaciado en listas"
          checked={preferences.compactMode || false}
          onChange={(checked) => updatePreference("compactMode", checked)}
        />
        <Toggle
          label="Mostrar imágenes"
          description="Ver imágenes de productos"
          checked={preferences.showImages !== false}
          onChange={(checked) => updatePreference("showImages", checked)}
        />
      </Section>

      {/* Accessibility */}
      <Section title="Accesibilidad">
        <Toggle
          label="Reducir animaciones"
          description="Desactivar transiciones y efectos"
          checked={preferences.reduceMotion || false}
          onChange={(checked) => updatePreference("reduceMotion", checked)}
        />
        <Toggle
          label="Alto contraste"
          description="Aumentar contraste de colores"
          checked={preferences.highContrast || false}
          onChange={(checked) => updatePreference("highContrast", checked)}
        />
      </Section>

      {/* Catalog */}
      <Section title="Catálogo">
        <Select
          label="Modo de vista"
          value={preferences.viewMode || "grid"}
          onChange={(value) => updatePreference("viewMode", value as UserPreferences["viewMode"])}
          options={[
            { value: "grid", label: "Cuadrícula" },
            { value: "list", label: "Lista" },
          ]}
        />
        <Select
          label="Productos por página"
          value={String(preferences.itemsPerPage || 24)}
          onChange={(value) => updatePreference("itemsPerPage", Number(value) as UserPreferences["itemsPerPage"])}
          options={[
            { value: "12", label: "12" },
            { value: "24", label: "24" },
            { value: "48", label: "48" },
          ]}
        />
        <Toggle
          label="Recordar filtros"
          description="Mantener filtros entre sesiones"
          checked={preferences.rememberFilters !== false}
          onChange={(checked) => updatePreference("rememberFilters", checked)}
        />
      </Section>

      {/* Shopping */}
      <Section title="Compras">
        <Toggle
          label="Precios con impuestos"
          description="Mostrar precios finales con IGV"
          checked={preferences.showPricesWithTax !== false}
          onChange={(checked) => updatePreference("showPricesWithTax", checked)}
        />
        <Toggle
          label="Guardar carrito automáticamente"
          description="Mantener productos en el carrito"
          checked={preferences.autoSaveCart !== false}
          onChange={(checked) => updatePreference("autoSaveCart", checked)}
        />
        <Select
          label="Moneda"
          value={preferences.currency || "PEN"}
          onChange={(value) => updatePreference("currency", value as UserPreferences["currency"])}
          options={[
            { value: "PEN", label: "Soles (S/)" },
            { value: "USD", label: "Dólares ($)" },
          ]}
        />
      </Section>

      {/* Notifications */}
      <Section title="Notificaciones">
        <Toggle
          label="Notificaciones"
          description="Recibir alertas de pedidos y ofertas"
          checked={preferences.notifications !== false}
          onChange={(checked) => updatePreference("notifications", checked)}
        />
        <Toggle
          label="Efectos de sonido"
          description="Reproducir sonidos en acciones"
          checked={preferences.soundEffects || false}
          onChange={(checked) => updatePreference("soundEffects", checked)}
        />
      </Section>

      {/* Regional */}
      <Section title="Regional">
        <Select
          label="Idioma"
          value={preferences.language || "es"}
          onChange={(value) => updatePreference("language", value as UserPreferences["language"])}
          options={[
            { value: "es", label: "Español" },
            { value: "en", label: "English" },
          ]}
        />
        <Select
          label="Formato de fecha"
          value={preferences.dateFormat || "dd/mm/yyyy"}
          onChange={(value) => updatePreference("dateFormat", value as UserPreferences["dateFormat"])}
          options={[
            { value: "dd/mm/yyyy", label: "DD/MM/AAAA" },
            { value: "mm/dd/yyyy", label: "MM/DD/AAAA" },
          ]}
        />
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-[var(--surface-raised)] rounded-xl border border-[var(--rule-base)] p-6">
      <h3 className="text-lg font-bold text-[var(--text-primary)] mb-4">{title}</h3>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

function Toggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-start gap-3 cursor-pointer group">
      <div className="flex items-center h-6">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="w-5 h-5 text-primary bg-gray-100 border-gray-300 rounded focus:ring-2 focus:ring-primary dark:bg-gray-700 dark:border-gray-600 cursor-pointer"
        />
      </div>
      <div className="flex-1">
        <div className="text-sm font-semibold text-[var(--text-primary)] group-hover:text-primary transition-colors">
          {label}
        </div>
        {description && <div className="text-xs text-muted mt-0.5">{description}</div>}
      </div>
    </label>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <label className="text-sm font-semibold text-[var(--text-primary)]">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          "px-4 py-2 rounded-lg text-sm font-semibold",
          "bg-gray-100 dark:bg-surface",
          "text-[var(--text-primary)]",
          "border border-gray-300 dark:border-gray-600",
          "focus:outline-none focus:ring-2 focus:ring-primary",
          "cursor-pointer"
        )}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
