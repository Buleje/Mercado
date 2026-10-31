"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { BookOpenText, Loader2 } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { button } from "@/components/ui-system/button-variants";
import { cn } from "@/lib/utils";
import type { DbDocument } from "@/lib/types/documents";
import { tieneDescripcion } from "@/lib/documentos/relevancia";
import { esFotoDeMaquina } from "@/lib/documents/fotos-de-maquina";
import { isAnalyzableMime } from "@/lib/documents/analyzable-mime";
import type { ModeloArchivo } from "../archivo/use-archivo";

/**
 * «Leer los papeles» de una carpeta esencial (Brandon 23-10: «buscarlos por lo
 * que dicen»; en Blas sólo 14 de 381 papeles tenían su texto leído). Es la
 * misma lectura del Archivo («Describirlos con IA»): el servidor lee el texto
 * de cada papel —gratis, sin clave— y la IA lo describe si hay cupo. Con el
 * texto guardado, la búsqueda de Esenciales los encuentra por contenido.
 */
export default function LeerPapeles({ docs, arch, className }: {
  /** Los papeles de la carpeta (con sus subcarpetas). */
  docs: readonly DbDocument[];
  arch: ModeloArchivo;
  className?: string;
}) {
  const { runIndex } = arch;
  const [progreso, setProgreso] = useState<{ hechos: number; total: number } | null>(null);
  const faltan = useMemo(
    () => docs.filter((d) => !d.deletedAt && isAnalyzableMime(d.mimeType) && !tieneDescripcion(d) && !esFotoDeMaquina(d)),
    [docs],
  );
  if (faltan.length === 0 && !progreso) return null;

  const leer = async () => {
    if (progreso) return;
    const lista = [...faltan];
    setProgreso({ hechos: 0, total: lista.length });
    try {
      await runIndex(lista, (hechos, total) => setProgreso({ hechos, total }));
      toast.success(lista.length === 1 ? "Listo: 1 papel leído. Ya lo encuentras por lo que dice." : `Listo: ${lista.length} papeles leídos. Ya los encuentras por lo que dicen.`);
    } catch (err) {
      toast.error(`No se pudieron leer: ${err instanceof Error ? err.message.slice(0, 120) : "error"}`);
    } finally {
      setProgreso(null);
    }
  };

  return (
    <div
      className={cn("flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-[var(--accent)]/40 bg-[var(--accent-muted)] px-3 py-1.5", className)}
      data-qa="esencial-leer-papeles"
    >
      <span className="flex min-w-0 flex-1 items-center gap-1.5 text-sm font-bold text-[var(--accent-ink)] dark:text-[var(--accent)]">
        <BookOpenText className="h-4 w-4 shrink-0" aria-hidden />
        {progreso
          ? `Leyendo ${progreso.hechos} de ${progreso.total}…`
          : faltan.length === 1 ? "1 papel sin leer" : `${faltan.length} papeles sin leer`}
        <InfoTip
          title="Leer los papeles"
          what={<span>El sistema lee el texto de cada papel (los escaneados también) y lo guarda.</span>}
          affects={<span>Después los encuentras buscando lo que dicen, no sólo su nombre. El texto se lee gratis; la descripción usa la IA si hay cupo.</span>}
          example={<span>Buscas «Callería» y aparece «scan_003.pdf», el contrato que lo menciona.</span>}
        />
      </span>
      <button type="button" onClick={() => void leer()} disabled={!!progreso} className={cn(button({ variant: "secondary", size: "md" }), "gap-2")}>
        {progreso ? <Loader2 className="h-4 w-4 animate-spin" /> : <BookOpenText className="h-4 w-4" />}
        {progreso ? "Leyendo…" : "Leerlos"}
      </button>
    </div>
  );
}
