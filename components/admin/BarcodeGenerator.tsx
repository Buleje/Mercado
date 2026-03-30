"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import {
  Barcode, Printer, Plus, X, Search, Package,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Barcode rendering (Code128B — no external lib) ────────────────────────────
// Source: https://en.wikipedia.org/wiki/Code_128

const CODE128_START_B = 104;
const CODE128_STOP    = 106;

const CODE128_PATTERNS: number[] = [
  0b11011001100, 0b11001101100, 0b11001100110, 0b10010011000, 0b10010001100,
  0b10001001100, 0b10011001000, 0b10011000100, 0b10001100100, 0b11001001000,
  0b11001000100, 0b11000100100, 0b10110011100, 0b10011011100, 0b10011001110,
  0b10111001100, 0b10011101100, 0b10011100110, 0b11001110010, 0b11001011100,
  0b11001001110, 0b11011100100, 0b11001110100, 0b11101101110, 0b11101001100,
  0b11100101100, 0b11100100110, 0b11101100100, 0b11100110100, 0b11100110010,
  0b11011011000, 0b11011000110, 0b11000110110, 0b10100011000, 0b10001011000,
  0b10001000110, 0b10110001000, 0b10001101000, 0b10001100010, 0b11010001000,
  0b11000101000, 0b11000100010, 0b10110111000, 0b10110001110, 0b10001101110,
  0b10111011000, 0b10111000110, 0b10001110110, 0b11101110110, 0b11010001110,
  0b11000101110, 0b11011101000, 0b11011100010, 0b11011101110, 0b11101011000,
  0b11101000110, 0b11100010110, 0b11101101000, 0b11101100010, 0b11100011010,
  0b11101111010, 0b11001000010, 0b11110001010, 0b10100110000, 0b10100001100,
  0b10010110000, 0b10010000110, 0b10000101100, 0b10000100110, 0b10110010000,
  0b10110000100, 0b10011010000, 0b10011000010, 0b10000110100, 0b10000110010,
  0b11000010010, 0b11001010000, 0b11110111010, 0b11000010100, 0b10001111010,
  0b10100111100, 0b10010111100, 0b10010011110, 0b10111100100, 0b10011110100,
  0b10011110010, 0b11110100100, 0b11110010100, 0b11110010010, 0b11011011110,
  0b11011110110, 0b11110110110, 0b10101111000, 0b10100011110, 0b10001011110,
  0b10111101000, 0b10111100010, 0b11110101000, 0b11110100010, 0b10111011110,
  0b10111101110, 0b11101011110, 0b11110101110,
  // stop
  0b11000111010, 0b11010111000, 0b1100011101011,
];

function encodeCode128B(text: string): boolean[] {
  const bars: boolean[] = [];

  function pushPattern(code: number, bits: number) {
    for (let i = bits - 1; i >= 0; i--) {
      bars.push(((code >> i) & 1) === 1);
    }
  }

  // Start B
  pushPattern(CODE128_PATTERNS[CODE128_START_B], 11);

  let checksum = CODE128_START_B;
  for (let i = 0; i < text.length; i++) {
    const charCode = text.charCodeAt(i) - 32; // Code128B offset
    checksum += charCode * (i + 1);
    pushPattern(CODE128_PATTERNS[charCode], 11);
  }

  // Check symbol
  pushPattern(CODE128_PATTERNS[checksum % 103], 11);

  // Stop
  pushPattern(CODE128_PATTERNS[CODE128_STOP], 13);

  return bars;
}

