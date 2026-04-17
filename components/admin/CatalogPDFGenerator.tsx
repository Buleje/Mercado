"use client";

import { useState, useEffect } from "react";
import { Download, MessageCircle, Loader2, Eye, Package } from "lucide-react";
import * as Sentry from "@sentry/nextjs";
import { cn } from "@/lib/utils";

// ── Types ───────────────────────────────────────────────────────────────────

type Product = {
  id: number;
  name: string;
  price: number;
  category?: string;
  active?: boolean;
  stock?: number;
};

// ── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (n: number) =>
  `S/ ${n.toLocaleString("es-PE", { minimumFractionDigits: 2 })}`;

// ── Component ────────────────────────────────────────────────────────────────

export default function CatalogPDFGenerator() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>("todas");
  const [categories, setCategories] = useState<string[]>([]);
  const [showPreview, setShowPreview] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(true);
    fetch("/api/products?limit=500&active=true")
      .then((r) => r.json())
      .then((data) => {
        const list: Product[] = Array.isArray(data)
          ? data
          : (data.products ?? []);
        setProducts(list);
        const cats = [
          ...new Set(list.map((p) => p.category ?? "Sin categoria").filter(Boolean)),
        ].sort();
        setCategories(cats);
      })
      .catch(() => setError("No se pudieron cargar los productos."))
      .finally(() => setLoading(false));
  }, []);

  const filtered =
    selectedCategory === "todas"
      ? products
      : products.filter((p) => (p.category ?? "Sin categoria") === selectedCategory);

  const handleGeneratePDF = async () => {
    if (filtered.length === 0) return;
    setGenerating(true);
    try {
      // Dynamic import to avoid SSR issues
      const jspdfModule = await import("jspdf");
      const jsPDF = jspdfModule.default;
      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

      const pageW = 210;
      const margin = 14;
      let y = margin;

      // ── Cover ──
      doc.setFillColor(45, 106, 79); // #00B4A6
      doc.rect(0, 0, pageW, 45, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(22);
      doc.setFont("helvetica", "bold");
      doc.text("Buleje", pageW / 2, 20, { align: "center" });
      doc.setFontSize(11);
      doc.setFont("helvetica", "normal");
      doc.text("Catalogo de Productos — Pucallpa, Peru", pageW / 2, 30, {
        align: "center",
      });
      doc.setFontSize(9);
      doc.text(
        `Generado el ${new Date().toLocaleDateString("es-PE")}`,
        pageW / 2,
        38,
        { align: "center" }
      );

      y = 55;

      // ── Category label ──
      if (selectedCategory !== "todas") {
        doc.setTextColor(45, 106, 79);
        doc.setFontSize(13);
        doc.setFont("helvetica", "bold");
        doc.text(`Categoria: ${selectedCategory}`, margin, y);
        y += 7;
      }

      // ── Table header ──
      doc.setFillColor(244, 162, 97); // #f97316
      doc.rect(margin, y, pageW - margin * 2, 8, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");
      doc.text("Producto", margin + 2, y + 5.5);
      doc.text("Precio", 140, y + 5.5);
      doc.text("Disponible", 170, y + 5.5);
      y += 10;

      // ── Rows ──
      doc.setFont("helvetica", "normal");
      filtered.forEach((p, idx) => {
        if (y > 270) {
          doc.addPage();
          y = margin;
        }
        const rowColor = idx % 2 === 0 ? [249, 250, 251] : [255, 255, 255];
        doc.setFillColor(rowColor[0], rowColor[1], rowColor[2]);
        doc.rect(margin, y - 1, pageW - margin * 2, 7, "F");
        doc.setTextColor(30, 30, 30);
        doc.setFontSize(8.5);
        doc.text(p.name.slice(0, 55), margin + 2, y + 4);
        doc.text(fmt(p.price), 140, y + 4);
        const avail = p.stock !== undefined ? (p.stock > 0 ? "Si" : "No") : "Si";
        doc.setTextColor(avail === "Si" ? 45 : 220, avail === "Si" ? 106 : 38, avail === "Si" ? 79 : 38);
        doc.text(avail, 170, y + 4);
        y += 7;
      });

      // ── Footer ──
      const totalPages = doc.getNumberOfPages();
      for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        doc.setFillColor(45, 106, 79);
        doc.rect(0, 285, pageW, 12, "F");
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(7.5);
        doc.setFont("helvetica", "normal");
        doc.text(
          "Buleje | Jr. Ucayali, Pucallpa | WhatsApp: +51 900 000 000 | Lun-Dom 7am-10pm",
          pageW / 2,
          292,
          { align: "center" }
        );
      }

      doc.save(
        `catalogo-buleje-${selectedCategory}-${Date.now()}.pdf`
      );
    } catch (err) {
      setError("Error al generar el PDF. Asegurate de tener jspdf instalado.");
      Sentry.captureException(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setGenerating(false);
    }
  };

  const waText = encodeURIComponent(
    `Hola! Quiero el catalogo de productos de Buleje.`
  );
  const waLink = `https://wa.me/51900000000?text=${waText}`;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-gray-900 dark:text-white">
          Catalogo PDF
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Genera un catalogo imprimible o para compartir con clientes
        </p>
      </div>

      {/* Controls */}
      <div className="rounded-xl border border-[var(--rule-base)] bg-white p-5 dark:border-[var(--rule-base)] dark:bg-gray-900">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Categoria
            </label>
            {loading ? (
              <div className="flex items-center gap-2 text-sm text-gray-400">
                <Loader2 className="h-4 w-4 animate-spin" />
                Cargando categorias...
              </div>
            ) : (
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="w-full rounded-lg border border-[var(--rule-base)] bg-gray-50 px-3 py-2 text-sm focus:border-[#00B4A6] focus:outline-none dark:border-[var(--rule-base)] dark:bg-gray-800 dark:text-white"
              >
                <option value="todas">Todas las categorias</option>
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="flex items-end gap-2">
            <button
              onClick={() => setShowPreview(!showPreview)}
              className="flex items-center gap-2 rounded-lg border border-[var(--rule-base)] px-4 py-2 text-sm text-gray-600 transition hover:bg-gray-50 dark:border-[var(--rule-base)] dark:text-gray-300 dark:hover:bg-gray-800"
            >
              <Eye className="h-4 w-4" />
              {showPreview ? "Ocultar" : "Vista previa"}
            </button>
          </div>
        </div>

        {error && (
          <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>
        )}

        {/* Stats */}
        <div className="mt-4 flex items-center gap-2 rounded-lg bg-gray-50 px-4 py-3 dark:bg-gray-800">
          <Package className="h-4 w-4 text-[#00B4A6]" />
          <span className="text-sm text-gray-700 dark:text-gray-300">
            <span className="font-semibold text-[#00B4A6]">
              {filtered.length}
            </span>{" "}
            productos en el catalogo
          </span>
        </div>
      </div>

      {/* Preview */}
      {showPreview && (
        <div className="rounded-xl border border-[var(--rule-base)] bg-white dark:border-[var(--rule-base)] dark:bg-gray-900">
          <div className="rounded-t-xl bg-[#00B4A6] p-4 text-center text-white">
            <p className="text-lg font-bold">Buleje</p>
            <p className="text-xs opacity-80">Catalogo de Productos — Pucallpa, Peru</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#f97316]/20">
                  <th className="px-4 py-2 text-left font-semibold text-gray-700 dark:text-gray-200">
                    Producto
                  </th>
                  <th className="px-4 py-2 text-left font-semibold text-gray-700 dark:text-gray-200">
                    Categoria
                  </th>
                  <th className="px-4 py-2 text-right font-semibold text-gray-700 dark:text-gray-200">
                    Precio
                  </th>
                  <th className="px-4 py-2 text-center font-semibold text-gray-700 dark:text-gray-200">
                    Disponible
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.slice(0, 20).map((p, i) => (
                  <tr
                    key={p.id}
                    className={cn(
                      "border-b border-[var(--rule-base)]",
                      i % 2 === 0
                        ? "bg-white dark:bg-gray-900"
                        : "bg-gray-50 dark:bg-gray-800/50"
                    )}
                  >
                    <td className="px-4 py-2 text-gray-800 dark:text-gray-200">
                      {p.name}
                    </td>
                    <td className="px-4 py-2 text-gray-500 dark:text-gray-400">
                      {p.category ?? "—"}
                    </td>
                    <td className="px-4 py-2 text-right font-medium text-[#00B4A6]">
                      {fmt(p.price)}
                    </td>
                    <td className="px-4 py-2 text-center">
                      <span
                        className={cn(
                          "inline-block rounded-full px-2 py-0.5 text-xs font-medium",
                          (p.stock ?? 1) > 0
                            ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                            : "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400"
                        )}
                      >
                        {(p.stock ?? 1) > 0 ? "Si" : "No"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filtered.length > 20 && (
              <p className="p-3 text-center text-xs text-gray-400">
                Mostrando 20 de {filtered.length} productos. El PDF incluira
                todos.
              </p>
            )}
          </div>
          <div className="rounded-b-xl bg-[#00B4A6] p-3 text-center text-xs text-white opacity-80">
            Buleje | Jr. Ucayali, Pucallpa | WhatsApp: +51 900 000
            000 | Lun-Dom 7am-10pm
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <button
          onClick={handleGeneratePDF}
          disabled={generating || filtered.length === 0}
          className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-[#00B4A6] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#009690] disabled:opacity-50"
        >
          {generating ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Download className="h-4 w-4" />
          )}
          {generating ? "Generando PDF..." : "Descargar PDF"}
        </button>
        <a
          href={waLink}
          target="_blank"
          rel="noopener noreferrer"
          className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-emerald-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-600"
        >
          <MessageCircle className="h-4 w-4" />
          Compartir por WhatsApp
        </a>
      </div>
    </div>
  );
}
