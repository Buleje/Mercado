/**
 * Lo que comparten «Por cobrar» y cada una de sus filas: cómo se llama cada
 * tipo de deuda, su color, dónde se cobra, y cómo se lee el cruce con «Lo que
 * debo». Sin React (sólo referencias a íconos).
 *
 * Los chips, los montos en varias monedas y los días de atraso son los de «Lo
 * que debo» (`por-pagar/estilo.ts`): las dos listas hermanas se leen igual.
 */

import { CreditCard, Landmark, DollarSign, Trees } from "@buleje/design-system/icons";
import type { CrucePorCobrar, PorCobrarTipo } from "@/lib/db/por-cobrar.db";
import { enMonedas } from "@/components/admin/unified/finanzas/por-pagar/estilo";

export { CHIP, CHIP_OFF, CHIP_ON, diasEntre, enMonedas } from "@/components/admin/unified/finanzas/por-pagar/estilo";

/** Un tipo de deuda: cómo se dice, de qué color es y dónde se cobra. */
export const TIPOS: Record<PorCobrarTipo, {
  label: string;
  /** El plural va escrito: «maderas» no existe. */
  plural: string;
  icon: typeof CreditCard;
  chip: string;
  destino: string;
  externo?: boolean;
}> = {
  fiado:    { label: "Fiado",    plural: "Fiados",    icon: CreditCard, chip: "bg-[var(--accent)]/15 text-[var(--accent-ink)] dark:text-[var(--accent)]", destino: "fiados" },
  prestamo: { label: "Préstamo", plural: "Préstamos", icon: Landmark,   chip: "bg-[var(--data-info-500)]/15 text-[var(--data-info-500)]", destino: "prestamos" },
  adelanto: { label: "Adelanto", plural: "Adelantos", icon: DollarSign, chip: "bg-[var(--data-warning-500)]/15 text-[var(--data-warning-500)]", destino: "adelantos" },
  /* La madera NO es sección hermana de Mi Plata: su detalle vive en el Libro
     CTP y hay que recargar ese módulo entero. */
  madera:   { label: "Madera",   plural: "Madera",    icon: Trees,      chip: "bg-[var(--data-success-500)]/15 text-[var(--data-success-700)] dark:text-[var(--data-success-500)]", destino: "ctp-libro-operaciones", externo: true },
};

export const ORDEN: readonly PorCobrarTipo[] = ["fiado", "prestamo", "adelanto", "madera"];

/* 44 px de alto en el celular (el dedo), 36 en la tabla del escritorio. */
export const BOTON_FILA = "inline-flex h-11 items-center sm:h-9 justify-center gap-1 rounded-xl border border-[var(--rule-base)] text-[var(--text-secondary)] transition-colors hover:border-[var(--accent)]/50 hover:text-[var(--accent-ink)] dark:hover:text-[var(--accent)]";

/** El mismo botón de fila, de sólo ícono (su texto sale al pasar el mouse). */
export const BOTON_ICONO = "h-11 w-11 border border-[var(--rule-base)] hover:border-[var(--accent)]/50 sm:h-9 sm:w-9";

const DIAS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];

/** «jue 10/09» — a mano, sin `Intl`: el ICU cambia los nombres entre versiones. */
export function fechaCorta(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(`${iso}T00:00:00Z`);
  if (!Number.isFinite(d.getTime())) return "—";
  return `${DIAS[d.getUTCDay()]} ${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * «Te debe S/ 12,323.02 · Le debes S/ 3,031.00 · Neto: te debe S/ 9,292.02».
 *
 * Las tres cifras son las de «Lo que debo» para esa persona (el servidor las
 * manda hechas); acá sólo se escriben. Con varias monedas, cada una aparte.
 */
export function leerCruce(c: Pick<CrucePorCobrar, "teDebe" | "leDebes" | "neto">): string {
  const neto = c.neto.map((n) =>
    Math.abs(n.monto) < 0.005 ? "quedan a mano" : n.monto > 0 ? `te debe ${enMonedas([n])}` : `le debes ${enMonedas([n])}`,
  );
  const cifra = (xs: CrucePorCobrar["teDebe"]) => enMonedas(xs) || enMonedas([{ moneda: "PEN", monto: 0 }]);
  return `Te debe ${cifra(c.teDebe)} · Le debes ${cifra(c.leDebes)} · Neto: ${neto.join(" · ") || "quedan a mano"}`;
}
