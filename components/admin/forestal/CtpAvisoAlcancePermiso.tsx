"use client";

/**
 * CtpAvisoAlcancePermiso — qué se acota y qué NO con «Solo este permiso» (ADR-431).
 *
 * COMPARTIDO: lo montan Consumos y Saldos, sólo si el interruptor de la banda
 * está prendido (`useContratoActivo().contratoFiltro != null`); quien llama
 * decide eso, este componente no lee el contexto.
 *
 * El filtro por contrato es PARCIAL en las dos pestañas: el patio se pide ya
 * acotado al servidor, pero el cuadro de la Sección 2, la curva, la conciliación
 * o la antigüedad siguen siendo de toda la planta. Sin esta banda, la pestaña
 * mostraría números mezclados —unos de un permiso y otros de todos— como si
 * fueran de uno solo.
 *
 * @example
 *   <CtpAvisoAlcancePermiso
 *     codigo="CON-25-UCA-0207"
 *     acotado={["el patio", "los indicadores del patio"]}
 *     sinAcotar={["el cuadro de la Sección 2"]}
 *   />
 */

import { Filter } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";

export interface CtpAvisoAlcancePermisoProps {
  /** Código del permiso activo, como lo muestra el chip de la banda. */
  codigo: string;
  /** Lo que SÍ se acota, en minúscula y con artículo: «el patio», «la capacidad». */
  acotado: readonly string[];
  /** Lo que sigue mostrando toda la planta. Sin esto no se dice nada de eso. */
  sinAcotar?: readonly string[];
}

/** «a, b y c» — la lista como se dice en voz alta. */
function enumerar(xs: readonly string[]): string {
  if (xs.length <= 1) return xs[0] ?? "";
  return `${xs.slice(0, -1).join(", ")} y ${xs[xs.length - 1]}`;
}

export default function CtpAvisoAlcancePermiso({ codigo, acotado, sinAcotar = [] }: CtpAvisoAlcancePermisoProps) {
  return (
    <div
      role="status"
      className="flex items-center gap-2 rounded-2xl border-2 border-[var(--accent)] bg-[var(--surface-raised)] px-4 py-2 text-sm"
    >
      <Filter className="h-4 w-4 shrink-0 text-[var(--accent-ink)] dark:text-[var(--accent)]" aria-hidden />
      <b className="min-w-0 text-[var(--text-primary)]">Solo este permiso: {codigo}</b>
      {/* Qué se acota y qué no, en el ⓘ (2026-09-24): a la vista, una línea. */}
      <InfoTip
        title="Solo este permiso"
        what={acotado.length > 0 ? `Se acota${acotado.length > 1 ? "n" : ""} ${enumerar(acotado)}.` : undefined}
        affects={
          sinAcotar.length > 0
            ? `${sinAcotar.length > 1 ? "Muestran" : "Muestra"} toda la planta: ${enumerar(sinAcotar)}.`
            : undefined
        }
        example="Se apaga con el interruptor «Solo este permiso» de la banda del libro."
      />
    </div>
  );
}
