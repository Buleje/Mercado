"use client";

/**
 * Las cuentas del contrato: lo que salió y lo que debería volver (ADR-421).
 *
 * Dos tablas con la MISMA forma —concepto, documentos, volumen, plata— porque
 * son la misma pregunta mirada de los dos lados. Cada bloque cierra con su
 * total, y el total es la suma de las filas que están arriba: una cifra que no
 * cierra con las de al lado obliga a rehacer la cuenta a mano.
 *
 * Nada se calcula acá salvo esa suma visible: los montos llegan del balance del
 * servidor y los derivados (egresos, por recuperar) de `resumirBalance()`.
 */

import { AlertTriangle } from "@buleje/design-system/icons";
import { BlockTitle, DataTable } from "@buleje/design-system";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import type { BalanceContrato, resumirBalance } from "@/lib/forestal/contratos";
import { documentos as docs, hayEgresosImputados, hayMovimiento, soles } from "./contratos-ui";

/** Una línea de la cuenta. `monto: null` = no se puede saber, no «cero». */
export interface FilaCuenta {
  clave: string;
  concepto: string;
  /** Qué significa la fila, en una línea. */
  ayuda?: string;
  documentos: number;
  m3?: number | null;
  monto: number | null;
  /** Aviso propio de la fila (ej. ingresos sin precio). */
  alerta?: string;
}

/* `DataTable` ya pone padding, tipografía de cabecera y separadores: sus
   variantes descendientes (`[&_tbody_td]:px-3`) le ganan por especificidad a lo
   que se ponga en el hijo. Acá sólo queda lo que el DS deja pasar: alineación,
   color y la mono de la plata. */
const TD = "text-[var(--text-secondary)]";
const NUM = "whitespace-nowrap text-right font-mono tabular-nums";

