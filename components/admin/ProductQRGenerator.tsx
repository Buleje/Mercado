"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { useState, useEffect, useRef, useCallback } from "react";
import { Search, Printer, Download } from "lucide-react";
import { cn } from "@/lib/utils";

// ── Types ───────────────────────────────────────────────────────────────────

type Product = {
  id: number;
  name: string;
  price: number;
  slug?: string;
  category?: string;
};

type QRSize = "small" | "medium" | "large";

const SIZE_PX: Record<QRSize, number> = {
  small: 128,
  medium: 200,
  large: 300,
};

// ── Minimal QR renderer via qrcode (dynamic import) ─────────────────────────

async function renderQRToCanvas(
  canvas: HTMLCanvasElement,
  text: string,
  sizePx: number
): Promise<void> {
  try {
    // Try dynamic import of qrcode if installed
    const mod = await import(/* webpackIgnore: true */ "qrcode" as string);
    const QRCode = mod.default ?? mod;
    if (QRCode?.toCanvas) {
      await QRCode.toCanvas(canvas, text, {
        width: sizePx,
        margin: 2,
        color: { dark: "#1a3d2e", light: "#ffffff" },
      });
      return;
    }
    throw new Error("fallback");
  } catch {
    // Fallback: draw URL text as matrix representation
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    canvas.width = sizePx;
    canvas.height = sizePx;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, sizePx, sizePx);
    ctx.fillStyle = "#1a3d2e";
    ctx.font = `bold ${Math.floor(sizePx / 18)}px monospace`;
    ctx.textAlign = "center";
    const lines = [
      "QR CODE",
      "(instala qrcode)",
      text.slice(0, 30),
      text.slice(30, 60),
    ];
    lines.forEach((line, i) => {
      ctx.fillText(line, sizePx / 2, sizePx / 3 + i * (sizePx / 10));
    });
  }
}

// ── Component ────────────────────────────────────────────────────────────────

