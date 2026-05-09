"use client";

import { CardTitle } from "@buleje/design-system";
import { useState, useMemo, useCallback, useEffect } from "react";
import {
  Tag,
  Search,
  Printer,
  CheckSquare,
  Square,
  ChevronDown,
  X,
  LayoutGrid,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

type LabelFormat = "pequeno" | "mediano" | "grande";

interface ProductItem {
  id: number;
  name: string;
  price: number;
  barcode: string | null;
  category: string;
  unit: string;
}

interface SelectedProduct extends ProductItem {
  salePrice?: number;
  copies: number;
}

const FORMAT_CONFIG: Record<LabelFormat, { label: string; widthPx: number; heightPx: number }> = {
  pequeno: { label: "Pequeño (3×2 cm)", widthPx: 113, heightPx: 75 },
  mediano: { label: "Mediano (5×3 cm)", widthPx: 189, heightPx: 113 },
  grande: { label: "Grande (7×4 cm)", widthPx: 264, heightPx: 151 },
};

const SEED_PRODUCTS: ProductItem[] = [
  { id: 1, name: "Arroz Extra Superior 5kg", price: 22.5, barcode: "7501055300044", category: "Abarrotes", unit: "bolsa" },
  { id: 2, name: "Aceite Primor 1L", price: 7.9, barcode: "7501030421017", category: "Abarrotes", unit: "botella" },
  { id: 3, name: "Azúcar Rubia 1kg", price: 3.8, barcode: "7500478000029", category: "Abarrotes", unit: "bolsa" },
  { id: 4, name: "Fideos Lavaggi 500g", price: 2.5, barcode: "7500320001118", category: "Abarrotes", unit: "bolsa" },
  { id: 5, name: "Leche Gloria Entera 400g", price: 3.5, barcode: "7750101310019", category: "Lácteos", unit: "lata" },
  { id: 6, name: "Huevos Blancos x12", price: 9.0, barcode: null, category: "Frescos", unit: "cartón" },
  { id: 7, name: "Pan de Molde Bimbo 500g", price: 5.9, barcode: "7501020005555", category: "Panadería", unit: "bolsa" },
  { id: 8, name: "Gaseosa Inca Kola 1.5L", price: 5.5, barcode: "7501055910027", category: "Bebidas", unit: "botella" },
  { id: 9, name: "Agua San Luis 625ml", price: 1.0, barcode: "7501030400968", category: "Bebidas", unit: "botella" },
  { id: 10, name: "Detergente Ariel 500g", price: 8.5, barcode: "7500435125551", category: "Limpieza", unit: "caja" },
];

const fmt = (n: number) =>
  `S/ ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// ─── Label preview component ──────────────────────────────────────────────────

function LabelCard({
  product,
  format,
}: {
  product: SelectedProduct;
  format: LabelFormat;
}) {
  const cfg = FORMAT_CONFIG[format];
  const isBig = format === "grande";
  const isMed = format === "mediano";

  return (
    <div
      className="flex flex-col items-center justify-between border border-gray-800 bg-white dark:bg-[var(--color-card)] p-1 font-mono text-[var(--text-primary)]"
      style={{ width: cfg.widthPx, height: cfg.heightPx }}
    >
      <p
        className="w-full text-center font-bold leading-tight"
        style={{ fontSize: isBig ? 9 : isMed ? 7 : 6 }}
      >
        {product.name}
      </p>

      {product.salePrice ? (
        <div className="flex flex-col items-center">
          <p
            className="text-center text-[var(--text-tertiary)] line-through"
            style={{ fontSize: isBig ? 8 : 6 }}
          >
            {fmt(product.price)}
          </p>
          <p
            className="text-center font-extrabold text-[var(--data-error-500)]"
            style={{ fontSize: isBig ? 14 : isMed ? 11 : 9 }}
          >
            {fmt(product.salePrice)}
          </p>
        </div>
      ) : (
        <p
          className="text-center font-extrabold"
          style={{ fontSize: isBig ? 14 : isMed ? 11 : 9 }}
        >
          {fmt(product.price)}
        </p>
      )}

      {product.barcode && (
        <p
          className="text-center tracking-widest text-[var(--text-secondary)]"
          style={{ fontSize: 5 }}
        >
          {product.barcode}
        </p>
      )}
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function PriceTagGenerator() {
  const [products, setProducts] = useState<ProductItem[]>(SEED_PRODUCTS);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Map<number, SelectedProduct>>(new Map());
  const [format, setFormat] = useState<LabelFormat>("mediano");
  const [showSaleInputFor, setShowSaleInputFor] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetch("/api/products?limit=200")
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data && Array.isArray(data)) {
          setProducts(
            data.map((p: Record<string, unknown>) => ({
              id: p.id as number,
              name: p.name as string,
              price: p.price as number,
              barcode: (p.barcode ?? null) as string | null,
              category: (p.category ?? "") as string,
              unit: (p.unit ?? "und") as string,
            }))
          );
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q) ||
        (p.barcode ?? "").includes(q)
    );
  }, [products, search]);

  const toggleSelect = useCallback((product: ProductItem) => {
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(product.id)) {
        next.delete(product.id);
      } else {
        next.set(product.id, { ...product, copies: 1 });
      }
      return next;
    });
  }, []);

  const updateCopies = useCallback((productId: number, copies: number) => {
    setSelected((prev) => {
      const next = new Map(prev);
      const item = next.get(productId);
      if (item) next.set(productId, { ...item, copies: Math.max(1, copies) });
      return next;
    });
  }, []);

  const updateSalePrice = useCallback((productId: number, salePrice: number | undefined) => {
    setSelected((prev) => {
      const next = new Map(prev);
      const item = next.get(productId);
      if (item) next.set(productId, { ...item, salePrice });
      return next;
    });
  }, []);

  const selectedList = useMemo(() => Array.from(selected.values()), [selected]);

  const totalLabels = useMemo(
    () => selectedList.reduce((s, p) => s + p.copies, 0),
    [selectedList]
  );

  const handlePrint = useCallback(() => {
    if (selectedList.length === 0) return;

    const cfg = FORMAT_CONFIG[format];
    const labelsHtml = selectedList
      .flatMap((p) =>
        Array.from({ length: p.copies }, (_, i) => {
          const saleBlock = p.salePrice
            ? `<p style="font-size:7px;text-decoration:line-through;color:#999;margin:0;">${fmt(p.price)}</p>
               <p style="font-size:${cfg.widthPx > 150 ? 14 : 11}px;font-weight:900;color:#c00;margin:0;">${fmt(p.salePrice)}</p>`
            : `<p style="font-size:${cfg.widthPx > 150 ? 14 : 11}px;font-weight:900;margin:0;">${fmt(p.price)}</p>`;

          return `<div key="${p.id}-${i}" style="
            width:${cfg.widthPx}px;height:${cfg.heightPx}px;
            border:1px solid #222;
            display:flex;flex-direction:column;
            align-items:center;justify-content:space-between;
            padding:4px;font-family:monospace;color:#111;background:#fff;
            page-break-inside:avoid;
          ">
            <p style="font-size:${cfg.widthPx > 150 ? 9 : 6}px;font-weight:700;text-align:center;margin:0;line-height:1.2;">${p.name}</p>
            <div style="text-align:center;">${saleBlock}</div>
            ${p.barcode ? `<p style="font-size:5px;letter-spacing:2px;color:#666;margin:0;">${p.barcode}</p>` : ""}
          </div>`;
        })
      )
      .join("");

    const win = window.open("", "_blank", "width=900,height=700");
    if (!win) return;

    win.document.write(`<!DOCTYPE html><html><head>
      <title>Etiquetas de precio - Buleje</title>
      <style>
        @media print {
          @page { margin: 10mm; }
          body { margin: 0; }
        }
        body { background: #fff; }
        .grid { display:flex;flex-wrap:wrap;gap:4px;padding:8px; }
      </style>
    </head><body>
      <div class="grid">${labelsHtml}</div>
      <script>window.onload=()=>{window.print();window.onafterprint=()=>window.close();}<\/script>
    </body></html>`);
    win.document.close();
  }, [selectedList, format]);

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
      {/* Left: product selector */}
      <div className="flex flex-col gap-4 lg:w-1/2">
        <div className="rounded-xl border border-[var(--rule-base)] bg-white dark:border-[var(--rule-base)] dark:bg-gray-900">
          <div className="border-b border-[var(--rule-soft)] px-5 py-3 dark:border-[var(--rule-base)]">
            <div className="flex items-center gap-2">
              <Tag className="h-4 w-4 text-primary" />
              <CardTitle className="text-sm font-semibold text-[var(--text-primary)]">
                Seleccionar productos
              </CardTitle>
            </div>
          </div>

          <div className="p-4">
            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-tertiary)]" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar producto..."
                className={cn(
                  "w-full rounded-lg border border-[var(--rule-base)] bg-gray-50 py-2 pl-9 pr-3 text-sm",
                  "text-[var(--text-primary)] placeholder-gray-400 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20",
                  "dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500"
                )}
              />
            </div>

            <div className="flex max-h-72 flex-col gap-1 overflow-y-auto">
              {loading && (
                <p className="py-4 text-center text-xs text-[var(--text-tertiary)]">Cargando productos...</p>
              )}
              {!loading && filtered.length === 0 && (
                <p className="py-4 text-center text-xs text-[var(--text-tertiary)]">Sin resultados</p>
              )}
              {filtered.map((p) => {
                const isSelected = selected.has(p.id);
                return (
                  <button
                    key={p.id}
                    onClick={() => toggleSelect(p)}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition",
                      isSelected
                        ? "bg-primary/10 text-primary dark:bg-primary/20 dark:text-[var(--data-success-500)]"
                        : "text-[var(--text-primary)] hover:bg-gray-50 dark:text-[var(--text-tertiary)] dark:hover:bg-gray-800"
                    )}
                  >
                    {isSelected ? (
                      <CheckSquare className="h-4 w-4 shrink-0" />
                    ) : (
                      <Square className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]" />
                    )}
                    <span className="flex-1 truncate">{p.name}</span>
                    <span className="shrink-0 text-xs text-[var(--text-secondary)]">{fmt(p.price)}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Format selector */}
        <div className="rounded-xl border border-[var(--rule-base)] bg-white p-4 dark:border-[var(--rule-base)] dark:bg-gray-900">
          <p className="mb-2 text-xs font-semibold text-[var(--text-tertiary)]">
            Formato de etiqueta
          </p>
          <div className="flex gap-2">
            {(Object.keys(FORMAT_CONFIG) as LabelFormat[]).map((f) => (
              <button
                key={f}
                onClick={() => setFormat(f)}
                className={cn(
                  "flex-1 rounded-lg border py-2 text-xs font-medium transition",
                  format === f
                    ? "border-primary bg-primary text-white"
                    : "border-[var(--rule-base)] text-[var(--text-secondary)] hover:border-primary/40 dark:border-gray-600 dark:text-[var(--text-tertiary)]"
                )}
              >
                {FORMAT_CONFIG[f].label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Right: preview + selected config */}
      <div className="flex flex-col gap-4 lg:w-1/2">
        {selectedList.length === 0 ? (
          <div className="flex h-40 flex-col items-center justify-center rounded-xl border-2 border-dashed border-[var(--rule-base)] bg-gray-50 dark:border-[var(--rule-base)] dark:bg-gray-800/30">
            <LayoutGrid className="mb-2 h-8 w-8 text-[var(--text-tertiary)] dark:text-[var(--text-secondary)]" />
            <p className="text-sm text-[var(--text-tertiary)]">Selecciona productos para ver las etiquetas</p>
          </div>
        ) : (
          <>
            {/* Selected products config */}
            <div className="rounded-xl border border-[var(--rule-base)] bg-white dark:border-[var(--rule-base)] dark:bg-gray-900">
              <div className="border-b border-[var(--rule-soft)] px-5 py-3 dark:border-[var(--rule-base)]">
                <p className="text-sm font-semibold text-[var(--text-primary)]">
                  Configurar etiquetas ({selectedList.length} producto
                  {selectedList.length !== 1 ? "s" : ""} — {totalLabels} etiqueta
                  {totalLabels !== 1 ? "s" : ""})
                </p>
              </div>
              <div className="divide-y divide-gray-100 dark:divide-gray-700/50">
                {selectedList.map((p) => (
                  <div key={p.id} className="p-3">
                    <div className="flex items-center gap-2">
                      <p className="flex-1 truncate text-xs font-medium text-[var(--text-secondary)]">
                        {p.name}
                      </p>
                      <div className="flex items-center gap-1 text-xs text-[var(--text-secondary)]">
                        <span>Copias:</span>
                        <input
                          type="number"
                          min={1}
                          max={50}
                          value={p.copies}
                          onChange={(e) => updateCopies(p.id, Number(e.target.value))}
                          className="w-12 rounded border border-[var(--rule-base)] px-1 py-0.5 text-center text-xs dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                        />
                      </div>
                      <button
                        onClick={() =>
                          setShowSaleInputFor(showSaleInputFor === p.id ? null : p.id)
                        }
                        className="flex items-center gap-1 rounded-md border border-[var(--data-warning-500)]/50 px-2 py-0.5 text-xs text-[var(--data-warning-500)] hover:bg-[var(--data-warning-500)]/10"
                      >
                        Oferta
                        <ChevronDown className="h-3 w-3" />
                      </button>
                      <button
                        onClick={() => toggleSelect(p)}
                        className="text-[var(--text-tertiary)] hover:text-[var(--data-error-500)]"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                    {showSaleInputFor === p.id && (
                      <div className="mt-2 flex items-center gap-2 text-xs">
                        <span className="text-[var(--text-secondary)]">Precio oferta:</span>
                        <input
                          type="number"
                          min={0}
                          step={0.1}
                          placeholder={String(p.price)}
                          defaultValue={p.salePrice ?? ""}
                          onChange={(e) =>
                            updateSalePrice(
                              p.id,
                              e.target.value ? Number(e.target.value) : undefined
                            )
                          }
                          className="w-24 rounded border border-[var(--rule-base)] px-2 py-1 text-xs dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                        />
                        <span className="text-[var(--text-tertiary)]">
                          (Normal: {fmt(p.price)})
                        </span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Preview */}
            <div className="rounded-xl border border-[var(--rule-base)] bg-gray-50 p-4 dark:border-[var(--rule-base)] dark:bg-gray-800/50">
              <p className="mb-3 text-xs font-semibold text-[var(--text-tertiary)]">
                Vista previa
              </p>
              <div className="flex flex-wrap gap-2">
                {selectedList.slice(0, 6).map((p) => (
                  <LabelCard key={p.id} product={p} format={format} />
                ))}
                {selectedList.length > 6 && (
                  <div
                    className="flex items-center justify-center rounded border border-dashed border-[var(--rule-base)] bg-gray-100 text-xs text-[var(--text-tertiary)] dark:border-gray-600 dark:bg-gray-800"
                    style={{
                      width: FORMAT_CONFIG[format].widthPx,
                      height: FORMAT_CONFIG[format].heightPx,
                    }}
                  >
                    +{selectedList.length - 6} más
                  </div>
                )}
              </div>
            </div>

            <button
              onClick={handlePrint}
              className="flex items-center justify-center gap-2 rounded-lg bg-primary px-6 py-3 text-sm font-semibold text-white transition hover:bg-[#245a40]"
            >
              <Printer className="h-4 w-4" />
              Imprimir {totalLabels} etiqueta{totalLabels !== 1 ? "s" : ""}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
