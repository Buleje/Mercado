"use client";

/**
 * Una fila de «Todo lo que me deben»: el tipo, quién te debe (y, si también le
 * debes, el cruce con «Lo que debo»), el monto en SU moneda, desde cuándo, el
 * plazo y la acción principal a 48 px — Liquidar si esa persona está en las dos
 * listas, Cobrar si no— con «⋯» para lo demás.
 */

import { useRef } from "react";
import { BadgeStatus } from "@buleje/design-system";
import { Gauge, HandCoins, MoreHorizontal, Scale } from "@buleje/design-system/icons";
import ActionMenu, { type MenuAccion } from "@/components/admin/shared/action-menu";
import { cn } from "@/lib/utils";
import { montoEnMoneda } from "@/lib/adelantos/cuenta-unificada";
import type { CrucePorCobrar, PorCobrarFila } from "@/lib/db/por-cobrar.db";
import { BOTON_FILA, TIPOS, diasEntre, fechaCorta, leerCruce } from "./estilo";

/** Sólo ícono en pantalla ancha (el título está en el tooltip); en el celular el rótulo vuelve por CSS. */
const BOTON_ICONO = "max-sm:after:content-[attr(data-texto)]";

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
  const ref = useRef<HTMLDivElement>(null);
  /* El menú cierra sin devolverle el foco a su botón: se enfoca el ⋯ antes de la acción. */
  const enfocarMenu = () => ref.current?.querySelector<HTMLButtonElement>("button[aria-haspopup]")?.focus({ preventScroll: true });
  const acciones: MenuAccion[] = [
    ...(cruce ? [{ id: "cobrar", label: `Cobrar en ${t.plural.toLowerCase()}`, hint: "Sin cruzar con lo que le debes", icon: HandCoins, onSelect: onCobrar }] : []),
    ...(f.tipo === "fiado" ? [{ id: "fiarle", label: "¿Fiarle de nuevo?", hint: "Su respuesta en A quién fiarle", icon: Gauge, onSelect: onScoring }] : []),
  ];

  return (
    <tr>
      <td>
        <span className={cn("inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm font-bold", t.chip)}>
          <Icon className="h-4 w-4" aria-hidden="true" />{t.label}
        </span>
      </td>
      <td>
        {/* UN solo hijo: en el celular la celda es una fila flex (rótulo a la
            izquierda, valor a la derecha) y los hijos sueltos se pisaban. */}
        <div className="min-w-0">
          <span className="font-bold text-[var(--text-primary)]">{f.quien}</span>
          {f.nota && <span className="block text-sm text-[var(--text-secondary)]">{f.nota}</span>}
          {cruce && <span className="block text-sm font-semibold text-[var(--text-secondary)]">{leerCruce(cruce)}</span>}
        </div>
      </td>
      <td className="text-right font-extrabold tabular-nums whitespace-nowrap">{montoEnMoneda(f.monto, f.moneda)}</td>
      <td className="whitespace-nowrap text-[var(--text-secondary)]">{fechaCorta(f.desde)}</td>
      <td className="whitespace-nowrap">
        {f.vence === null
          ? <span className="text-[var(--text-secondary)]">Sin plazo</span>
          : atraso > 0
            ? <BadgeStatus variant="error" size="md" label={`Vencido hace ${atraso} d`} />
            : <span className="text-[var(--text-secondary)]">{fechaCorta(f.vence)}</span>}
      </td>
      <td className="text-right whitespace-nowrap">
        <div ref={ref} className="inline-flex items-center justify-end gap-1">
          {cruce ? (
            <button type="button" onClick={() => onLiquidar(cruce.clave)} aria-label={`Liquidar la cuenta con ${f.quien}`} title="Liquidar" data-texto="Liquidar" className={cn(BOTON_FILA, BOTON_ICONO)}>
              <Scale className="h-4 w-4" aria-hidden="true" />
            </button>
          ) : (
            <button type="button" onClick={onCobrar} aria-label={`Cobrarle a ${f.quien} en ${t.plural.toLowerCase()}`} title="Cobrar" data-texto="Cobrar" className={cn(BOTON_FILA, BOTON_ICONO)}>
              <HandCoins className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
          {acciones.length > 0 ? (
            <ActionMenu
              label={`Más acciones de ${f.quien}`}
              title={acciones.map((a) => a.label).join(" · ")}
              icon={MoreHorizontal}
              actions={acciones.map((a) => ({ ...a, onSelect: () => { enfocarMenu(); a.onSelect(); } }))}
              soloIcono
              size="md"
              className="w-12 shrink-0 border-transparent! bg-transparent! hover:bg-[var(--surface-sunken)]!"
            />
          ) : (
            /* Sin «⋯» la columna igual guarda su ancho: los «Cobrar» quedan alineados. */
            <span className="hidden w-12 sm:inline-block" aria-hidden="true" />
          )}
        </div>
      </td>
    </tr>
  );
}