function drawBarcode(canvas: HTMLCanvasElement, code: string, label: string, price?: number) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const bars       = encodeCode128B(code);
  const barWidth   = 2;
  const barHeight  = 60;
  const paddingX   = 10;
  const paddingTop = 8;
  const labelH     = 32;
  const priceH     = price != null ? 18 : 0;

  canvas.width  = bars.length * barWidth + paddingX * 2;
  canvas.height = paddingTop + barHeight + labelH + priceH;

  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Bars
  bars.forEach((on, i) => {
    if (on) {
      ctx.fillStyle = "#000";
      ctx.fillRect(paddingX + i * barWidth, paddingTop, barWidth, barHeight);
    }
  });

  // Product name
  ctx.fillStyle = "#111";
  ctx.font = "bold 9px sans-serif";
  ctx.textAlign = "center";
  const maxW = canvas.width - paddingX * 2;
  let displayName = label;
  while (ctx.measureText(displayName).width > maxW && displayName.length > 4) {
    displayName = displayName.slice(0, -1);
  }
  if (displayName !== label) displayName += "…";
  ctx.fillText(displayName, canvas.width / 2, paddingTop + barHeight + 12);

  // Code
  ctx.font = "8px monospace";
  ctx.fillStyle = "#444";
  ctx.fillText(code, canvas.width / 2, paddingTop + barHeight + 24);

  // Price
  if (price != null) {
    ctx.font = "bold 10px sans-serif";
    ctx.fillStyle = "#1a1a1a";
    ctx.fillText(
      `S/ ${price.toLocaleString("es-PE", { minimumFractionDigits: 2 })}`,
      canvas.width / 2,
      paddingTop + barHeight + 38,
    );
  }
}

// ── Types ─────────────────────────────────────────────────────────────────────

type ProductItem = {
  id: number;
  name: string;
  barcode?: string | null;
  price?: number;
};

type LabelItem = ProductItem & { customCode?: string };

// ── Single label preview ──────────────────────────────────────────────────────

