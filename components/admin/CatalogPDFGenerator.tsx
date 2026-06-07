"use client";

import { SectionTitle } from "@buleje/design-system";
import { useState, useEffect } from "react";
import { Download, MessageCircle, Loader2, Eye, Package } from "@buleje/design-system/icons";
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
      doc.setFillColor(45, 106, 79); // #00A0A0
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
        <SectionTitle className="text-xl font-bold text-[var(--text-primary)]">
          Catalogo PDF
        </SectionTitle>
        <p className="text-sm text-[var(--text-tertiary)]">
          Genera un catalogo imprimible o para compartir con clientes
        </p>
      </div>

      {/* Controls */}
      <div className="rounded-xl border border-[var(--rule-base)] bg-white p-5 dark:border-[var(--rule-base)] dark:bg-gray-900">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-[var(--text-secondary)]">
              Categoria
            </label>
            {loading ? (
              <div className="flex items-center gap-2 text-sm text-[var(--text-tertiary)]">
                <Loader2 className="h-4 w-4 animate-spin" />
                Cargando categorias...
              </div>
            ) : (
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="w-full rounded-lg border border-[var(--rule-base)] bg-[var(--surface-alt)] px-3 py-2 text-sm focus:border-primary focus:outline-none dark:border-[var(--rule-base)] dark:bg-gray-800 dark:text-white"
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
              className="flex items-center gap-2 rounded-lg border border-[var(--rule-base)] px-4 py-2 text-sm text-[var(--text-secondary)] transition hover:bg-[var(--surface-alt)] dark:border-[var(--rule-base)] dark:text-[var(--text-tertiary)] dark:hover:bg-gray-800"
            >
              <Eye className="h-4 w-4" />
              {showPreview ? "Ocultar" : "Vista previa"}
            </button>
          </div>
        </div>

        {error && (
          <p className="mt-3 text-sm text-[var(--data-error)] dark:text-[var(--data-error)]">{error}</p>
        )}

        {/* Stats */}
        <div className="mt-4 flex items-center gap-2 rounded-lg bg-[var(--surface-alt)] px-4 py-3 dark:bg-gray-800">
          <Package className="h-4 w-4 text-primary" />
          <span className="text-sm text-[var(--text-secondary)]">
            <span className="font-semibold text-primary">
              {filtered.length}
            </span>{" "}
            productos en el catalogo
          </span>
        </div>
      </div>

      {/* Preview */}
      {showPreview && (
        <div className="rounded-xl border border-[var(--rule-base)] bg-white dark:border-[var(--rule-base)] dark:bg-gray-900">
          <div className="rounded-t-xl bg-primary p-4 text-center text-white">
            <p className="text-lg font-bold">Buleje</p>
            <p className="text-xs opacity-80">Catalogo de Productos — Pucallpa, Peru</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[var(--data-warning)]/20">
                  <th className="px-4 py-2 text-left font-semibold text-[var(--text-secondary)]">
                    Producto
                  </th>
                  <th className="px-4 py-2 text-left font-semibold text-[var(--text-secondary)]">
                    Categoria
                  </th>
                  <th className="px-4 py-2 text-right font-semibold text-[var(--text-secondary)]">
                    Precio
                  </th>
                  <th className="px-4 py-2 text-center font-semibold text-[var(--text-secondary)]">
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
                        ? "bg-[var(--surface-raised)]"
                        : "bg-[var(--surface-sunken)]/50"
                    )}
                  >
                    <td className="px-4 py-2 text-[var(--text-primary)]">
                      {p.name}
                    </td>
                    <td className="px-4 py-2 text-[var(--text-tertiary)]">
                      {p.category ?? "—"}
                    </td>
                    <td className="px-4 py-2 text-right font-medium text-primary">
                      {fmt(p.price)}
                    </td>
                    <td className="px-4 py-2 text-center">
                      <span
                        className={cn(
                          "inline-block rounded-full px-2 py-0.5 text-xs font-medium",
                          (p.stock ?? 1) > 0
                            ? "bg-[var(--accent-soft)] text-[var(--data-success)] dark:bg-[var(--accent-muted)] dark:text-[var(--data-success)]"
                            : "bg-[var(--data-error-100)] text-[var(--data-error)] dark:bg-[var(--data-error)]/30 dark:text-[var(--data-error)]"
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
              <p className="p-3 text-center text-xs text-[var(--text-tertiary)]">
                Mostrando 20 de {filtered.length} productos. El PDF incluira
                todos.
              </p>
            )}
          </div>
          <div className="rounded-b-xl bg-primary p-3 text-center text-xs text-white opacity-80">
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
          className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-primary px-5 py-3 text-sm font-semibold text-white transition hover:bg-primary-dark disabled:opacity-50"
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
          className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-[var(--accent-soft)] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[var(--accent-soft)]"
        >
          <MessageCircle className="h-4 w-4" />
          Compartir por WhatsApp
        </a>
      </div>
    </div>
  );
}
