"use client";

/**
 * La etiqueta del cuadre: un chip chico que dice si una vista de la
 * distribución da las mismas cifras que las demás (Brandon, 2026-10-03:
 * «una etiqueta para que de acuerdo al bloque, Anexo 4 por permiso y total…
 * coincidan o si hay alguna variación»).
 *
 * Verde «Cuadra», ámbar «Redondeo», rojo «Difiere 0,012 m³». Un clic abre el
 * modal del cuadre parado en ese control: la etiqueta dice QUE algo no da, el
 * modal dice CUÁNTO y CÓMO cuadrarlo.
 */

import { AlertTriangle, Check } from "@buleje/design-system/icons";
import type { ControlCuadre, EstadoCuadre } from "@/lib/forestal/reparto-cuadre";
import { conSigno, difCorta } from "@/lib/forestal/cuadre-del-papel";

export const ESTADO_CUADRE: Record<EstadoCuadre, { label: string; clase: string }> = {
  exacto: {
    label: "Cuadra",
    clase: "border-[var(--data-success-500)]/40 bg-[var(--data-success-50)] text-[var(--data-success-700)] dark:bg-[var(--data-success-500)]/12 dark:text-[var(--data-success-500)]",
  },
  redondeo: {
    label: "Redondeo",
    clase: "border-[var(--data-warning-500)]/40 bg-[var(--data-warning-50)] text-[var(--data-warning-700)] dark:bg-[var(--data-warning-500)]/12 dark:text-[var(--data-warning-500)]",
  },
  difiere: {
    label: "Difiere",
    clase: "border-[var(--data-error-500)]/50 bg-[var(--data-error-50)] text-[var(--data-error-700)] dark:bg-[var(--data-error-500)]/15 dark:text-[var(--data-error-500)]",
  },
};

/* `conSigno` y `difCorta` viven en la lib (los usa también el candado del
   papel, `cuadre-del-papel.ts`); se re-exportan para la tabla del cuadre. */
export { conSigno, difCorta };

const nf = (v: number, dec: number) =>
  v.toLocaleString("es-PE", { minimumFractionDigits: dec, maximumFractionDigits: dec });

/** Piezas enteras; PT a 2 decimales; m³ a 3 (como el acta). */
export const fmtTrio = {
  piezas: (v: number) => v.toLocaleString("es-PE", { maximumFractionDigits: 2 }),
  pt: (v: number) => nf(v, 2),
  m3: (v: number) => nf(v, 3),
};

export function IconoEstado({ estado, className = "h-3 w-3" }: { estado: EstadoCuadre; className?: string }) {
  if (estado === "exacto") return <Check className={className} aria-hidden />;
  if (estado === "difiere") return <AlertTriangle className={className} aria-hidden />;
  return <span aria-hidden className="font-bold leading-none">≈</span>;
}

/**
 * El chip. Con `onAbrir` es un botón (abre el modal en ese control); sin él,
 * un rótulo. `control` puede faltar mientras la distribución no tiene bloques.
 */
export default function EtiquetaCuadre({ control, onAbrir, className = "" }: {
  control: Pick<ControlCuadre, "estado" | "peor" | "titulo" | "relacion"> | undefined;
  onAbrir?: () => void;
  className?: string;
}) {
  if (!control) return null;
  const e = ESTADO_CUADRE[control.estado];
  const dif = control.estado === "exacto" ? "" : difCorta(control.peor);
  const texto = control.estado === "difiere" && dif
    ? `${control.relacion === "tope" ? "Se pasa" : "Difiere"} ${dif.replace(/^[+−]/, "")}`
    : e.label;
  const clase = `inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-bold normal-case tracking-normal ${e.clase} ${className}`;
  const titulo = `${control.titulo}: ${texto}. Clic para ver el cuadre.`;
  if (!onAbrir) {
    return <span className={clase} title={control.titulo}><IconoEstado estado={control.estado} />{texto}</span>;
  }
  return (
    <button
      type="button"
      onClick={onAbrir}
      title={titulo}
      aria-label={titulo}
      className={`${clase} transition-opacity hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] print:hidden`}
    >
      <IconoEstado estado={control.estado} />
      {texto}
    </button>
  );
}
