"use client";

/**
 * Lo que entró y salió de las cuentas, lo más nuevo arriba.
 *
 * Una transferencia son DOS filas —sale de una cuenta y entra en otra— porque
 * cada una mueve el saldo de SU cuenta, y la columna «Saldo después» sólo se
 * entiende así. La nota que escribió quien la hizo («reponer caja chica») vive
 * en la transferencia, no en el movimiento: se cruza por `referencia`.
 */

import { useMemo } from "react";
import { DataTable } from "@buleje/design-system";
import { cn, limaDateKey } from "@/lib/utils";
import { diaConNombre } from "@/lib/gastos/lista-gastos";
import { horaDeLima } from "@/lib/camaras/resumen";
import { montoEnMoneda } from "@/lib/adelantos/cuenta-unificada";
import type { MovimientoTesoreria } from "@/hooks/use-tesoreria";
import {
  BarraFiltrosTabla,
  FiltroEnCabecera,
  SinCoincidenciasFila,
  useFiltrosTabla,
  type ColumnaFiltro,
} from "@/components/admin/forestal/filtros-tabla-forestal";
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

const ddmm = (v: number | string) => String(v).split("-").reverse().slice(0, 2).join("/");

export default function MovimientosTesoreria({ movimientos, monedaDe, notaDe, conCuenta }: Props) {
  /* Autofiltro de Excel en cada título (25-10). Los 100 movimientos ya están
     cargados (no hay páginas del servidor), así que filtrar aquí no miente. */
  const columnas = useMemo<ColumnaFiltro<MovimientoTesoreria>[]>(
    () => [
      { id: "cuando", label: "Cuándo", tipo: "fecha", numero: (m) => limaDateKey(m.createdAt) || null, formatearValor: ddmm },
      { id: "cuenta", label: "Cuenta", tipo: "multi", valor: (m) => m.cuentaNombre ?? "—", visible: conCuenta },
      { id: "tipo", label: "Tipo", tipo: "multi", valor: (m) => tipoDeMovimiento(m.tipo).label },
      {
        id: "que",
        label: "Qué pasó",
        tipo: "texto",
        valor: (m) => [m.descripcion, origenLegible(m.origen), m.categoria, m.referencia, m.origen === "TRANSFERENCIA" ? notaDe(m.referencia) : null].filter((x): x is string => !!x),
      },
      { id: "monto", label: "Monto", tipo: "rango", numero: (m) => m.monto, paso: 1 },
      { id: "saldo", label: "Saldo después", tipo: "rango", numero: (m) => m.saldoPosterior, paso: 1 },
    ],
    [conCuenta, notaDe],
  );
  const f = useFiltrosTabla(movimientos, columnas);
  return (
    <>
    <BarraFiltrosTabla f={f} />
    <DataTable zebra>
      <thead>
        <tr>
          <th>Cuándo<FiltroEnCabecera id="cuando" f={f} compacto /></th>
          {conCuenta && <th>Cuenta<FiltroEnCabecera id="cuenta" f={f} compacto /></th>}
          <th>Qué pasó<FiltroEnCabecera id="tipo" f={f} compacto /><FiltroEnCabecera id="que" f={f} compacto /></th>
          <th className="text-right">Monto<FiltroEnCabecera id="monto" f={f} compacto /></th>
          <th className="text-right">Saldo después<FiltroEnCabecera id="saldo" f={f} compacto /></th>
        </tr>
      </thead>
      <tbody>
        {f.filtradas.length === 0 && <SinCoincidenciasFila colSpan={conCuenta ? 5 : 4} />}
        {f.filtradas.map((m) => {
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
              <td className="align-top whitespace-nowrap tabular-nums">{diaConNombre(limaDateKey(m.createdAt))} · {horaDeLima(m.createdAt)}</td>
              {conCuenta && <td className="align-top">{m.cuentaNombre ?? "—"}</td>}
              <td className="align-top">
                {/* UN solo hijo: en el celular la celda es una fila flex y
                    varios hijos sueltos se pisaban. */}
                <div className="min-w-0">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className={cn("inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-1 text-sm font-bold", tipo.chip)}>
                      <Icon className="h-3.5 w-3.5" aria-hidden="true" />{tipo.label}
                    </span>
                    <span className="font-medium text-[var(--text-primary)]">{m.descripcion || tipo.label}</span>
                  </span>
                  {extra && <span className="mt-0.5 block text-sm text-[var(--text-tertiary)]">{extra}</span>}
                </div>
              </td>
              {/* El color dice si entró o salió: va en el texto, no en la celda. */}
              <td className="align-top text-right tabular-nums whitespace-nowrap">
                <span className={tipo.monto}>{montoConSigno(m.monto, tipo.signo, moneda)}</span>
              </td>
              <td className="align-top text-right tabular-nums whitespace-nowrap">
                {montoEnMoneda(m.saldoPosterior, moneda)}
              </td>
            </tr>
          );
        })}
      </tbody>
    </DataTable>
    </>
  );
}
