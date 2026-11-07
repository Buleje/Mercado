"use client";

import { useState } from "react";
import { toast } from "sonner";
import { CalendarClock, Check, Loader2, X } from "@buleje/design-system/icons";
import { CardTitle } from "@buleje/design-system";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { button } from "@/components/ui-system/button-variants";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/format";
import { logger } from "@/lib/logger";
import type { DbDocument } from "@/lib/types/documents";
import { getFileIcon } from "../archivo-visual";

/**
 * «¿Vence el …?» (Brandon 23-10: en Blas sólo 1 de 381 papeles tenía fecha de
 * vencimiento). La lectura encuentra la fecha («Fecha de caducidad») y la deja
 * como sugerencia; acá se confirma con un clic y desde ahí llega el aviso.
 */
export default function VencimientosEncontrados({ items, onConfirmar, onDescartar, onAbrir }: {
  items: readonly { doc: DbDocument; fecha: string }[];
  onConfirmar: (docId: string, fecha: string) => Promise<unknown>;
  onDescartar: (docId: string) => void;
  onAbrir: (doc: DbDocument) => void;
}) {
  const [ocupado, setOcupado] = useState<string | null>(null);
  if (items.length === 0) return null;

  const confirmar = async (lista: readonly { doc: DbDocument; fecha: string }[], clave: string) => {
    setOcupado(clave);
    let hechos = 0;
    try {
      for (const { doc, fecha } of lista) {
        await onConfirmar(doc.id, fecha);
        hechos++;
      }
      toast.success(hechos === 1 ? "Listo: te avisaremos antes de que venza." : `Listo: ${hechos} fechas puestas; te avisaremos antes de cada una.`);
    } catch (err) {
      logger.warn("[documentos.esenciales] confirmar vencimiento falló", { error: String(err) });
      toast.error(hechos > 0 ? `Se pusieron ${hechos}; las demás no se pudieron guardar.` : "No se pudo guardar la fecha. Prueba de nuevo.");
    } finally {
      setOcupado(null);
    }
  };

  return (
    <section className="space-y-2 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-3" aria-label="Fechas de vencimiento encontradas" data-qa="esenciales-vencimientos">
      <div className="flex flex-wrap items-center gap-2">
        <CalendarClock className="h-5 w-5 text-[var(--data-warning-ink)]" aria-hidden />
        <CardTitle>{items.length === 1 ? "Encontré 1 fecha de vencimiento" : `Encontré ${items.length} fechas de vencimiento`}</CardTitle>
        <InfoTip
          title="Fechas encontradas"
          what={<span>Al leer los papeles, el sistema halló una fecha de vencimiento que todavía no está puesta.</span>}
          affects={<span>Al confirmarla, te avisamos por WhatsApp y en la campana antes de que venza.</span>}
          example={<span>«Fecha de caducidad: 12/05/2030» en la licencia → confirmas y el 12/04/2030 te llega el aviso.</span>}
        />
        {items.length > 1 && (
          <button type="button" onClick={() => void confirmar(items, "todas")} disabled={!!ocupado} className={cn(button({ variant: "secondary", size: "md" }), "ml-auto gap-2")}>
            {ocupado === "todas" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Confirmar todas
          </button>
        )}
      </div>
      <ul className="divide-y divide-[var(--rule-soft)] overflow-hidden rounded-xl border border-[var(--rule-base)]">
        {items.slice(0, 6).map(({ doc, fecha }) => {
          const { Icon, tint, bg } = getFileIcon(doc.mimeType, doc.name);
          return (
            <li key={doc.id} className="flex flex-wrap items-center gap-2 px-3 py-1.5">
              <button type="button" onClick={() => onAbrir(doc)} className="flex min-w-0 flex-[1_1_14rem] items-center gap-3 text-left">
                <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", bg)}>
                  <Icon className={cn("h-5 w-5", tint)} />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-bold text-[var(--text-primary)]">{doc.name}</span>
                  <span className="block text-sm text-[var(--text-secondary)]">¿Vence el <b className="text-[var(--data-warning-ink)]">{formatDate(fecha)}</b>?</span>
                </span>
              </button>
              <button type="button" onClick={() => void confirmar([{ doc, fecha }], doc.id)} disabled={!!ocupado} className={cn(button({ variant: "primary", size: "md" }), "gap-2")}>
                {ocupado === doc.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Sí, vence
              </button>
              <button type="button" onClick={() => onDescartar(doc.id)} disabled={!!ocupado} aria-label={`No: ${doc.name} no vence esa fecha`} title="No es la fecha" className={button({ variant: "ghost", size: "icon" })}>
                <X className="h-4 w-4" />
              </button>
            </li>
          );
        })}
      </ul>
      {items.length > 6 && <p className="text-xs text-[var(--text-tertiary)]">Y {items.length - 6} más: confírmalas con «Confirmar todas».</p>}
    </section>
  );
}
