"use client";
import { SectionTitle } from "@buleje/design-system";
import { Field } from "@/components/admin/shared/Field";

import { useState, useEffect, useRef, useCallback } from "react";
import Image from "next/image";
import { Search, Printer, Download, Copy, Check, QrCode } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

// ── Types ───────────────────────────────────────────────────────────────────

type Product = {
  id: number;
  name: string;
  price: number;
  slug?: string;
  category?: string;
  barcode?: string;
};

type QRSize = "small" | "medium" | "large";

const SIZE_PX: Record<QRSize, number> = {
  small: 128,
  medium: 200,
  large: 300,
};

// ── QR renderer via canvas (dynamic import o SVG fallback) ─────────────────

async function renderQRToCanvas(
  canvas: HTMLCanvasElement,
  text: string,
  sizePx: number
): Promise<void> {
  try {
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
    // Fallback: render via SVG element from API
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
      "generado en",
      "servidor",
      text.slice(0, 32),
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
  const [copied, setCopied] = useState(false);
  const [svgSrc, setSvgSrc] = useState<string | null>(null);
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
      .catch((err) => console.warn("[ProductQRGenerator] products fetch failed:", err))
      .finally(() => setLoading(false));
  }, []);

  const qrUrl = selected
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/tienda/${selected.slug ?? selected.id}`
    : "";

  // Carga SVG desde el endpoint del servidor (siempre disponible, sin canvas)
  const loadServerSVG = useCallback(async (productId: number) => {
    setRendering(true);
    try {
      const res = await fetch(`/api/products/${productId}/qr?format=svg`);
      if (!res.ok) throw new Error("Error cargando QR del servidor");
      const svgText = await res.text();
      const blob = new Blob([svgText], { type: "image/svg+xml" });
      const url = URL.createObjectURL(blob);
      setSvgSrc(url);
    } catch {
      setSvgSrc(null);
    } finally {
      setRendering(false);
    }
  }, []);

  const generateQR = useCallback(async () => {
    if (!selected || !canvasRef.current) return;
    const url = `${typeof window !== "undefined" ? window.location.origin : "https://buleje.pe"}/tienda/${selected.slug ?? selected.id}`;
    setRendering(true);
    await renderQRToCanvas(canvasRef.current, url, SIZE_PX[size]);
    setRendering(false);
  }, [selected, size]);

  useEffect(() => {
    if (selected) {
      setSvgSrc((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      generateQR();
      loadServerSVG(selected.id);
    }
  }, [selected, size, generateQR, loadServerSVG]);

  // Limpia object URL al desmontar
  useEffect(() => {
    return () => {
      if (svgSrc) URL.revokeObjectURL(svgSrc);
    };
  }, [svgSrc]);

  const handlePrint = () => {
    if (!selected) return;
    const imgSrc = svgSrc ?? canvasRef.current?.toDataURL("image/png");
    if (!imgSrc) return;
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(`
      <html>
        <head>
          <title>QR — ${selected.name}</title>
          <style>
            body { margin: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; font-family: Arial, sans-serif; }
            img { display: block; max-width: 300px; }
            .label { margin-top: 10px; font-size: 14px; font-weight: bold; color: #1a3d2e; text-align: center; }
            .price { font-size: 16px; font-weight: bold; color: var(--color-primary); text-align: center; }
            .barcode { font-size: 11px; color: #888; margin-top: 4px; text-align: center; }
            @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
          </style>
        </head>
        <body>
          <img src="${imgSrc}" width="${SIZE_PX[size]}" />
          <div class="label">${selected.name}</div>
          <div class="price">S/ ${Number(selected.price).toFixed(2)}</div>
          ${selected.barcode ? `<div class="barcode">${selected.barcode}</div>` : ""}
          <script>window.onload = () => { window.print(); window.close(); }<\/script>
        </body>
      </html>
    `);
    win.document.close();
  };

  const handleDownload = () => {
    if (!selected) return;
    if (svgSrc) {
      const link = document.createElement("a");
      link.download = `qr-${selected.slug ?? selected.id}.svg`;
      link.href = svgSrc;
      link.click();
      return;
    }
    if (!canvasRef.current) return;
    const link = document.createElement("a");
    link.download = `qr-${selected.slug ?? selected.id}.png`;
    link.href = canvasRef.current.toDataURL("image/png");
    link.click();
  };

  const handleCopyLink = async () => {
    if (!qrUrl) return;
    try {
      await navigator.clipboard.writeText(qrUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback para navegadores sin permisos de clipboard
      const input = document.createElement("input");
      input.value = qrUrl;
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      document.body.removeChild(input);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const filtered = products.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <SectionTitle className="text-xl font-bold text-[var(--text-primary)]">
          Generador de Codigos QR
        </SectionTitle>
        <p className="text-sm text-[var(--text-tertiary)]">
          Imprime codigos QR para pegar en los estantes de cada producto
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Left: Controls */}
        <div className="space-y-4 rounded-xl border border-[var(--rule-base)] bg-white p-5 dark:border-[var(--rule-base)] dark:bg-gray-900">
          {/* Search */}
          <Field label="Buscar producto" labelClassName="mb-1.5 block text-sm font-medium text-[var(--text-secondary)]">
            {(id) => (
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-tertiary)]" />
                <input
                  id={id}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Escribe el nombre del producto..."
                  className="w-full rounded-lg border border-[var(--rule-base)] bg-gray-50 py-2 pl-9 pr-3 text-sm focus:border-primary focus:outline-none dark:border-[var(--rule-base)] dark:bg-gray-800 dark:text-white"
                />
              </div>
            )}
          </Field>
          {search && (
            <div className="mt-1 max-h-48 overflow-y-auto rounded-lg border border-[var(--rule-base)] bg-white dark:border-[var(--rule-base)] dark:bg-gray-900">
              {loading ? (
                <p className="p-3 text-sm text-[var(--text-secondary)]">Cargando...</p>
              ) : filtered.length === 0 ? (
                <p className="p-3 text-sm text-[var(--text-secondary)]">Sin resultados</p>
              ) : (
                filtered.slice(0, 8).map((p) => (
                  <button
                    key={p.id}
                    onClick={() => {
                      setSelected(p);
                      setSearch(p.name);
                    }}
                    className="flex w-full items-center justify-between px-3 py-2 text-sm hover:bg-[var(--surface-sunken)]"
                  >
                    <span className="text-[var(--text-primary)]">{p.name}</span>
                    <span className="font-medium text-primary">S/ {p.price?.toFixed(2)}</span>
                  </button>
                ))
              )}
            </div>
          )}

          {/* Size selector */}
          <div>
            <span className="mb-2 block text-sm font-medium text-[var(--text-secondary)]">
              Tamano del QR
            </span>
            <div className="flex gap-2">
              {(["small", "medium", "large"] as QRSize[]).map((s) => (
                <button
                  key={s}
                  onClick={() => setSize(s)}
                  className={cn(
                    "flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition",
                    size === s
                      ? "border-primary bg-primary text-white"
                      : "border-[var(--rule-base)] bg-gray-50 text-[var(--text-primary)] hover:border-primary/50 dark:border-[var(--rule-base)] dark:bg-gray-800 dark:text-[var(--text-tertiary)]"
                  )}
                >
                  {s === "small" ? "Pequeno" : s === "medium" ? "Mediano" : "Grande"}
                  <span className="ml-1 text-xs opacity-60">({SIZE_PX[s]}px)</span>
                </button>
              ))}
            </div>
          </div>

          {/* Product info + URL preview */}
          {selected && (
            <div className="space-y-2">
              <div className="rounded-lg bg-gray-50 p-3 dark:bg-gray-800">
                <p className="text-xs font-medium text-[var(--text-tertiary)]">URL del QR</p>
                <p className="mt-1 break-all font-mono text-xs text-primary">{qrUrl}</p>
              </div>
              {selected.barcode && (
                <div className="rounded-lg bg-gray-50 p-3 dark:bg-gray-800">
                  <p className="text-xs font-medium text-[var(--text-tertiary)]">Codigo de barras</p>
                  <p className="mt-0.5 font-mono text-xs text-[var(--text-secondary)]">{selected.barcode}</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right: QR Preview */}
        <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-[var(--rule-base)] bg-white p-5 dark:border-[var(--rule-base)] dark:bg-gray-900">
          {selected ? (
            <>
              <div className={cn("rounded-xl border-2 border-primary bg-white dark:bg-[var(--color-card)] p-4", rendering && "opacity-50")}>
                {/* SVG del servidor (preferido) */}
                {svgSrc ? (
                  <Image
                    src={svgSrc}
                    alt={`QR de ${selected.name}`}
                    width={SIZE_PX[size]}
                    height={SIZE_PX[size] + 50}
                    className="block"
                    unoptimized
                  />
                ) : (
                  <>
                    <canvas ref={canvasRef} className="block" />
                    <p className="mt-2 text-center text-sm font-bold text-[#1a3d2e]">{selected.name}</p>
                    <p className="text-center text-base font-bold text-primary">S/ {Number(selected.price).toFixed(2)}</p>
                  </>
                )}
              </div>

              {/* Action buttons */}
              <div className="flex flex-wrap justify-center gap-2">
                <button
                  onClick={handlePrint}
                  disabled={rendering}
                  className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white transition hover:bg-primary-dark disabled:opacity-50"
                >
                  <Printer className="h-4 w-4" />
                  Imprimir
                </button>
                <button
                  onClick={handleDownload}
                  disabled={rendering}
                  className="flex items-center gap-2 rounded-lg border border-primary px-4 py-2 text-sm font-semibold text-primary transition hover:bg-primary/5 disabled:opacity-50 dark:text-[var(--data-success-500)]"
                >
                  <Download className="h-4 w-4" />
                  Descargar
                </button>
                <button
                  onClick={handleCopyLink}
                  disabled={rendering}
                  className={cn(
                    "flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-semibold transition disabled:opacity-50",
                    copied
                      ? "border-[var(--data-success-500)]/30 bg-[var(--data-success-500)]/12 text-[var(--data-success-700)] dark:text-[var(--data-success-500)] dark:bg-primary/15 dark:text-[var(--data-success-500)]"
                      : "border-[var(--rule-base)] text-[var(--text-secondary)] hover:border-gray-400 dark:border-[var(--rule-base)] dark:text-[var(--text-tertiary)]"
                  )}
                >
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  {copied ? "Copiado" : "Copiar link"}
                </button>
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center gap-3 text-center">
              <div className="flex h-32 w-32 items-center justify-center rounded-xl border-2 border-dashed border-[var(--rule-base)]">
                <QrCode className="h-12 w-12 text-[var(--text-tertiary)] dark:text-[var(--text-primary)]" />
              </div>
              <p className="text-sm text-[var(--text-tertiary)]">Selecciona un producto para generar su QR</p>
            </div>
          )}
        </div>
      </div>

      {/* Hidden canvas (fallback) */}
      {!svgSrc && <canvas ref={canvasRef} className="hidden" />}
    </div>
  );
}
