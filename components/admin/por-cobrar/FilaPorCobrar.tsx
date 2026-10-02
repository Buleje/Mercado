"use client";

/**
 * Una fila de «Por cobrar»: el tipo, quién te debe (y, si también le debes,
 * el cruce con «Lo que debo»), el monto en SU moneda, desde cuándo, el plazo
 * y las acciones — Cobrar siempre; Liquidar si esa persona está en las dos
 * listas.
 */

import { BadgeStatus } from "@buleje/design-system";
import { ArrowRight, Gauge, Scale } from "@buleje/design-system/icons";
import BotonIconoTip from "@/components/admin/shared/boton-icono-tip";
import { cn } from "@/lib/utils";
import { montoEnMoneda } from "@/lib/adelantos/cuenta-unificada";
import type { CrucePorCobrar, PorCobrarFila } from "@/lib/db/por-cobrar.db";
import { BOTON_ICONO, TIPOS, diasEntre, fechaCorta, leerCruce } from "./estilo";

export default function FilaPorCobrar({
  fila: f,
  hoy,
  cruce,
  onCobrar,
  onScoring,
  onLiquidar,
}: {
  fila: PorCobrarFila;
  hoy: string;
  /** El cruce de esta persona, si también está en «Lo que debo». */
  cruce: CrucePorCobrar | null;
  onCobrar: () => void;
  onScoring: () => void;
  onLiquidar: (clave: string) => void;
}) {
  const t = TIPOS[f.tipo];
  const Icon = t.icon;
  const atraso = f.vence ? diasEntre(f.vence, hoy) : 0;
  return (
    <tr>
      <td>
        <span className={cn("inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[length:var(--ts-xs)] font-bold", t.chip)}>
          <Icon className="h-3.5 w-3.5" aria-hidden="true" />{t.label}
        </span>
      </td>
      <td>
        {/* UN solo hijo: en el celular la celda es una fila flex (rótulo a la
            izquierda, valor a la derecha) y los hijos sueltos se pisaban. */}
        <div className="min-w-0">
          <span className="font-bold text-[var(--text-primary)]">{f.quien}</span>
          {f.nota && <span className="block text-[length:var(--ts-xs)] text-[var(--text-tertiary)]">{f.nota}</span>}
          {cruce && (
            <span className="block text-[length:var(--ts-xs)] font-semibold text-[var(--text-secondary)]">{leerCruce(cruce)}</span>
          )}
        </div>
      </td>
      <td className="text-right font-extrabold tabular-nums whitespace-nowrap">{montoEnMoneda(f.monto, f.moneda)}</td>
      <td className="whitespace-nowrap text-[var(--text-secondary)]">{fechaCorta(f.desde)}</td>
      <td className="whitespace-nowrap">
        {f.vence === null
          ? <span className="text-[var(--text-tertiary)]">Sin plazo</span>
          : atraso > 0
            ? <BadgeStatus variant="error" size="sm" label={`Vencido hace ${atraso} d`} />
            : <span className="text-[var(--text-secondary)]">{fechaCorta(f.vence)}</span>}
      </td>
      <td className="text-right whitespace-nowrap">
        <div className="inline-flex items-center justify-end gap-1">
          {f.tipo === "fiado" && (
            <BotonIconoTip
              icon={Gauge}
              onClick={onScoring}
              label={`Ver el scoring crediticio de ${f.quien}`}
              tip="Ver scoring"
              className={BOTON_ICONO}
            />
          )}
          {cruce && (
            <BotonIconoTip
              icon={Scale}
              onClick={() => onLiquidar(cruce.clave)}
              label={`Liquidar la cuenta con ${f.quien}`}
              tip="Liquidar"
              className={BOTON_ICONO}
            />
          )}
          <BotonIconoTip
            icon={ArrowRight}
            tono="acento"
            onClick={onCobrar}
            label={`Abrir ${t.plural.toLowerCase()} para cobrar a ${f.quien}`}
            tip="Cobrar"
            className={BOTON_ICONO}
          />
        </div>
      </td>
    </tr>
  );
}
