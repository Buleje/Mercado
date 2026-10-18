"use client";

/**
 * El ícono de un archivo como en el Explorador de Windows: una hoja con la
 * esquina doblada y la etiqueta de su tipo (PDF rojo, XLSX verde, DOCX azul,
 * ZIP amarillo…). Las fotos se ven como foto (miniatura). En Lista va el
 * cuadradito chico de siempre.
 */

import { cn } from "@/lib/utils";
import type { DbDocument } from "@/lib/types/documents";
import { esImagenConvertible, esImagenRenderizable, extensionDe, familiaDe, type FamiliaArchivo } from "@/lib/documents/tipos-archivo";
import { getFileIcon } from "../archivo-visual";
import DocThumb from "../DocThumb";
import type { TamIcono } from "./IconoCarpeta";

const WORD = new Set(["doc", "docx", "odt", "rtf"]);

/** El color de la etiqueta; sin etiqueta = va el ícono de su familia. */
function insigniaDe(familia: FamiliaArchivo, ext: string): string | null {
  switch (familia) {
    case "pdf": return "fill-red-600";
    case "planilla": return "fill-[var(--data-success-700)]";
    case "presentacion": return "fill-[var(--data-warning-700)]";
    case "comprimido": return "fill-yellow-500";
    case "texto": return WORD.has(ext) ? "fill-blue-600" : "fill-[var(--text-tertiary)]";
    default: return null;
  }
}

const POR_DEFECTO: Partial<Record<FamiliaArchivo, string>> = { pdf: "PDF", planilla: "XLS", texto: "TXT", comprimido: "ZIP", presentacion: "PPT" };

export default function IconoArchivo({ doc, tam }: { doc: DbDocument; tam: TamIcono }) {
  const visual = getFileIcon(doc.mimeType, doc.name);
  if (tam === "chico") {
    return (
      <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", visual.bg)}>
        <visual.Icon className={cn("h-4 w-4", visual.tint)} aria-hidden />
      </span>
    );
  }
  if (esImagenRenderizable(doc.name, doc.mimeType) || esImagenConvertible(doc.name, doc.mimeType)) {
    return (
      <span className="block h-full w-full overflow-hidden rounded-lg border border-[var(--rule-soft)] bg-[var(--surface-sunken)]">
        <DocThumb doc={doc} Icon={visual.Icon} tint={visual.tint} bg={visual.bg} iconClassName={tam === "grande" ? "h-12 w-12" : "h-8 w-8"} />
      </span>
    );
  }
  const familia = familiaDe(doc.name, doc.mimeType);
  const ext = extensionDe(doc.name);
  const insignia = insigniaDe(familia, ext);
  const etiqueta = (ext && ext.length <= 4 ? ext : POR_DEFECTO[familia] ?? "").toUpperCase();
  return (
    <span className={cn("relative inline-flex items-center justify-center", tam === "grande" ? "h-[86%]" : "h-full")}>
      <svg viewBox="0 0 48 60" className="h-full drop-shadow-sm" aria-hidden focusable="false">
        <path d="M6 1.5h24.5L43.5 14.5V56a2.5 2.5 0 0 1-2.5 2.5H6A2.5 2.5 0 0 1 3.5 56V4A2.5 2.5 0 0 1 6 1.5z" className="fill-white stroke-[var(--rule-strong)]" strokeWidth="1" />
        <path d="M30.5 1.5V12a2.5 2.5 0 0 0 2.5 2.5h10.5" className="fill-[var(--surface-sunken)] stroke-[var(--rule-strong)]" strokeWidth="1" />
        {[20, 25, 30].map((y) => (
          <rect key={y} x="9" y={y} width={y === 30 ? 18 : 28} height="2" rx="1" className="fill-[var(--rule-base)]" />
        ))}
        {insignia && (
          <>
            <rect x="0.5" y="37" width={etiqueta.length > 3 ? 33 : 28} height="14" rx="2.5" className={insignia} />
            <text
              x={etiqueta.length > 3 ? 17 : 14.5}
              y="47.2"
              textAnchor="middle"
              fontSize="8.5"
              fontWeight="800"
              className={familia === "comprimido" ? "fill-black/75" : "fill-white"}
            >
              {etiqueta}
            </text>
          </>
        )}
      </svg>
      {!insignia && (
        <visual.Icon className={cn("absolute top-[48%]", tam === "grande" ? "h-9 w-9" : "h-5 w-5", visual.tint)} aria-hidden />
      )}
    </span>
  );
}
