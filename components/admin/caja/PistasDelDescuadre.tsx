"use client";

/**
 * Caja › Cuadrar › «¿Por qué no cuadra?» (auditoría 15-10, M60): bajo el
 * contador, pistas para el último conteo que no cuadró, cada una con «Ver» al
 * movimiento que la respalda. No corrige nada: quien cuenta decide.
 * A ciegas no se dibuja (las pistas dicen montos del esperado).
 */
import { useMemo } from "react";
import { CardTitle } from "@buleje/design-system";
import { ArrowRight } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { button } from "@/components/ui-system/button-variants";
import { pistasDelDescuadre } from "@/lib/caja/pistas-del-descuadre";
import type { ConteoExpress } from "@/components/admin/arqueo/arqueo-shared";
import { fmt, type CashMovement } from "./tipos";

interface Props {
  conteo: ConteoExpress | null;
  movimientos: readonly CashMovement[];
  ciego: boolean | null;
  onVerMovimiento: (buscar: string) => void;
}

export function PistasDelDescuadre({ conteo, movimientos, ciego, onVerMovimiento }: Props) {
  const pistas = useMemo(
    () => (conteo?.diferencia ? pistasDelDescuadre({ diferencia: conteo.diferencia, contadoEn: conteo.creadoEn, movimientos }, fmt) : []),
    [conteo, movimientos],
  );
  if (ciego !== false || !conteo?.diferencia || pistas.length === 0) return null;

  return (
    <section data-qa="caja-pistas-descuadre" className="rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4 sm:p-5">
      <div className="mb-2 flex items-center gap-1.5">
        <CardTitle className="text-sm font-bold text-[var(--text-primary)]">
          ¿Por qué no cuadra? ({conteo.diferencia < 0 ? "faltan" : "sobran"} {fmt(Math.abs(conteo.diferencia))})
        </CardTitle>
        <InfoTip
          what="Pistas que salen de comparar la diferencia del último conteo con los movimientos que ese conteo vio. Son posibilidades, no conclusiones: no cambian nada."
          affects="Si una se confirma, la corriges en Movimientos (cambiar el medio, anular) y vuelves a contar."
          example="Faltan S/ 12.50 y hay una venta en efectivo de S/ 12.50: quizá se pagó con Yape."
        />
      </div>
      <ul className="divide-y divide-[var(--rule-soft)]">
        {pistas.map((p) => (
          <li key={p.clave} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-1.5">
            <span className="min-w-0 flex-1 text-sm text-[var(--text-primary)]">{p.texto}</span>
            <InfoTip what={p.detalle} />
            {p.buscar && (
              <button type="button" onClick={() => onVerMovimiento(p.buscar as string)} className={button({ variant: "ghost", className: "gap-1.5 rounded-xl" })}>
                Ver <ArrowRight className="h-4 w-4" aria-hidden />
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
