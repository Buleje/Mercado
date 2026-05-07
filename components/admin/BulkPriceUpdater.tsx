"use client";

import { SectionTitle } from "@buleje/design-system";
import { useState, useRef, useCallback, useEffect, DragEvent, ChangeEvent } from "react";
import { Upload, Percent, CheckCircle, AlertTriangle, Loader2, X } from "@buleje/design-system/icons";
import { cn, formatCurrency } from "@/lib/utils";
import { csrfHeaders } from "@/lib/csrf-client";

// ─── Types ────────────────────────────────────────────────────────────────────

type Product = {
  id: number;
  name: string;
  price: number;
  category: string;
};

type PriceChange = {
  product: Product;
  newPrice: number;
  diff: number;
};

type Mode = "csv" | "percent";

// ─── CSV Parser ───────────────────────────────────────────────────────────────

function parseCSVPrices(text: string): Map<string, number> {
  const sep = text.includes(";") ? ";" : ",";
  const lines = text.replace(/\r\n/g, "\n").split("\n").filter(Boolean);
  const map = new Map<string, number>();
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(sep).map((c) => c.trim().replace(/^"(.*)"$/, "$1"));
    const nombre = cols[0] ?? "";
    const precio = parseFloat((cols[1] ?? "0").replace(",", "."));
    if (nombre && !isNaN(precio) && precio >= 0) map.set(nombre.toLowerCase(), precio);
  }
  return map;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function BulkPriceUpdater() {
  const [mode, setMode] = useState<Mode>("percent");
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);

  // Percent mode
  const [selectedCategory, setSelectedCategory] = useState<string>("__all__");
  const [percentChange, setPercentChange] = useState<number>(0);
  const [direction, setDirection] = useState<"increase" | "decrease">("increase");

  // CSV mode
  const [dragging, setDragging] = useState(false);
  const [csvPriceMap, setCsvPriceMap] = useState<Map<string, number> | null>(null);
  const [csvFileName, setCsvFileName] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  // Preview + apply
  const [changes, setChanges] = useState<PriceChange[]>([]);
  const [step, setStep] = useState<"config" | "preview" | "applying" | "done">("config");
  const [progress, setProgress] = useState(0);
  const [updatedCount, setUpdatedCount] = useState(0);

  // Load products on mount
  useEffect(() => {
    fetch("/api/products")
      .then((r) => r.json())
      .then((data: unknown) => {
        const list = Array.isArray(data) ? data as Product[] : [];
        setProducts(list);
        const cats = [...new Set(list.map((p) => p.category).filter(Boolean))].sort();
        setCategories(cats);
      })
      .catch(() => {})
      .finally(() => setLoadingProducts(false));
  }, []);

  const loadCSV = useCallback((file: File) => {
    setCsvFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      setCsvPriceMap(parseCSVPrices(text));
    };
    reader.readAsText(file, "utf-8");
  }, []);

  const onDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) loadCSV(file);
    },
    [loadCSV]
  );

  const onFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) loadCSV(file);
  };

  const buildPreview = () => {
    let filtered = products;
    if (mode === "percent") {
      if (selectedCategory !== "__all__") {
        filtered = products.filter((p) => p.category === selectedCategory);
      }
      const factor = direction === "increase" ? 1 + percentChange / 100 : 1 - percentChange / 100;
      const preview: PriceChange[] = filtered.map((p) => {
        const newPrice = Math.round(p.price * factor * 100) / 100;
        return { product: p, newPrice, diff: newPrice - p.price };
      });
      setChanges(preview);
    } else {
      if (!csvPriceMap) return;
      const preview: PriceChange[] = [];
      for (const p of products) {
        const newPrice = csvPriceMap.get(p.name.toLowerCase());
        if (newPrice !== undefined) {
          preview.push({ product: p, newPrice, diff: newPrice - p.price });
        }
      }
      setChanges(preview);
    }
    setStep("preview");
  };

  const applyChanges = async () => {
    setStep("applying");
    setProgress(0);
    let count = 0;

    for (let i = 0; i < changes.length; i++) {
      const c = changes[i];
      try {
        await fetch(`/api/products/${c.product.id}`, {
          method: "PATCH",
          headers: csrfHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({ price: c.newPrice }),
        });
        count++;
      } catch {
        // continue on individual failures
      }
      setProgress(Math.round(((i + 1) / changes.length) * 100));
    }

    setUpdatedCount(count);
    setStep("done");
  };

  const reset = () => {
    setStep("config");
    setChanges([]);
    setProgress(0);
    setCsvPriceMap(null);
    setCsvFileName("");
    setPercentChange(0);
    if (fileRef.current) fileRef.current.value = "";
  };

  if (loadingProducts) {
    return (
      <div className="flex items-center gap-2 py-8 text-[var(--text-secondary)]">
        <Loader2 className="h-5 w-5 animate-spin" />
        Cargando productos...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <SectionTitle className="text-lg font-semibold text-[var(--text-primary)]">
            Actualizacion masiva de precios
          </SectionTitle>
          <p className="text-sm text-[var(--text-tertiary)]">
            Actualiza precios por porcentaje o desde un CSV
          </p>
        </div>
        {step !== "config" && (
          <button
            onClick={reset}
            className="flex items-center gap-1 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] dark:hover:text-[var(--text-tertiary)]"
          >
            <X className="h-4 w-4" />
            Reiniciar
          </button>
        )}
      </div>

      {step === "config" && (
        <div className="space-y-5">
          {/* Mode switcher */}
          <div className="flex gap-2 rounded-lg border border-[var(--rule-base)] p-1 w-fit">
            {(["percent", "csv"] as Mode[]).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={cn(
                  "px-4 py-2 rounded-md text-sm font-medium transition-colors",
                  mode === m
                    ? "bg-primary text-white"
                    : "text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]"
                )}
              >
                {m === "percent" ? "Por porcentaje" : "Desde CSV"}
              </button>
            ))}
          </div>

          {mode === "percent" && (
            <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-[var(--text-secondary)]">
                    Categoria
                  </label>
                  <select
                    value={selectedCategory}
                    onChange={(e) => setSelectedCategory(e.target.value)}
                    className="w-full rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    <option value="__all__">Todas las categorias ({products.length})</option>
                    {categories.map((c) => (
                      <option key={c} value={c}>
                        {c} ({products.filter((p) => p.category === c).length})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-medium text-[var(--text-secondary)]">
                    Accion
                  </label>
                  <select
                    value={direction}
                    onChange={(e) => setDirection(e.target.value as "increase" | "decrease")}
                    className="w-full rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    <option value="increase">Aumentar</option>
                    <option value="decrease">Reducir</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-medium text-[var(--text-secondary)]">
                    Porcentaje
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={percentChange}
                      onChange={(e) => setPercentChange(parseFloat(e.target.value) || 0)}
                      className="w-full rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 py-2 pr-8 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                    <Percent className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-tertiary)]" />
                  </div>
                </div>
              </div>

              <button
                onClick={buildPreview}
                disabled={percentChange <= 0}
                className={cn(
                  "px-5 py-2 rounded-lg text-sm font-medium transition-colors",
                  percentChange > 0
                    ? "bg-primary text-white hover:bg-[#235c43]"
                    : "bg-gray-100 text-[var(--text-tertiary)] cursor-not-allowed dark:bg-gray-800"
                )}
              >
                Ver cambios
              </button>
            </div>
          )}

          {mode === "csv" && (
            <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-6 space-y-4">
              <p className="text-sm text-[var(--text-secondary)]">
                El CSV debe tener dos columnas: <code className="bg-[var(--surface-sunken)] px-1 rounded">nombre_producto</code> y{" "}
                <code className="bg-[var(--surface-sunken)] px-1 rounded">precio_nuevo</code>
              </p>

              {!csvPriceMap ? (
                <div
                  onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={onDrop}
                  onClick={() => fileRef.current?.click()}
                  className={cn(
                    "flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed p-10 cursor-pointer transition-colors",
                    dragging
                      ? "border-primary bg-primary/5"
                      : "border-[var(--rule-base)] hover:border-primary"
                  )}
                >
                  <Upload className="h-8 w-8 text-[var(--text-tertiary)]" />
                  <p className="text-sm text-[var(--text-secondary)]">
                    Arrastra el CSV de precios o haz clic para seleccionar
                  </p>
                  <input ref={fileRef} type="file" accept=".csv,.txt" className="hidden" onChange={onFileChange} />
                </div>
              ) : (
                <div className="flex items-center justify-between rounded-lg bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] px-4 py-3">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-5 w-5 text-[var(--data-success-500)]" />
                    <span className="text-sm font-medium text-[var(--data-success-500)] dark:text-[var(--data-success-500)]">
                      {csvFileName} cargado ({csvPriceMap.size} precios)
                    </span>
                  </div>
                  <button onClick={() => { setCsvPriceMap(null); setCsvFileName(""); }} className="text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              )}

              <button
                onClick={buildPreview}
                disabled={!csvPriceMap}
                className={cn(
                  "px-5 py-2 rounded-lg text-sm font-medium transition-colors",
                  csvPriceMap
                    ? "bg-primary text-white hover:bg-[#235c43]"
                    : "bg-gray-100 text-[var(--text-tertiary)] cursor-not-allowed dark:bg-gray-800"
                )}
              >
                Ver cambios
              </button>
            </div>
          )}
        </div>
      )}

      {/* Preview */}
      {step === "preview" && (
        <div className="space-y-6">
          <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
            <AlertTriangle className="h-4 w-4 text-[var(--data-warning-500)]" />
            Se actualizaran <strong className="text-[var(--text-primary)]">{changes.length}</strong> productos. Revisa antes de confirmar.
          </div>

          <div className="overflow-x-auto rounded-xl border border-[var(--rule-base)] max-h-96">
            <table className="min-w-full text-sm">
              <thead className="bg-[var(--surface-sunken)] sticky top-0">
                <tr>
                  {["Producto", "Categoria", "Precio actual", "Precio nuevo", "Diferencia"].map((h) => (
                    <th key={h} className="px-4 py-2 text-left font-medium text-[var(--text-tertiary)]">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800 bg-[var(--surface-raised)]">
                {changes.map((c) => (
                  <tr key={c.product.id} className="hover:bg-[var(--surface-sunken)]/50">
                    <td className="px-4 py-2 font-medium text-[var(--text-primary)]">{c.product.name}</td>
                    <td className="px-4 py-2 text-[var(--text-secondary)]">{c.product.category}</td>
                    <td className="px-4 py-2 text-[var(--text-secondary)]">{formatCurrency(c.product.price)}</td>
                    <td className="px-4 py-2 font-medium text-primary dark:text-[var(--data-success-500)]">{formatCurrency(c.newPrice)}</td>
                    <td className={cn("px-4 py-2 font-medium", c.diff >= 0 ? "text-[var(--data-success-500)]" : "text-[var(--data-error-500)]")}>
                      {c.diff >= 0 ? "+" : ""}{formatCurrency(c.diff)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex gap-3">
            <button
              onClick={applyChanges}
              className="px-5 py-2 rounded-lg text-sm font-medium bg-primary text-white hover:bg-[#235c43] transition-colors"
            >
              Confirmar y aplicar {changes.length} cambios
            </button>
            <button
              onClick={() => setStep("config")}
              className="px-5 py-2 rounded-lg text-sm font-medium text-[var(--text-secondary)] border border-[var(--rule-base)] hover:bg-[var(--surface-sunken)]"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Applying */}
      {step === "applying" && (
        <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-8 flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="font-medium text-[var(--text-secondary)]">Actualizando precios...</p>
          <div className="w-full max-w-sm bg-[var(--surface-sunken)] rounded-full h-3">
            <div className="bg-primary h-3 rounded-full transition-all duration-[var(--dur-base)]" style={{ width: `${progress}%` }} />
          </div>
          <p className="text-sm text-[var(--text-secondary)]">{progress}% completado</p>
        </div>
      )}

      {/* Done */}
      {step === "done" && (
        <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-6 space-y-3">
          <div className="flex items-center gap-3">
            <CheckCircle className="h-6 w-6 text-[var(--data-success-500)]" />
            <div>
              <p className="font-semibold text-[var(--text-primary)]">Actualizacion completada</p>
              <p className="text-sm text-[var(--text-secondary)]">{updatedCount} precios actualizados correctamente</p>
            </div>
          </div>
          <button onClick={reset} className="px-5 py-2 rounded-lg text-sm font-medium bg-primary text-white hover:bg-[#235c43] transition-colors">
            Nueva actualizacion
          </button>
        </div>
      )}
    </div>
  );
}
