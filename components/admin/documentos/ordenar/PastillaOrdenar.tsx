"use client";

import { Wand2, X } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { textoConteo } from "@/lib/documentos/ordenar-archivo";
import { cn } from "@/lib/utils";
import type { ConteoOrden } from "./use-conteo-orden";

/**
 * La línea discreta del Archivo: «7 nombres para limpiar · Revisar». Neutra a
 * propósito: no es un problema, es orden. «Revisar» abre «Ordenar mi Archivo».
 */

const SEGMENTO =
  "inline-flex h-12 shrink-0 items-center gap-1.5 border-l border-[var(--rule-base)] px-3 text-sm font-bold transition-colors hover:bg-[var(--surface-sunken)]";

export function PastillaOrdenar({
  conteo,
  onRevisar,
  onOcultar,
}: {
  conteo: ConteoOrden;
  onRevisar: () => void;
  onOcultar: () => void;
}) {
  const textos = conteo.partes.map((x) => textoConteo(x.tipo, x.n));
  return (
    <div
      role="status"
      className="inline-flex items-stretch overflow-hidden rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)]"
    >
      <span className="inline-flex items-center gap-2 pl-3 pr-2 text-sm font-bold">
        <Wand2 className="h-4 w-4 shrink-0 max-sm:hidden" aria-hidden />
        <span className="whitespace-nowrap max-sm:hidden">{textos.slice(0, 2).join(" · ")}{textos.length > 2 ? " · y más" : ""}</span>
        <span className="whitespace-nowrap sm:hidden">{conteo.total} por limpiar</span>
        <InfoTip
          title="Ordenar mi Archivo"
          what={<span>{textos.join(" · ")}.</span>}
          affects={<span>«Revisar» te muestra cada cambio antes de hacerlo. Los papeles van a la papelera; las carpetas vacías se borran. Puedes deshacerlo todo mientras esa ventana siga abierta.</span>}
        />
      </span>
      <button type="button" onClick={onRevisar} className={SEGMENTO}>
        Revisar
      </button>
      <button
        type="button"
        onClick={onOcultar}
        aria-label="Ocultar el aviso de ordenar"
        title="Ocultar hasta que haya algo nuevo"
        className={cn(SEGMENTO, "w-12 justify-center px-0")}
      >
        <X className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
}
