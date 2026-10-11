import { button } from "@/components/ui-system/button-variants";
/** Clases de los campos del formulario y del detalle: h-12, texto ≥14 px, tokens del DS. */
export const CAMPO =
  "w-full h-12 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none focus:border-primary focus:ring-2 focus:ring-primary/30";
export const CAMPO_ICONO = `${CAMPO} pl-9`;
export const ETIQUETA = "mb-1 block text-sm font-semibold text-[var(--text-secondary)]";
export const BOTON_ICONO =
  button({ variant: "ghost", size: "icon", className: "shrink-0 rounded-xl" });
