"use client";

/**
 * Una fila de «Lo que debo»: a quién, el desglose por fuente (cada partida
 * lleva a su origen), el total por moneda, el plazo más urgente y la acción —
 * Liquidar si esa persona también te debe, Pagar si no.
 */

import { BadgeStatus } from "@buleje/design-system";
import { ArrowRight, Scale } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { formatDateShort } from "@/lib/format";
import { montoEnMoneda } from "@/lib/adelantos/cuenta-unificada";
import { ETIQUETA_FUENTE, type EnlacePorPagar, type PersonaPorPagar } from "@/lib/finance/por-pagar";
import { BOTON_FILA, ESTILO, PARTIDA, TIPO, diasEntre, enMonedas, leerNeto } from "./estilo";

export default function FilaPorPagar({ persona: p, hoy, onAbrir }: { persona: PersonaPorPagar; hoy: string; onAbrir: (e: EnlacePorPagar) => void }) {
  const atraso = p.vence ? diasEntre(p.vence, hoy) : 0;
  const neto = leerNeto(p);
  const primera = p.partidas[0];
  return (
    <tr>
      <td className="align-top">
        {/* UN solo hijo: en el celular la celda es una fila flex (rótulo a la
            izquierda, valor a la derecha) y tres hijos sueltos se pisaban. */}
        <div className="min-w-0">
          <span className="font-bold text-[var(--text-primary)]">{p.nombre}</span>
          {TIPO[p.tipo] && <span className="block text-[length:var(--ts-xs)] text-[var(--text-tertiary)]">{TIPO[p.tipo]}</span>}
          {neto && <span className="block text-[length:var(--ts-xs)] font-semibold text-[var(--text-secondary)]">{neto}</span>}
        </div>
      </td>
      <td className="align-top">
        <ul className="space-y-0.5">
          {p.partidas.map((x) => {
            const Icon = ESTILO[x.fuente].icon;
            return (
              <li key={`${x.fuente}-${x.id}`}>
                <button
                  onClick={() => onAbrir(x.enlace)}
                  aria-label={`Abrir ${ETIQUETA_FUENTE[x.fuente].label.toLowerCase()} de ${p.nombre}: ${montoEnMoneda(x.monto, x.moneda)}`}
                  className={PARTIDA}
                >
                  <span className={cn("inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-1 text-[length:var(--ts-xs)] font-bold", ESTILO[x.fuente].chip)}>
                    <Icon className="h-3.5 w-3.5" aria-hidden="true" />{ETIQUETA_FUENTE[x.fuente].label}
                  </span>
                  <span className="min-w-0">
                    <span className="font-bold tabular-nums text-[var(--text-primary)]">{montoEnMoneda(x.monto, x.moneda)}</span>
                    {x.nota && <span className="block text-[length:var(--ts-xs)] text-[var(--text-tertiary)]">{x.nota}</span>}
                  </span>
                  <ArrowRight className="ml-auto h-3.5 w-3.5 shrink-0 text-[var(--text-tertiary)] opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" aria-hidden="true" />
                </button>
              </li>
            );
          })}
        </ul>
      </td>
      <td className="align-top text-right font-extrabold tabular-nums whitespace-nowrap">{enMonedas(p.debes)}</td>
      <td className="align-top whitespace-nowrap">
        {p.vence === null
          ? <span className="text-[var(--text-tertiary)]">Sin plazo</span>
          : atraso > 0
            ? <BadgeStatus variant="error" size="sm" label={`Vencido hace ${atraso} d`} />
            : <span className="text-[var(--text-secondary)]">{formatDateShort(p.vence, { soloFecha: true })}</span>}
      </td>
      <td className="align-top text-right whitespace-nowrap">
        {p.liquidar ? (
          <button onClick={() => p.liquidar && onAbrir(p.liquidar)} aria-label={`Liquidar la cuenta con ${p.nombre}`} className={BOTON_FILA}>
            <Scale className="h-3.5 w-3.5" aria-hidden="true" /> Liquidar
          </button>
        ) : primera ? (
          <button onClick={() => onAbrir(primera.enlace)} aria-label={`Ir a pagarle a ${p.nombre}`} className={BOTON_FILA}>
            Pagar <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        ) : null}
      </td>
    </tr>
  );
}
