"use client";

import { AlertTriangle } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { fechaDelCalculo, pasosDeLaCuenta } from "./explicar";
import type { Sugerencia } from "./tipos";

interface Props {
  s: Sugerencia;
  ventanaDias: number;
  calculadoEn: string | null;
  id: string;
}

/**
 * «¿Cómo se calculó?» de una sugerencia (C28): venta, plazo, punto de pedido,
 * lo que tienes y la cantidad, con los números con que se decidió. Antes la
 * única pista era «vende 2/día»; ahora se reconstruye «Pedir N» paso a paso y
 * una venta con pocos datos se dice estimada, no se da por cierta.
 */
export default function SugerenciaExplicacion({ s, ventanaDias, calculadoEn, id }: Props) {
  const pasos = pasosDeLaCuenta(s, ventanaDias);
  const cuando = fechaDelCalculo(calculadoEn);
  return (
    <div id={id} className="rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-sunken)] px-3 py-2.5 text-sm">
      {pasos.length === 0 ? (
        <p className="text-[var(--text-secondary)]">{s.motivo}. Recalcula para ver la cuenta completa.</p>
      ) : (
        <ol className="space-y-1.5">
          {pasos.map((p) => (
            <li key={p.rotulo} className={cn("flex gap-2", p.aviso && "text-[var(--data-warning-ink)]")}>
              <span className="w-24 shrink-0 font-bold text-[var(--text-primary)]">
                {p.aviso ? <AlertTriangle className="inline h-4 w-4 align-[-3px]" aria-label="Aviso" /> : p.rotulo}
              </span>
              <span className={cn("min-w-0 tabular-nums", !p.aviso && "text-[var(--text-secondary)]")}>{p.texto}</span>
            </li>
          ))}
        </ol>
      )}
      {cuando && (
        <p className="mt-2 border-t border-[var(--rule-soft)] pt-2 text-[var(--text-secondary)]">
          Calculado el {cuando} con las ventas de {ventanaDias} días.
        </p>
      )}
    </div>
  );
}
