"use client";

/**
 * Lo que entró y salió de las cuentas, lo más nuevo arriba.
 *
 * Una transferencia son DOS filas —sale de una cuenta y entra en otra— porque
 * cada una mueve el saldo de SU cuenta, y la columna «Saldo después» sólo se
 * entiende así. La nota que escribió quien la hizo («reponer caja chica») vive
 * en la transferencia, no en el movimiento: se cruza por `referencia`.
 */

import { DataTable } from "@buleje/design-system";
import { cn } from "@/lib/utils";
import { formatDateTimeShort } from "@/lib/format";
import { montoEnMoneda } from "@/lib/adelantos/cuenta-unificada";
import type { MovimientoTesoreria } from "@/hooks/use-tesoreria";
import { montoConSigno, origenLegible, tipoDeMovimiento } from "./estilo";

interface Props {
  movimientos: MovimientoTesoreria[];
  /** Moneda de cada cuenta, por id (el movimiento no la trae). */
  monedaDe: (cuentaId: string) => string;
  /** Nota de cada transferencia, por su id. */
  notaDe: (transferenciaId: string | null) => string | null;
  /** Con una cuenta elegida, la columna «Cuenta» sobra. */
  conCuenta: boolean;
}

export default function MovimientosTesoreria({ movimientos, monedaDe, notaDe, conCuenta }: Props) {
  return (
    <DataTable zebra>
      <thead>
        <tr>
          <th>Cuándo</th>
          {conCuenta && <th>Cuenta</th>}
          <th>Qué pasó</th>
          <th className="text-right">Monto</th>
          <th className="text-right">Saldo después</th>
        </tr>
      </thead>
      <tbody>
        {movimientos.map((m) => {
          const tipo = tipoDeMovimiento(m.tipo);
          const Icon = tipo.icon;
          const moneda = monedaDe(m.cuentaId);
          const nota = m.origen === "TRANSFERENCIA" ? notaDe(m.referencia) : null;
          const origen = origenLegible(m.origen);
          const extra = [origen, m.categoria, m.origen !== "TRANSFERENCIA" ? m.referencia : null, nota]
            .filter(Boolean)
            .join(" · ");
          return (
            <tr key={m.id}>
              <td className="align-top whitespace-nowrap text-[var(--text-secondary)] tabular-nums">{formatDateTimeShort(m.createdAt)}</td>
              {conCuenta && <td className="align-top font-semibold text-[var(--text-primary)]">{m.cuentaNombre ?? "—"}</td>}
              <td className="align-top">
                {/* UN solo hijo: en el celular la celda es una fila flex y
                    varios hijos sueltos se pisaban. */}
                <div className="min-w-0">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className={cn("inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-1 text-[length:var(--ts-xs)] font-bold", tipo.chip)}>
                      <Icon className="h-3.5 w-3.5" aria-hidden="true" />{tipo.label}
                    </span>
                    <span className="font-medium text-[var(--text-primary)]">{m.descripcion || tipo.label}</span>
                  </span>
                  {extra && <span className="mt-0.5 block text-[length:var(--ts-xs)] text-[var(--text-tertiary)]">{extra}</span>}
                </div>
              </td>
              <td className={cn("align-top text-right font-extrabold tabular-nums whitespace-nowrap", tipo.monto)}>
                {montoConSigno(m.monto, tipo.signo, moneda)}
              </td>
              <td className="align-top text-right tabular-nums whitespace-nowrap text-[var(--text-secondary)]">
                {montoEnMoneda(m.saldoPosterior, moneda)}
              </td>
            </tr>
          );
        })}
      </tbody>
    </DataTable>
  );
}
