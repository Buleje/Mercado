"use client";

/**
 * Los movimientos de Cuentas agrupados por día. Desde 640 px, una tabla (Hora ·
 * Tipo · Persona · Detalle · Monto) con el embudo de Excel en cada cabecera y el
 * día como fila de encabezado en UNA celda con flex. En el celular NO hay tabla:
 * una lista donde el detalle va debajo de la persona (la tabla en tarjetas del
 * panel partía la fila del día en dos celdas y creaba una columna fantasma).
 */
import { Fragment } from "react";
import { DataTable } from "@buleje/design-system";
import { formatCurrency } from "@/lib/format";
import { diaConNombre } from "@/lib/gastos/lista-gastos";
import { FiltroEnCabecera, SinCoincidenciasFila, type FiltrosTabla } from "@/components/admin/forestal/filtros-tabla-forestal";
import { GRUPOS, agruparPorDia, type DiaDeCuentas, type FilaCuenta } from "./cuentas-agrupado";

const montoTexto = (f: FilaCuenta) => (f.moneda === "PEN" ? formatCurrency(f.monto) : `${f.moneda} ${f.monto.toFixed(2)}`);
const signo = (f: FilaCuenta) => (GRUPOS[f.grupo].entra ? "+" : "−");

function ResumenDelDia({ d }: { d: DiaDeCuentas }) {
  return (
    <span className="text-sm font-semibold tabular-nums text-[var(--text-secondary)]">
      {d.entra > 0 && <>entra <span className="text-[var(--data-success-ink)]">{formatCurrency(d.entra)}</span></>}
      {d.entra > 0 && d.sale > 0 && " · "}
      {d.sale > 0 && <>sale <span className="text-[var(--text-primary)]">{formatCurrency(d.sale)}</span></>}
    </span>
  );
}

function Tipo({ f }: { f: FilaCuenta }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${GRUPOS[f.grupo].punto}`} aria-hidden />
      <span className={`font-semibold ${GRUPOS[f.grupo].texto}`}>{f.tipo}</span>
    </span>
  );
}

function ListaCelular({ dias }: { dias: DiaDeCuentas[] }) {
  return (
    <div className="space-y-4" data-testid="cuentas-lista-celular">
      {dias.map((d) => (
        <section key={d.dia} aria-label={diaConNombre(d.dia)} className="overflow-hidden rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)]">
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 bg-[var(--surface-sunken)] px-3 py-2">
            <span className="font-bold text-[var(--text-primary)]">{diaConNombre(d.dia)}</span>
            <ResumenDelDia d={d} />
          </div>
          <ul className="divide-y divide-[var(--rule-soft)]">
            {d.filas.map((f) => (
              <li key={f.id} className="flex items-start justify-between gap-3 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 text-sm">
                    <Tipo f={f} />
                    {f.hora && <span className="tabular-nums text-[var(--text-tertiary)]">{f.hora}</span>}
                  </div>
                  {f.persona && <p className="break-words font-semibold text-[var(--text-primary)]">{f.persona}</p>}
                  {f.detalle && <p className="break-words text-sm text-[var(--text-secondary)]">{f.detalle}</p>}
                </div>
                <span className={`shrink-0 whitespace-nowrap font-extrabold tabular-nums ${GRUPOS[f.grupo].texto}`}>
                  {signo(f)}{montoTexto(f)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function TablaEscritorio({ dias, f }: { dias: DiaDeCuentas[]; f: FiltrosTabla<FilaCuenta> }) {
  return (
    <div className="max-h-[36rem] overflow-auto rounded-xl">
      <DataTable>
        <thead className="sticky top-0 z-10 [&_th]:align-top">
          <tr>
            <th>Hora</th>
            <th>Tipo<FiltroEnCabecera id="tipo" f={f} compacto /></th>
            <th>Persona<FiltroEnCabecera id="persona" f={f} compacto /></th>
            <th>Detalle<FiltroEnCabecera id="detalle" f={f} compacto /></th>
            <th className="text-right">Monto<FiltroEnCabecera id="monto" f={f} compacto /></th>
          </tr>
        </thead>
        <tbody>
          {dias.length === 0 && <SinCoincidenciasFila colSpan={5} />}
          {dias.map((d) => (
            <Fragment key={d.dia}>
              <tr className="bg-[var(--surface-sunken)]">
                <td colSpan={5}>
                  <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                    <span className="font-bold text-[var(--text-primary)]">{diaConNombre(d.dia)}</span>
                    <ResumenDelDia d={d} />
                  </div>
                </td>
              </tr>
              {d.filas.map((r) => (
                <tr key={r.id}>
                  <td className="whitespace-nowrap tabular-nums text-[var(--text-secondary)]">{r.hora || "—"}</td>
                  <td className="whitespace-nowrap"><Tipo f={r} /></td>
                  <td className="font-semibold">{r.persona || "—"}</td>
                  <td className="text-[var(--text-secondary)]">{r.detalle || "—"}</td>
                  <td className={`whitespace-nowrap text-right font-extrabold tabular-nums ${GRUPOS[r.grupo].texto}`}>
                    {signo(r)}{montoTexto(r)}
                  </td>
                </tr>
              ))}
            </Fragment>
          ))}
        </tbody>
      </DataTable>
    </div>
  );
}

export function TablaDeCuentas({ filtros, celular }: { filtros: FiltrosTabla<FilaCuenta>; celular: boolean }) {
  const dias = agruparPorDia(filtros.filtradas);
  return celular ? <ListaCelular dias={dias} /> : <TablaEscritorio dias={dias} f={filtros} />;
}
