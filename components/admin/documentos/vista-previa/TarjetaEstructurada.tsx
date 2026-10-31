"use client";

import { FileSpreadsheet } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { type DbDocument } from "@/lib/types/documents";
import { formatNumber } from "@/lib/format";

export interface EntityOpt { id: string; name: string }

// ── Datos estructurados (facturas/recibos extraídos por IA) ───────────────────
export type StructuredData = { docType?: string | null; ruc?: string | null; razonSocial?: string | null; numero?: string | null; fecha?: string | null; moneda?: string | null; total?: number | string | null; igv?: number | string | null };

export function money(v: number | string | null | undefined, moneda?: string | null): string | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(/[^\d.-]/g, ""));
  if (!isFinite(n)) return null;
  return `${moneda === "USD" ? "$" : "S/"} ${formatNumber(n, 2)}`;
}

export function StructuredCard({ doc }: { doc: DbDocument }) {
  const s = doc.ocrMetadata?.structured as StructuredData | null | undefined;
  // Leído MIRANDO (foto o escaneo): un modelo de visión se come un dígito y
  // nadie lo nota. Estos son los números que la gente copia a la contabilidad,
  // así que acá se avisa; en un texto extraído del archivo no hace falta.
  const via = (doc.ocrMetadata as { analyzedVia?: string } | null)?.analyzedVia;
  const mirado = via === "vision" || via === "ocr";
  if (!s || typeof s !== "object") return null;
  const rows = ([
    ["Tipo", s.docType ?? null],
    ["Nº", s.numero ?? null],
    ["RUC", s.ruc ?? null],
    ["Emisor", s.razonSocial ?? null],
    ["Fecha", s.fecha ?? null],
    ["IGV", money(s.igv, s.moneda)],
    ["Total", money(s.total, s.moneda)],
  ] as [string, string | null][]).filter(([, v]) => v);
  if (rows.length === 0) return null;
  return (
    <section className="rounded-2xl border border-[var(--data-success-500)]/30 bg-[var(--data-success-500)]/8 p-4 dark:bg-[var(--data-success-500)]/12">
      <p className="mb-2 flex items-center gap-1.5 text-sm font-bold text-[var(--text-primary)]">
        <FileSpreadsheet className="h-4 w-4 text-[var(--data-success-700)] dark:text-[var(--data-success-500)]" /> Datos extraídos por IA
      </p>
      {mirado && (
        <p className="mb-2 text-[length:var(--ts-2xs,11px)] leading-snug text-[var(--text-tertiary)]">
          Salieron de mirar la imagen: coteja los números con el papel antes de usarlos en la contabilidad.
        </p>
      )}
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-3">
        {rows.map(([k, v]) => (
          <div key={k} className="min-w-0">
            <p className="text-[length:var(--ts-2xs,11px)] font-bold uppercase tracking-wide text-[var(--text-tertiary)]">{k}</p>
            <p className={cn("truncate text-sm font-semibold text-[var(--text-primary)]", k === "Total" && "text-[var(--data-success-700)] dark:text-[var(--data-success-500)]")}>{v}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

// ── Documentos relacionados ──────────────────────────────────────────────────