function LabelPreview({ item }: { item: LabelItem }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const code = item.customCode || item.barcode || String(item.id).padStart(8, "0");

  useEffect(() => {
    if (canvasRef.current) {
      drawBarcode(canvasRef.current, code, item.name, item.price);
    }
  }, [code, item.name, item.price]);

  return (
    <div className="bg-white border border-gray-200 dark:border-card-border rounded-xl p-2 flex flex-col items-center gap-1">
      <canvas ref={canvasRef} className="max-w-full" style={{ imageRendering: "pixelated" }} />
      <p className="text-[10px] text-gray-400 truncate max-w-full">{item.name}</p>
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

interface BarcodeGeneratorProps {
  /** Si se pasa, carga directamente con ese producto preseleccionado */
  product?: ProductItem;
}

export default function BarcodeGenerator({ product: initialProduct }: BarcodeGeneratorProps) {
  const [manualCode, setManualCode] = useState(initialProduct?.barcode ?? "");
  const [manualName, setManualName] = useState(initialProduct?.name ?? "");
  const [manualPrice, setManualPrice] = useState(initialProduct?.price != null ? String(initialProduct.price) : "");
  const [batch, setBatch] = useState<LabelItem[]>(initialProduct ? [initialProduct] : []);

  // Product search
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<ProductItem[]>([]);
  const [searching, setSearching] = useState(false);

  const printRef = useRef<HTMLDivElement>(null);

  // ── Search products ──────────────────────────────────────────────────────

  const searchProducts = useCallback(async (q: string) => {
    if (q.trim().length < 2) { setSearchResults([]); return; }
    setSearching(true);
    try {
      const res = await fetch(`/api/products?search=${encodeURIComponent(q)}&limit=10`);
      if (res.ok) {
        const data: ProductItem[] = await res.json();
        setSearchResults(data);
      }
    } finally {
      setSearching(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => searchProducts(searchQuery), 300);
    return () => clearTimeout(t);
  }, [searchQuery, searchProducts]);

  // ── Batch actions ────────────────────────────────────────────────────────

  function addToBatch(item: LabelItem) {
    setBatch(prev => prev.some(b => b.id === item.id) ? prev : [...prev, item]);
    setSearchQuery("");
    setSearchResults([]);
  }

  function addManual() {
    if (!manualCode.trim()) return;
    const pseudoId = Date.now();
    addToBatch({
      id: pseudoId,
      name: manualName || manualCode,
      barcode: manualCode,
      price: manualPrice ? parseFloat(manualPrice) : undefined,
      customCode: manualCode,
    });
    setManualCode("");
    setManualName("");
    setManualPrice("");
  }

  function removeFromBatch(id: number) {
    setBatch(prev => prev.filter(b => b.id !== id));
  }

  // ── Print ────────────────────────────────────────────────────────────────

  function handlePrint() {
    window.print();
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xl font-extrabold text-gray-900 dark:text-foreground flex items-center gap-2">
          <Barcode className="h-6 w-6 text-primary" />
          Generador de Códigos de Barra
        </h2>
        {batch.length > 0 && (
          <button
            onClick={handlePrint}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-primary hover:bg-primary/90 text-white text-sm font-bold transition-colors"
          >
            <Printer className="h-4 w-4" />
            Imprimir {batch.length} etiqueta{batch.length !== 1 ? "s" : ""}
          </button>
        )}
      </div>

      {/* Input manual */}
      <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl p-4 space-y-3">
        <p className="text-xs font-bold text-gray-500 dark:text-muted uppercase">Ingresar código manualmente</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <input
            value={manualCode}
            onChange={e => setManualCode(e.target.value)}
            placeholder="Código (EAN-13 o interno)"
            className="text-sm border border-gray-200 dark:border-card-border rounded-xl px-3 py-2 bg-white dark:bg-surface focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
          <input
            value={manualName}
            onChange={e => setManualName(e.target.value)}
            placeholder="Nombre del producto"
            className="text-sm border border-gray-200 dark:border-card-border rounded-xl px-3 py-2 bg-white dark:bg-surface focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
          <div className="flex gap-2">
            <input
              value={manualPrice}
              onChange={e => setManualPrice(e.target.value)}
              placeholder="Precio (S/)"
              type="number"
              min={0}
              step={0.01}
              className="flex-1 text-sm border border-gray-200 dark:border-card-border rounded-xl px-3 py-2 bg-white dark:bg-surface focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            <button
              onClick={addManual}
              disabled={!manualCode.trim()}
              className="px-3 py-2 rounded-xl bg-primary/10 hover:bg-primary/20 text-primary font-bold text-sm disabled:opacity-40 transition-colors"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Búsqueda de productos */}
      <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl p-4 space-y-3">
        <p className="text-xs font-bold text-gray-500 dark:text-muted uppercase">Buscar producto del catálogo</p>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Nombre del producto…"
            className="w-full pl-9 py-2 text-sm border border-gray-200 dark:border-card-border rounded-xl bg-white dark:bg-surface focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
          {searching && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          )}
        </div>
        {searchResults.length > 0 && (
          <div className="border border-gray-200 dark:border-card-border rounded-xl overflow-hidden divide-y divide-gray-50 dark:divide-card-border max-h-48 overflow-y-auto">
            {searchResults.map(p => (
              <button
                key={p.id}
                onClick={() => addToBatch(p)}
                className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-gray-50 dark:hover:bg-surface transition-colors"
              >
                <Package className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                <span className="text-sm font-semibold text-gray-800 dark:text-foreground flex-1 truncate">{p.name}</span>
                {p.barcode && (
                  <span className="text-[10px] text-gray-400 font-mono shrink-0">{p.barcode}</span>
                )}
                <Plus className="h-3.5 w-3.5 text-primary shrink-0" />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Batch preview */}
      {batch.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold text-gray-700 dark:text-foreground">
              {batch.length} etiqueta{batch.length !== 1 ? "s" : ""} para imprimir
            </p>
            <button
              onClick={() => setBatch([])}
              className="text-xs text-gray-400 hover:text-red-500 transition-colors"
            >
              Limpiar todo
            </button>
          </div>

          {/* Print area — visible en pantalla y en impresión */}
          <div
            ref={printRef}
            className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 print:grid-cols-4 print:gap-2"
          >
            {batch.map(item => (
              <div key={item.id} className="relative group">
                <LabelPreview item={item} />
                <button
                  onClick={() => removeFromBatch(item.id)}
                  className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-red-500 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity print:hidden"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {batch.length === 0 && (
        <div className="text-center py-10 text-gray-400 dark:text-muted">
          <Barcode className={cn("h-10 w-10 mx-auto mb-2 opacity-20")} />
          <p className="text-sm">Agrega productos o ingresa un código para generar etiquetas</p>
        </div>
      )}

      {/* Print styles */}
      <style>{`
        @media print {
          body > *:not(#__next) { display: none !important; }
          #__next > *:not([data-print-area]) { display: none !important; }
          .print\\:hidden { display: none !important; }
        }
      `}</style>
    </div>
  );
}
