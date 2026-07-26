"use client";

import { useState } from "react";
import { Sparkles, Loader2, Check, RefreshCw, AlertTriangle } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { csrfHeaders } from "@/lib/csrf-client";

// ── Types ─────────────────────────────────────────────────────────────────────

interface AIProductDescriptionGeneratorProps {
  productName: string;
  category?: string;
  onGenerate: (desc: string) => void;
}

// ── Fallback local generator ───────────────────────────────────────────────────

function buildFallbackDescription(name: string, category?: string): string {
  const cat = category?.toLowerCase() ?? "";

  const freshnessMap: Record<string, string> = {
    frutas: "fresco y de temporada",
    verduras: "fresco y de primera calidad",
    lácteos: "de origen controlado",
    carnes: "de corte selecto",
    abarrotes: "de marca reconocida",
    bebidas: "refrescante y de calidad",
    limpieza: "de fórmula efectiva",
    panadería: "horneado artesanalmente",
  };

  const benefitMap: Record<string, string> = {
    frutas: "Aporta vitaminas y antioxidantes naturales.",
    verduras: "Rico en fibra y nutrientes esenciales.",
    lácteos: "Fuente de calcio y proteínas.",
    carnes: "Alto contenido proteico para una dieta equilibrada.",
    abarrotes: "Ingrediente indispensable en la cocina diaria.",
    bebidas: "Ideal para hidratarte en cualquier momento del día.",
    limpieza: "Mantiene tu hogar limpio e higienizado.",
    panadería: "Perfecto para el desayuno o la merienda.",
  };

  const freshness = freshnessMap[cat] ?? "de excelente calidad";
  const benefit =
    benefitMap[cat] ?? "Producto seleccionado especialmente para tu hogar.";

  return (
    `${name} ${freshness}, disponible en Buleje. ` +
    `${benefit} ` +
    `Delivery disponible. Consulta precio y stock con tu bodeguero de confianza.`
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function AIProductDescriptionGenerator({
  productName,
  category,
  onGenerate,
}: AIProductDescriptionGeneratorProps) {
  const [preview, setPreview] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");
  const [used, setUsed] = useState(false);

  const handleGenerate = async () => {
    if (!productName.trim()) return;

    setLoading(true);
    setError("");
    setUsed(false);

    const prompt =
      `Genera una descripción de producto breve (2-3 oraciones) para una bodega peruana. ` +
      `Producto: "${productName}"${category ? `, categoría: "${category}"` : ""}. ` +
      `Tono: amigable, informativo. Sin emojis. Sin precios. Incluye que hay delivery a domicilio.`;

    try {
      const res = await fetch("/api/ai-assistant", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ message: prompt }),
      });

      if (!res.ok) throw new Error("API no disponible");

      const data = await res.json();
      const text: string =
        data?.reply ?? data?.message ?? data?.content ?? "";

      if (!text.trim()) throw new Error("Respuesta vacía");

      setPreview(text.trim());
    } catch {
      const fallback = buildFallbackDescription(productName, category);
      setPreview(fallback);
      setError("La IA no respondió — se generó una descripción automática.");
    } finally {
      setLoading(false);
    }
  };

  const handleUse = () => {
    if (!preview) return;
    onGenerate(preview);
    setUsed(true);
  };

  return (
    <div className="rounded-lg border border-border bg-[var(--surface-raised)] dark:bg-[var(--surface-raised)] p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-primary" />
        <span className="text-sm font-medium text-[var(--text-primary)] dark:text-[var(--text-primary)]">
          Generador de descripcion con IA
        </span>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-md bg-[var(--data-warning-50)] dark:bg-yellow-950/20 border border-[var(--data-warning-500)] dark:border-[var(--data-warning-500)] px-3 py-2">
          <AlertTriangle className="h-4 w-4 text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)] shrink-0 mt-0.5" />
          <p className="text-xs text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)]">{error}</p>
        </div>
      )}

      {preview && (
        <div className="rounded-md bg-muted dark:bg-muted/50 border border-border px-3 py-2">
          <p className="text-sm text-[var(--text-primary)] dark:text-[var(--text-primary)] leading-relaxed whitespace-pre-wrap">
            {preview}
          </p>
        </div>
      )}

      <div className="flex gap-2">
        <button
          onClick={handleGenerate}
          disabled={loading || !productName.trim()}
          className={cn(
            "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
            "bg-primary text-white hover:bg-primary-dark disabled:opacity-50 disabled:cursor-not-allowed"
          )}
        >
          {loading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : preview ? (
            <RefreshCw className="h-3.5 w-3.5" />
          ) : (
            <Sparkles className="h-3.5 w-3.5" />
          )}
          {loading
            ? "Generando..."
            : preview
            ? "Regenerar"
            : "Generar descripcion"}
        </button>

        {preview && (
          <button
            onClick={handleUse}
            disabled={used}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              used
                ? "bg-primary/10 dark:bg-[var(--data-success-500)]/12 text-[var(--data-success-700)] dark:text-[var(--data-success-500)] dark:text-[var(--data-success-500)] cursor-default"
                : "border border-primary text-[var(--accent-ink)] dark:text-[var(--accent)] hover:bg-primary/10 dark:hover:bg-primary/20"
            )}
          >
            <Check className="h-3.5 w-3.5" />
            {used ? "Aplicada" : "Usar esta descripcion"}
          </button>
        )}
      </div>
    </div>
  );
}
