/**
 * TipoBadge — chip del tipo comercial de una pieza aserrada, con el color por
 * familia (comercial=verde, tabla=azul, larga angosta=ámbar, paquetería/otro=gris).
 * Single source del estilo: lo usan la tabla del cubicador y los resúmenes.
 */
import { tipoCorto, tonoTipo, type TipoComercial } from "@/lib/forestal/cubicacion-tipo";

type Tono = "success" | "info" | "warning" | "neutral";

/** Clases del badge según el tono del DS. */
export function tipoBadgeCls(tono: Tono): string {
  if (tono === "success") return "bg-[var(--data-success-100)] text-[var(--data-success-700)] dark:bg-[var(--data-success-500)]/15 dark:text-[var(--data-success-500)]";
  if (tono === "info") return "bg-[var(--data-info-100)] text-[var(--data-info-700)] dark:bg-[var(--data-info-500)]/15 dark:text-[var(--data-info-500)]";
  if (tono === "warning") return "bg-[var(--data-warning-100)] text-[var(--data-warning-700)] dark:bg-[var(--data-warning-500)]/15 dark:text-[var(--data-warning-500)]";
  return "bg-[var(--surface-sunken)] text-[var(--text-secondary)]";
}

export function TipoBadge({ tipo, title }: { tipo: TipoComercial; title?: string }) {
  return (
    <span title={title ?? `Según sus medidas (espesor·ancho·largo): ${tipo}`} className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-[length:var(--ts-2xs)] font-bold ${tipoBadgeCls(tonoTipo(tipo))}`}>
      {tipoCorto(tipo)}
    </span>
  );
}
