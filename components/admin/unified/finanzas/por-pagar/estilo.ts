/**
 * Lo que comparten la lista «Lo que debo» y cada una de sus filas: el color y
 * el ícono de cada fuente, las clases de los botones y cómo se leen los montos.
 * Sin React (sólo referencias a íconos): se importa desde las dos partes.
 */

import { Coins, Truck, Landmark, Axe, Trees } from "@buleje/design-system/icons";
import { montoEnMoneda } from "@/lib/adelantos/cuenta-unificada";
import type { FuentePorPagar, MontoEnMoneda, PersonaPorPagar } from "@/lib/finance/por-pagar";

/** Color e ícono de cada fuente: las mismas familias que «Por cobrar». */
export const ESTILO: Record<FuentePorPagar, { icon: typeof Coins; chip: string }> = {
  adelanto_recibido: { icon: Coins, chip: "bg-[var(--data-warning-500)]/15 text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]" },
  adelanto_excedido: { icon: Coins, chip: "bg-[var(--data-warning-500)]/15 text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]" },
  cuenta_por_pagar: { icon: Truck, chip: "bg-[var(--data-info-500)]/15 text-[var(--data-info-700)] dark:text-[var(--data-info-500)]" },
  prestamo_recibido: { icon: Landmark, chip: "bg-[var(--data-info-500)]/15 text-[var(--data-info-700)] dark:text-[var(--data-info-500)]" },
  aserrio_recibido: { icon: Axe, chip: "bg-[var(--data-success-500)]/15 text-[var(--data-success-700)] dark:text-[var(--data-success-500)]" },
  cuenta_forestal: { icon: Trees, chip: "bg-[var(--data-success-500)]/15 text-[var(--data-success-700)] dark:text-[var(--data-success-500)]" },
};

/** El rótulo chico bajo el nombre. Una persona no lo lleva: es el caso común. */
export const TIPO: Record<PersonaPorPagar["tipo"], string | null> = { persona: null, proveedor: "Proveedor", entidad: "Te prestó" };

export const CHIP = "inline-flex h-11 items-center gap-2 rounded-2xl border px-4 text-sm font-bold transition-colors";
export const CHIP_ON = "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent-ink)] dark:text-[var(--accent)]";
export const CHIP_OFF = "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:border-[var(--accent)]/50";
/* 44 px de alto en el celular (el dedo), 36 en la tabla del escritorio. */
export const BOTON_FILA = "inline-flex h-11 items-center sm:h-9 justify-center gap-1 rounded-xl border border-[var(--rule-base)] px-3 text-[length:var(--ts-xs)] font-bold text-[var(--text-secondary)] transition-colors hover:border-[var(--accent)]/50 hover:text-[var(--accent-ink)] dark:hover:text-[var(--accent)]";
export const PARTIDA = "group flex min-h-11 w-full items-center gap-2 rounded-lg px-1 py-1 text-left transition-colors hover:bg-[var(--surface-sunken)] sm:min-h-9";

/** Varias monedas en una línea, sin sumarlas entre sí. */
export const enMonedas = (xs: readonly MontoEnMoneda[]) => xs.map((x) => montoEnMoneda(Math.abs(x.monto), x.moneda)).join(" · ");

/** Días entre dos `YYYY-MM-DD`, en UTC (date-only: sin husos de por medio). */
export function diasEntre(desde: string, hasta: string): number {
  const a = Date.parse(`${desde}T00:00:00Z`);
  const b = Date.parse(`${hasta}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.round((b - a) / 86_400_000);
}

/** «También te debe S/ 500 · neto: le debes S/ 2 500» — el cruce con el otro lado. */
export function leerNeto(p: PersonaPorPagar): string | null {
  if (p.teDebe.length === 0) return null;
  const partes = p.neto.map((n) =>
    Math.abs(n.monto) < 0.005 ? "quedan a mano" : n.monto > 0 ? `te debe ${montoEnMoneda(n.monto, n.moneda)}` : `le debes ${montoEnMoneda(-n.monto, n.moneda)}`,
  );
  return `También te debe ${enMonedas(p.teDebe)} · neto: ${partes.join(" · ")}`;
}