export default function ProductQRGenerator() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Product | null>(null);
  const [size, setSize] = useState<QRSize>("medium");
  const [rendering, setRendering] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    setLoading(true);
    fetch("/api/products?limit=500&active=true")
      .then((r) => r.json())
      .then((data) => {
        const list: Product[] = Array.isArray(data)
          ? data
          : (data.products ?? []);
        setProducts(list);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const generateQR = useCallback(async () => {
    if (!selected || !canvasRef.current) return;
    const slug = selected.slug ?? selected.id.toString();
    const url = `https://buleje.pe/tienda/${slug}`;
    setRendering(true);
    await renderQRToCanvas(canvasRef.current, url, SIZE_PX[size]);
    setRendering(false);
  }, [selected, size]);

  useEffect(() => {
    if (selected) {
      generateQR();
    }
  }, [selected, size, generateQR]);

  const handlePrint = () => {
    if (!canvasRef.current || !selected) return;
    const dataUrl = canvasRef.current.toDataURL("image/png");
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(`
      <html>
        <head>
          <title>QR — ${selected.name}</title>
          <style>
            body { margin: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; font-family: sans-serif; }
            img { display: block; }
            .label { margin-top: 12px; font-size: 14px; font-weight: bold; color: #1a3d2e; }
            .price { font-size: 16px; color: #0f766e; }
            @media print { body { -webkit-print-color-adjust: exact; } }
          </style>
        </head>
        <body>
          <img src="${dataUrl}" width="${SIZE_PX[size]}" height="${SIZE_PX[size]}" />
          <div class="label">${selected.name}</div>
          <div class="price">S/ ${selected.price.toFixed(2)}</div>
          <script>window.onload = () => { window.print(); window.close(); }<\/script>
        </body>
      </html>
    `);
    win.document.close();
  };

  const handleDownload = () => {
    if (!canvasRef.current || !selected) return;
    const link = document.createElement("a");
    link.download = `qr-${selected.slug ?? selected.id}.png`;
    link.href = canvasRef.current.toDataURL("image/png");
    link.click();
  };

  const filtered = products.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-gray-900 dark:text-white">
          Generador de Codigos QR
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Imprime codigos QR para pegar en los estantes de cada producto
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Left: Controls */}
        <div className="space-y-4 rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-900">
          {/* Search */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Buscar producto
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Escribe el nombre del producto..."
                className="w-full rounded-lg border border-gray-200 bg-gray-50 py-2 pl-9 pr-3 text-sm focus:border-[#0f766e] focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white"
              />
            </div>
            {search && (
              <div className="mt-1 max-h-48 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-900">
                {loading ? (
                  <p className="p-3 text-sm text-gray-500">Cargando...</p>
                ) : filtered.length === 0 ? (
                  <p className="p-3 text-sm text-gray-500">Sin resultados</p>
                ) : (
                  filtered.slice(0, 8).map((p) => (
                    <button
                      key={p.id}
                      onClick={() => {
                        setSelected(p);
                        setSearch(p.name);
                      }}
                      className="flex w-full items-center justify-between px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-800"
                    >
                      <span className="text-gray-800 dark:text-gray-200">
                        {p.name}
                      </span>
                      <span className="font-medium text-[#0f766e]">
                        S/ {p.price?.toFixed(2)}
                      </span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Size selector */}
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Tamano del QR
            </label>
            <div className="flex gap-2">
              {(["small", "medium", "large"] as QRSize[]).map((s) => (
                <button
                  key={s}
                  onClick={() => setSize(s)}
                  className={cn(
                    "flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition",
                    size === s
                      ? "border-[#0f766e] bg-[#0f766e] text-white"
                      : "border-gray-200 bg-gray-50 text-gray-700 hover:border-[#0f766e]/50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
                  )}
                >
                  {s === "small"
                    ? "Pequeno"
                    : s === "medium"
                    ? "Mediano"
                    : "Grande"}
                  <span className="ml-1 text-xs opacity-60">
                    ({SIZE_PX[s]}px)
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* URL preview */}
          {selected && (
            <div className="rounded-lg bg-gray-50 p-3 dark:bg-gray-800">
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400">
                URL del QR
              </p>
              <p className="mt-1 break-all font-mono text-xs text-[#0f766e]">
                https://buleje.pe/tienda/
                {selected.slug ?? selected.id}
              </p>
            </div>
          )}
        </div>

        {/* Right: QR Preview */}
        <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-900">
          {selected ? (
            <>
              <div
                className={cn(
                  "rounded-xl border-2 border-[#0f766e] bg-white p-4",
                  rendering && "opacity-50"
                )}
              >
                <canvas ref={canvasRef} className="block" />
                <p className="mt-2 text-center text-sm font-bold text-[#1a3d2e]">
                  {selected.name}
                </p>
                <p className="text-center text-base font-bold text-[#0f766e]">
                  S/ {selected.price.toFixed(2)}
                </p>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={handlePrint}
                  disabled={rendering}
                  className="flex items-center gap-2 rounded-lg bg-[#0f766e] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#0d5f58] disabled:opacity-50"
                >
                  <Printer className="h-4 w-4" />
                  Imprimir
                </button>
                <button
                  onClick={handleDownload}
                  disabled={rendering}
                  className="flex items-center gap-2 rounded-lg border border-[#0f766e] px-4 py-2 text-sm font-semibold text-[#0f766e] transition hover:bg-[#0f766e]/5 disabled:opacity-50 dark:text-emerald-400"
                >
                  <Download className="h-4 w-4" />
                  Descargar
                </button>
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center gap-3 text-center">
              <div className="flex h-32 w-32 items-center justify-center rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-700">
                <span className="text-4xl text-gray-200 dark:text-gray-700">
                  QR
                </span>
              </div>
              <p className="text-sm text-gray-400">
                Selecciona un producto para generar su QR
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
