"use client";
import { CardTitle, SectionTitle } from "@buleje/design-system";
import { useState, useMemo, useEffect } from "react";
import {
  Printer, Search, CheckSquare, Square, Tag,
  Package, LayoutGrid, List,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import type { Product } from "@/types/erp";

// ─── Types ────────────────────────────────────────────────────────────────────


type LabelSize = "pequena" | "mediana" | "grande";

interface LabelConfig {
  size: LabelSize;
  showBarcode: boolean;
  showCategory: boolean;
  showUnit: boolean;
  showStock: boolean;
  copies: number;
}

// ─── Seed Products ────────────────────────────────────────────────────────────

const SEED: Product[] = [
  { id: 1,  name: "Arroz Extra Superior 5kg", category: "Abarrotes", price: 22.50, unit: "bolsa", barcode: "7501055300044", stock: 48, active: true },
  { id: 2,  name: "Aceite Primor 1L",          category: "Abarrotes", price: 7.90,  unit: "botella", barcode: "7501030421017", stock: 36, active: true },
  { id: 3,  name: "Azúcar Rubia 1kg",          category: "Abarrotes", price: 3.80,  unit: "bolsa",   barcode: "7500478000029", stock: 52, active: true },
  { id: 4,  name: "Fideos Lavaggi 500g",       category: "Abarrotes", price: 2.50,  unit: "bolsa",   barcode: "7500320001118", stock: 24, active: true },
  { id: 5,  name: "Leche Gloria Entera 400g",  category: "Lácteos",   price: 3.50,  unit: "lata",    barcode: "7750101310019", stock: 60, active: true },
  { id: 6,  name: "Huevos Blancos x12",        category: "Frescos",   price: 9.00,  unit: "cartón",  barcode: undefined,           stock: 15, active: true },
  { id: 7,  name: "Pan de Molde Bimbo 500g",   category: "Panadería", price: 5.90,  unit: "bolsa",   barcode: "7501020005555", stock: 10, active: true },
  { id: 8,  name: "Gaseosa Inca Kola 1.5L",   category: "Bebidas",   price: 5.50,  unit: "botella", barcode: "7501055910027", stock: 30, active: true },
  { id: 9,  name: "Agua San Luis 625ml",       category: "Bebidas",   price: 1.00,  unit: "botella", barcode: "7501030400968", stock: 96, active: true },
  { id: 10, name: "Detergente Ariel 500g",     category: "Limpieza",  price: 8.50,  unit: "caja",    barcode: "7500435125551", stock: 18, active: true },
  { id: 11, name: "Jabón Marsella 250g",       category: "Limpieza",  price: 2.20,  unit: "pastilla", barcode: "7501035702014", stock: 40, active: true },
  { id: 12, name: "Sal Marina 1kg",            category: "Abarrotes", price: 1.60,  unit: "bolsa",   barcode: "7501023605051", stock: 55, active: true },
  { id: 13, name: "Atún Florida 170g",         category: "Conservas", price: 3.30,  unit: "lata",    barcode: "7500456213890", stock: 28, active: true },
  { id: 14, name: "Mayonesa Alacena 100g",     category: "Condimentos", price: 2.80, unit: "sachet", barcode: "7500456009087", stock: 20, active: true },
  { id: 15, name: "Café Altomayo 200g",        category: "Bebidas",   price: 12.50, unit: "frasco",  barcode: "7750101500053", stock: 12, active: true },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const SIZE_LABELS: Record<LabelSize, string> = {
  pequena: "Pequeña (5×3 cm)",
  mediana: "Mediana (7×4 cm)",
  grande: "Grande (9×5 cm)",
};

const CATEGORIES = ["Todas", ...Array.from(new Set(SEED.map(p => p.category))).sort()];

// ─── Print Logic ──────────────────────────────────────────────────────────────

function buildPrintHtml(products: Product[], config: LabelConfig): string {
  const sizeMap: Record<LabelSize, { w: string; h: string; font: string; priceFt: string }> = {
    pequena: { w: "5cm",  h: "3cm",  font: "7px",  priceFt: "11px" },
    mediana: { w: "7cm",  h: "4cm",  font: "8px",  priceFt: "14px" },
    grande:  { w: "9cm",  h: "5cm",  font: "9px",  priceFt: "18px" },
  };
  const s = sizeMap[config.size];

  const labels: string[] = [];
  products.forEach(p => {
    for (let i = 0; i < config.copies; i++) {
      labels.push(`
        <div style="width:${s.w};height:${s.h};border:1px dashed #888;border-radius:3px;padding:4px;display:inline-flex;flex-direction:column;justify-content:space-between;vertical-align:top;margin:3px;box-sizing:border-box;background:#fff;overflow:hidden;">
          ${config.showCategory ? `<div style="font-size:${s.font};color:#666;text-transform:uppercase;letter-spacing:0.5px;line-height:1;">${p.category}</div>` : ""}
          <div style="font-size:${s.font};font-weight:bold;color:#111;line-height:1.2;flex:1;display:flex;align-items:center;word-break:break-word;">${p.name}</div>
          <div style="display:flex;justify-content:space-between;align-items:flex-end;">
            <div style="font-size:${s.priceFt};font-weight:900;color:#111;">S/ ${p.price.toFixed(2)}</div>
            ${config.showUnit ? `<div style="font-size:${s.font};color:#555;">/${p.unit}</div>` : ""}
            ${config.showStock && p.stock != null ? `<div style="font-size:${s.font};color:#888;">Stock: ${p.stock}</div>` : ""}
          </div>
          ${config.showBarcode && p.barcode ? `<div style="font-size:${s.font};color:#888;font-family:monospace;letter-spacing:0.5px;line-height:1;margin-top:2px;">${p.barcode}</div>` : ""}
        </div>
      `);
    }
  });

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>Etiquetas de Precio</title>
      <style>
        @page { size: A4; margin: 10mm; }
        body { margin: 0; padding: 0; font-family: Arial, sans-serif; background: #fff; }
        .container { display: flex; flex-wrap: wrap; align-content: flex-start; }
      </style>
    </head>
    <body>
      <div class="container">
        ${labels.join("")}
      </div>
    </body>
    </html>
  `;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function EtiquetasTab() {
  const [products, setProducts] = useState<Product[]>(SEED);
  // Product.id is `number | string` (Prisma CUID strings, seeded numerics).
  const [selected, setSelected] = useState<Set<number | string>>(new Set());
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("Todas");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [loading, setLoading] = useState(false);
  const [config, setConfig] = useState<LabelConfig>({
    size: "mediana", showBarcode: true, showCategory: true, showUnit: true, showStock: false, copies: 1,
  });

  useEffect(() => {
    async function loadProducts() {
      setLoading(true);
      try {
        const res = await fetch("/api/products?limit=200&active=true");
        if (res.ok) {
          const data = await res.json();
          const items = (data.products ?? data) as Product[];
          if (items.length > 0) setProducts(items);
        }
      } catch {
        // fallback to seed
      } finally {
        setLoading(false);
      }
    }
    loadProducts();
  }, []);

  const filtered = useMemo(() =>
    products.filter(p => {
      const matchSearch = p.name.toLowerCase().includes(search.toLowerCase());
      const matchCat = category === "Todas" || p.category === category;
      return matchSearch && matchCat && p.active;
    }),
    [products, search, category]
  );

  function toggleSelect(id: number | string) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (selected.size === filtered.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map(p => p.id)));
    }
  }

  function handlePrint() {
    const selectedProducts = products.filter(p => selected.has(p.id));
    if (selectedProducts.length === 0) return;
    const html = buildPrintHtml(selectedProducts, config);
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); win.close(); }, 500);
  }

  const allFiltered = filtered.length > 0 && selected.size === filtered.length;

  return (
    <div className="space-y-3 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div>
          <SectionTitle className="text-xl sm:text-2xl font-extrabold text-[var(--text-primary)] dark:text-foreground flex flex-wrap items-center gap-2">
            <Tag className="h-6 w-6 text-primary" /> Impresión de Etiquetas
          </SectionTitle>
          <p className="text-sm text-[var(--text-secondary)] dark:text-muted mt-0.5">Selecciona productos y genera etiquetas de precio para imprimir</p>
        </div>
        <button
          onClick={handlePrint}
          disabled={selected.size === 0}
          className="px-5 py-2.5 bg-primary text-white rounded-lg text-sm font-bold hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed flex flex-wrap items-center gap-2"
        >
          <Printer className="h-4 w-4" />
          Imprimir {selected.size > 0 ? `(${selected.size})` : "etiquetas"}
        </button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
        {/* Left: Config panel */}
        <div className="xl:col-span-1 space-y-4">
          <div className="bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-xl p-3 sm:p-5 space-y-4">
            <CardTitle className="font-extrabold text-[var(--text-primary)] dark:text-foreground flex flex-wrap items-center gap-2 text-sm">
              <Tag className="h-4 w-4 text-primary" /> Configuración
            </CardTitle>

            {/* Size */}
            <div>
              <label className="block text-xs font-bold text-[var(--text-primary)] dark:text-foreground mb-2">Tamaño de etiqueta</label>
              <div className="space-y-2">
                {(["pequena", "mediana", "grande"] as LabelSize[]).map(s => (
                  <button key={s} onClick={() => setConfig(c => ({ ...c, size: s }))} className={cn("w-full px-3 py-2 rounded-lg text-xs font-bold border-2 text-left transition-all", config.size === s ? "border-primary bg-primary/10 text-primary" : "border-[var(--rule-base)] dark:border-card-border text-[var(--text-secondary)] dark:text-muted hover:border-gray-400")}>
                    {SIZE_LABELS[s]}
                  </button>
                ))}
              </div>
            </div>

            {/* Copies */}
            <div>
              <label className="block text-xs font-bold text-[var(--text-primary)] dark:text-foreground mb-2">Copias por producto</label>
              <div className="flex flex-wrap items-center gap-3">
                <button onClick={() => setConfig(c => ({ ...c, copies: Math.max(1, c.copies - 1) }))} className="w-8 h-8 rounded-lg border border-[var(--rule-base)] dark:border-card-border text-[var(--text-primary)] dark:text-foreground font-bold flex items-center justify-center hover:bg-gray-50 dark:hover:bg-accent">−</button>
                <span className="font-extrabold text-[var(--text-primary)] dark:text-foreground w-6 text-center">{config.copies}</span>
                <button onClick={() => setConfig(c => ({ ...c, copies: Math.min(10, c.copies + 1) }))} className="w-8 h-8 rounded-lg border border-[var(--rule-base)] dark:border-card-border text-[var(--text-primary)] dark:text-foreground font-bold flex items-center justify-center hover:bg-gray-50 dark:hover:bg-accent">+</button>
              </div>
            </div>

            {/* Toggles */}
            <div>
              <label className="block text-xs font-bold text-[var(--text-primary)] dark:text-foreground mb-2">Mostrar en etiqueta</label>
              <div className="space-y-2">
                {([
                  { key: "showBarcode", label: "Código de barras" },
                  { key: "showCategory", label: "Categoría" },
                  { key: "showUnit", label: "Unidad de medida" },
                  { key: "showStock", label: "Stock actual" },
                ] as { key: keyof LabelConfig; label: string }[]).map(opt => (
                  <label key={opt.key} className="flex flex-wrap items-center gap-2.5 cursor-pointer">
                    <button onClick={() => setConfig(c => ({ ...c, [opt.key]: !c[opt.key] }))} className={cn("w-9 h-5 rounded-full transition-colors flex items-center", config[opt.key] ? "bg-primary" : "bg-gray-300 dark:bg-gray-600")}>
                      <span className={cn("block w-4 h-4 rounded-full bg-white shadow transition-transform mx-0.5", config[opt.key] ? "translate-x-4" : "translate-x-0")} />
                    </button>
                    <span className="text-xs text-[var(--text-primary)] dark:text-foreground">{opt.label}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>

          {/* Preview */}
          {selected.size > 0 && (
            <div className="bg-gray-50 dark:bg-surface border border-[var(--rule-base)] dark:border-card-border rounded-xl p-4">
              <p className="text-xs font-bold text-[var(--text-secondary)] dark:text-muted mb-2">Vista previa (#1)</p>
              {(() => {
                const p = products.find(pr => pr.id === Array.from(selected)[0]);
                if (!p) return null;
                const sizeClass: Record<LabelSize, string> = { pequena: "w-24 h-16", mediana: "w-36 h-20", grande: "w-48 h-28" };
                return (
                  <div className={cn("border-2 border-dashed border-gray-400 dark:border-gray-600 rounded-lg p-2 bg-white dark:bg-card flex flex-col justify-between", sizeClass[config.size])}>
                    {config.showCategory && <span className="text-[length:var(--ts-2xs)] text-[var(--text-secondary)] uppercase">{p.category}</span>}
                    <span className="text-[length:var(--ts-2xs)] font-bold text-[var(--text-primary)] dark:text-foreground leading-tight">{p.name}</span>
                    <div className="flex items-end justify-between">
                      <span className="text-sm font-extrabold text-[var(--text-primary)] dark:text-foreground">S/ {p.price.toFixed(2)}</span>
                      {config.showUnit && <span className="text-[length:var(--ts-2xs)] text-[var(--text-secondary)]">/{p.unit}</span>}
                    </div>
                    {config.showBarcode && p.barcode && <span className="text-[length:var(--ts-2xs)] font-mono text-[var(--text-secondary)] truncate">{p.barcode}</span>}
                  </div>
                );
              })()}
            </div>
          )}
        </div>

        {/* Right: Product selector */}
        <div className="xl:col-span-3 space-y-4">
          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-tertiary)]" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar producto..." className="w-full pl-9 pr-4 py-2.5 border border-[var(--rule-base)] dark:border-card-border rounded-lg text-sm bg-white dark:bg-surface text-[var(--text-primary)] dark:text-foreground" />
            </div>
            <select value={category} onChange={e => setCategory(e.target.value)} className="border border-[var(--rule-base)] dark:border-card-border rounded-lg px-3 py-2.5 text-sm bg-white dark:bg-surface text-[var(--text-primary)] dark:text-foreground">
              {CATEGORIES.map(c => <option key={c}>{c}</option>)}
            </select>
            <div className="flex flex-wrap gap-1 border border-[var(--rule-base)] dark:border-card-border rounded-xl p-1">
              <button onClick={() => setViewMode("grid")} className={cn("p-1.5 rounded-lg", viewMode === "grid" ? "bg-primary text-white" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] dark:hover:text-foreground")}><LayoutGrid className="h-4 w-4" /></button>
              <button onClick={() => setViewMode("list")} className={cn("p-1.5 rounded-lg", viewMode === "list" ? "bg-primary text-white" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] dark:hover:text-foreground")}><List className="h-4 w-4" /></button>
            </div>
          </div>

          {/* Select all bar */}
          <div className="flex items-center justify-between bg-gray-50 dark:bg-surface rounded-xl px-2 sm:px-4 py-1.5 sm:py-2.5">
            <label className="flex flex-wrap items-center gap-2.5 cursor-pointer">
              <button onClick={toggleAll} className="text-[var(--text-secondary)] dark:text-foreground">
                {allFiltered ? <CheckSquare className="h-4 w-4 text-primary" /> : <Square className="h-4 w-4" />}
              </button>
              <span className="text-sm font-bold text-[var(--text-primary)] dark:text-foreground">
                {allFiltered ? "Deseleccionar todos" : "Seleccionar todos"} <span className="text-[var(--text-tertiary)]">({filtered.length})</span>
              </span>
            </label>
            {selected.size > 0 && (
              <span className="text-xs font-bold text-primary">
                {selected.size} producto{selected.size !== 1 ? "s" : ""} × {config.copies} cop. = {selected.size * config.copies} etiquetas
              </span>
            )}
          </div>

          {/* Loading */}
          {loading && (
            <div className="flex justify-center py-8">
              <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {/* Grid view */}
          {!loading && viewMode === "grid" && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {filtered.map(p => {
                const sel = selected.has(p.id);
                return (
                  <button key={p.id} onClick={() => toggleSelect(p.id)} className={cn("text-left p-3 rounded-lg border-2 transition-all", sel ? "border-primary bg-primary/5 dark:bg-primary/10" : "border-[var(--rule-base)] dark:border-card-border bg-white dark:bg-card hover:border-gray-400 dark:hover:border-gray-500")}>
                    <div className="flex flex-wrap items-start justify-between gap-1 mb-2">
                      <span className="text-[length:var(--ts-2xs)] text-[var(--text-secondary)] dark:text-muted uppercase font-bold">{p.category}</span>
                      {sel ? <CheckSquare className="h-4 w-4 text-primary shrink-0" /> : <Square className="h-4 w-4 text-[var(--text-tertiary)] dark:text-[var(--text-secondary)] shrink-0" />}
                    </div>
                    <p className="text-xs font-bold text-[var(--text-primary)] dark:text-foreground leading-tight mb-1 line-clamp-2">{p.name}</p>
                    <p className="text-base font-extrabold text-primary">S/ {p.price.toFixed(2)}</p>
                    <p className="text-[length:var(--ts-2xs)] text-[var(--text-secondary)] dark:text-muted">{p.unit} {p.stock != null ? `· Stock: ${p.stock}` : ""}</p>
                    {p.barcode && <p className="text-[length:var(--ts-2xs)] font-mono text-[var(--text-tertiary)] truncate mt-0.5">{p.barcode}</p>}
                  </button>
                );
              })}
            </div>
          )}

          {/* List view */}
          {!loading && viewMode === "list" && (
            <div className="bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-xl overflow-hidden divide-y divide-gray-100 dark:divide-card-border">
              {filtered.map(p => {
                const sel = selected.has(p.id);
                return (
                  <div key={p.id} onClick={() => toggleSelect(p.id)} className={cn("flex items-center gap-3 px-2 sm:px-4 py-2 sm:py-3 cursor-pointer transition-colors", sel ? "bg-primary/5 dark:bg-primary/10" : "hover:bg-gray-50 dark:hover:bg-accent/50")}>
                    <button className="shrink-0">
                      {sel ? <CheckSquare className="h-4 w-4 text-primary" /> : <Square className="h-4 w-4 text-[var(--text-tertiary)] dark:text-[var(--text-secondary)]" />}
                    </button>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-[var(--text-primary)] dark:text-foreground truncate">{p.name}</p>
                      <p className="text-xs text-[var(--text-secondary)] dark:text-muted">{p.category} · {p.unit}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-extrabold text-primary text-sm">S/ {p.price.toFixed(2)}</p>
                      {p.barcode && <p className="text-[length:var(--ts-2xs)] font-mono text-[var(--text-tertiary)]">{p.barcode}</p>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {!loading && filtered.length === 0 && (
            <div className="text-center py-16 text-[var(--text-tertiary)] dark:text-muted">
              <Package className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p className="font-bold">No hay productos con este filtro</p>
            </div>
          )}

          {/* Print tip */}
          {selected.size > 0 && (
            <div className="bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] border border-[var(--data-success-500)]/30 dark:border-[var(--data-success-500)]/30 rounded-xl p-4 flex flex-wrap items-start gap-3">
              <Printer className="h-4 w-4 text-[var(--data-success-500)] dark:text-[var(--data-success-500)] shrink-0 mt-0.5" />
              <p className="text-xs text-[var(--data-success-500)] dark:text-[var(--data-success-500)]">
                Se generarán <strong>{selected.size * config.copies} etiquetas</strong> en formato A4 listas para imprimir. Usa papel adhesivo A4 para mejores resultados.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