function TablaCuenta({
  titulo,
  ayuda,
  filas,
  totalLabel,
  total,
  mostrarM3 = false,
}: {
  titulo: string;
  ayuda: string;
  filas: FilaCuenta[];
  totalLabel: string;
  total: number | null;
  mostrarM3?: boolean;
}) {
  return (
    <section className="rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)]">
      <header className="border-b border-[var(--rule-soft)] px-4 py-3">
        <BlockTitle as="h3">{titulo}</BlockTitle>
        <p className="mt-0.5 text-sm text-[var(--text-secondary)]">{ayuda}</p>
      </header>

      {/* ── Escritorio (≥640px) ── */}
      <DataTable wrapperClassName="hidden rounded-none border-0 sm:block">
        <thead>
          <tr>
            <th scope="col">Concepto</th>
            <th scope="col" className="text-right">
              Documentos
            </th>
            {mostrarM3 && (
              <th scope="col" className="text-right">
                m³
              </th>
            )}
            <th scope="col" className="text-right">
              Soles
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--rule-soft)]">
          {filas.map((f) => (
            <tr key={f.clave}>
              <td className={TD}>
                <span className="font-semibold text-[var(--text-primary)]">{f.concepto}</span>
                {f.ayuda && (
                  <span className="block text-xs text-[var(--text-tertiary)]">{f.ayuda}</span>
                )}
                {f.alerta && (
                  <span className="mt-1 inline-flex items-center gap-1 text-xs font-bold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    {f.alerta}
                  </span>
                )}
              </td>
              <td className={NUM}>{f.documentos > 0 ? f.documentos : "—"}</td>
              {mostrarM3 && <td className={NUM}>{f.m3 != null && f.m3 > 0 ? fmtM3(f.m3) : "—"}</td>}
              <td className={`${NUM} font-bold text-[var(--text-primary)]`}>{soles(f.monto)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-[var(--rule-base)] bg-[var(--surface-sunken)]">
            <td className={`${TD} font-bold uppercase tracking-wide text-[var(--text-primary)]`}>
              {totalLabel}
            </td>
            <td className={NUM} />
            {mostrarM3 && <td className={NUM} />}
            <td className={`${NUM} text-base font-extrabold text-[var(--text-primary)]`}>
              {soles(total)}
            </td>
          </tr>
        </tfoot>
      </DataTable>

      {/* ── Mobile (<640px): una tarjeta por concepto ── */}
      <ul className="divide-y divide-[var(--rule-soft)] sm:hidden">
        {filas.map((f) => (
          <li key={f.clave} className="flex items-start justify-between gap-3 px-4 py-3">
            <div className="min-w-0">
              <p className="text-sm font-bold text-[var(--text-primary)]">{f.concepto}</p>
              <p className="text-xs text-[var(--text-tertiary)]">
                {/* «0 documentos» y «—» en la misma tarjeta se contradicen: si no
                    hay nada registrado, se dice una sola vez y con palabras. */}
                {f.documentos > 0 ? docs(f.documentos) : "Sin registros"}
                {mostrarM3 && f.m3 != null && f.m3 > 0 ? ` · ${fmtM3(f.m3)} m³` : ""}
              </p>
              {f.alerta && (
                <p className="mt-1 flex items-center gap-1 text-xs font-bold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  {f.alerta}
                </p>
              )}
            </div>
            <span className="shrink-0 font-mono text-sm font-bold tabular-nums text-[var(--text-primary)]">
              {soles(f.monto)}
            </span>
          </li>
        ))}
        <li className="flex items-center justify-between gap-3 bg-[var(--surface-sunken)] px-4 py-3">
          <span className="text-sm font-bold uppercase tracking-wide text-[var(--text-primary)]">
            {totalLabel}
          </span>
          <span className="font-mono text-base font-extrabold tabular-nums text-[var(--text-primary)]">
            {soles(total)}
          </span>
        </li>
      </ul>
    </section>
  );
}

export default function CtpContratoCuentas({
  balance,
  resumen,
}: {
  balance: BalanceContrato;
  resumen: ReturnType<typeof resumirBalance>;
}) {
  const m = balance.madera;
  /** Ningún ingreso tiene precio: la suma es 0 porque nadie la cargó, no
   *  porque la madera haya salido gratis. Ese 0 se muestra como «—». */
  const todoSinPrecio = m.documentos > 0 && (m.sinValorizar ?? 0) >= m.documentos;

  /** Un bloque sin documentos no vale «S/ 0»: vale «nada imputado acá». */
  const montoDe = (b: { documentos: number; monto: number }): number | null =>
    b.documentos > 0 ? b.monto : null;

  const egresos: FilaCuenta[] = [
    {
      clave: "madera",
      concepto: "Madera recibida",
      ayuda: "Lo que amparó el permiso, por guía de ingreso",
      documentos: m.documentos,
      m3: m.m3 ?? 0,
      monto: todoSinPrecio ? null : m.monto,
      alerta:
        (m.sinValorizar ?? 0) > 0
          ? `${m.sinValorizar} de ${m.documentos} ingresos sin precio cargado`
          : undefined,
    },
    {
      clave: "gastos",
      concepto: "Gastos",
      ayuda: "Lo gastado bajo este contrato",
      documentos: balance.gastos.documentos,
      monto: montoDe(balance.gastos),
    },
    {
      clave: "fletes",
      concepto: "Fletes",
      ayuda: "Lo que costó traer la madera",
      documentos: balance.fletes.documentos,
      monto: montoDe(balance.fletes),
    },
    {
      clave: "adelantos",
      concepto: "Adelantos entregados",
      ayuda: "Plata puesta antes de recibir la madera",
      documentos: balance.adelantos.documentos,
      monto: montoDe(balance.adelantos),
    },
  ];

  const porVolver: FilaCuenta[] = [
    {
      clave: "adelantos-saldo",
      concepto: "Saldo de adelantos",
      ayuda: "Del adelanto entregado, lo que todavía no volvió en madera",
      documentos: balance.adelantos.documentos,
      monto: balance.adelantos.documentos > 0 ? balance.adelantosSaldo : null,
    },
    {
      clave: "cuenta-cargos",
      concepto: "Cargos en cuenta corriente",
      ayuda: "Lo que las partes deben bajo este contrato",
      documentos: balance.cuentaCargos.documentos,
      monto: montoDe(balance.cuentaCargos),
    },
    {
      clave: "cuenta-abonos",
      concepto: "Abonos en cuenta corriente",
      ayuda: "Lo que ya pagaron o devolvieron (resta)",
      documentos: balance.cuentaAbonos.documentos,
      monto: balance.cuentaAbonos.documentos > 0 ? -balance.cuentaAbonos.monto : null,
    },
  ];

  return (
    <div className="grid items-start gap-4 lg:grid-cols-2">
      <TablaCuenta
        titulo="Lo que salió"
        ayuda="La plata efectivamente puesta bajo este contrato. La producción no suma acá: es la misma madera transformada."
        filas={egresos}
        totalLabel="Egresos"
        total={hayEgresosImputados(balance) ? resumen.egresos : null}
        mostrarM3
      />
      <TablaCuenta
        titulo="Lo que debería volver"
        ayuda="Madera que el habilitado todavía no entregó, más lo que las partes deben en la cuenta corriente."
        filas={porVolver}
        totalLabel="Por recuperar"
        total={
          hayMovimiento(balance.adelantos, balance.cuentaCargos, balance.cuentaAbonos)
            ? resumen.porRecuperar
            : null
        }
      />
    </div>
  );
}
