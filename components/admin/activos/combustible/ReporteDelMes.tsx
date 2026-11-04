"use client";

/**
 * El reporte del mes (lo que se imprime para SUNAT): el balance que tiene que
 * cerrar (saldo inicial + compras − consumo ± conteos = saldo final), el
 * consumo por máquina con su gal/h y las alertas. Baja en PDF o Excel.
 */

import { useState } from "react";
import { AlertTriangle, CheckCircle, FileDown, FileSpreadsheet, Loader2 } from "@buleje/design-system/icons";
import { CardTitle, DataTable } from "@buleje/design-system";
import { toast } from "sonner";
import { logger } from "@/lib/logger";
import type { ReporteMes } from "@/lib/combustible/cuaderno";
import { cn } from "@/lib/utils";
import { SECUNDARIO, TONO_TEXTO, gal, num1, soles } from "./compartido";

function Fila({ etiqueta, valor, fuerte = false }: { etiqueta: string; valor: string; fuerte?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-[var(--rule-soft)] py-1.5 last:border-0">
      <span className="text-sm text-[var(--text-secondary)]">{etiqueta}</span>
      <span className={cn("tabular-nums text-sm", fuerte ? "font-extrabold text-[var(--text-primary)]" : "font-semibold text-[var(--text-primary)]")}>{valor}</span>
    </div>
  );
}

export default function ReporteDelMes({ rep }: { rep: ReporteMes | null }) {
  const [bajando, setBajando] = useState<"pdf" | "excel" | null>(null);
  if (!rep) return null;

  const bajar = async (tipo: "pdf" | "excel") => {
    setBajando(tipo);
    try {
      const m = await import("@/lib/combustible/reporte-export");
      if (tipo === "pdf") await m.descargarReportePdf(rep);
      else await m.descargarReporteExcel(rep);
    } catch (err) {
      logger.error("[combustible] reporte failed", { tipo, error: String(err) });
      toast.error("No se pudo armar el reporte");
    } finally {
      setBajando(null);
    }
  };

  return (
    <div className="space-y-4" data-combustible-reporte>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={SECUNDARIO} onClick={() => void bajar("pdf")} disabled={bajando !== null} data-bajar-pdf>
          {bajando === "pdf" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <FileDown className="h-4 w-4" aria-hidden />} Bajar PDF de {rep.titulo}
        </button>
        <button type="button" className={SECUNDARIO} onClick={() => void bajar("excel")} disabled={bajando !== null}>
          {bajando === "excel" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <FileSpreadsheet className="h-4 w-4" aria-hidden />} Excel
        </button>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4">
          <CardTitle className="mb-2">Balance de {rep.titulo}</CardTitle>
          <Fila etiqueta="Saldo inicial" valor={`${gal(rep.saldoInicial.gal)} · ${rep.saldoInicial.cil} cil.`} />
          <Fila etiqueta={`Compras (${rep.compras.length})`} valor={`+ ${gal(rep.totalCompras.gal)} · ${rep.totalCompras.cil} cil. · ${soles(rep.totalCompras.monto)}`} />
          {rep.totalInicial > 0 && <Fila etiqueta="Stock inicial anotado" valor={`+ ${gal(rep.totalInicial)}`} />}
          <Fila etiqueta={`Consumo (${rep.vales.length} vales)`} valor={`− ${gal(rep.totalConsumo)}`} />
          <Fila etiqueta={`Diferencias de conteo (${rep.conteos.length})`} valor={`${rep.totalDiferencias >= 0 ? "+" : "−"} ${gal(Math.abs(rep.totalDiferencias))}`} />
          <Fila etiqueta="Saldo final" valor={`${gal(rep.saldoFinal.gal)} · ${rep.saldoFinal.cil} cil.`} fuerte />
          <p className={cn("mt-2 flex items-center gap-1.5 text-sm font-bold", rep.cuadra ? "text-[var(--text-secondary)]" : TONO_TEXTO.error)}>
            {rep.cuadra ? <CheckCircle className="h-4 w-4" aria-hidden /> : <AlertTriangle className="h-4 w-4" aria-hidden />}
            {rep.cuadra ? "El balance cierra." : "El balance NO cierra: revisar el cuaderno."}
          </p>
        </section>

        <section className="rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4">
          <CardTitle className="mb-2">Año {rep.anio} contra lo inscrito</CardTitle>
          <Fila etiqueta="Comprado en el año" valor={gal(rep.acumuladoAnio.comprasGal)} />
          <Fila etiqueta="Gastado en el año" valor={gal(rep.acumuladoAnio.consumoGal)} />
          <Fila etiqueta="Cupo inscrito" valor={rep.acumuladoAnio.cupo != null ? gal(rep.acumuladoAnio.cupo) : "Sin declarar"} />
          <Fila etiqueta="Queda del cupo" valor={rep.acumuladoAnio.restante != null ? `${gal(rep.acumuladoAnio.restante)} (${num1(100 - (rep.acumuladoAnio.pct ?? 0))} %)` : "—"} fuerte />
          <Fila etiqueta={`Proyección de ${rep.titulo.split(" ")[0]}`} valor={rep.proyeccionGal != null ? gal(rep.proyeccionGal) : "Sin declarar"} />
        </section>
      </div>

      <section>
        <CardTitle className="mb-2">Consumo por máquina</CardTitle>
        <DataTable className="min-w-[560px]">
          <thead>
            <tr>
              <th>Máquina</th>
              <th className="text-right">Vales</th>
              <th className="text-right">Galones</th>
              <th className="text-right">Horas</th>
              <th className="text-right">Gal/h</th>
              <th className="text-right">Meta</th>
            </tr>
          </thead>
          <tbody>
            {rep.consumo.length === 0 ? (
              <tr><td colSpan={6} className="text-center text-[var(--text-tertiary)]">Sin máquinas</td></tr>
            ) : rep.consumo.map((m) => (
              <tr key={m.maquinaId}>
                <td>
                  <span className="font-semibold">{m.maquina}</span>
                  {m.placa && <span className="block font-mono text-xs text-[var(--text-tertiary)]">{m.placa}</span>}
                </td>
                <td className="text-right tabular-nums">{m.vales}</td>
                <td className="text-right tabular-nums font-semibold">{gal(m.galones)}</td>
                <td className="text-right tabular-nums">{m.horas > 0 ? num1(m.horas) : "—"}</td>
                <td className={cn("text-right tabular-nums", m.sobreMeta && cn("font-bold", TONO_TEXTO.aviso))}>{m.galPorHora != null ? num1(m.galPorHora) : "—"}</td>
                <td className="text-right tabular-nums">{m.meta != null ? num1(m.meta) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      </section>

      <section>
        <CardTitle className="mb-2">Alertas</CardTitle>
        {rep.alertas.length === 0 ? (
          <p className="text-sm text-[var(--text-secondary)]">Sin alertas en el mes.</p>
        ) : (
          <ul className="space-y-1.5">
            {rep.alertas.map((a) => (
              <li key={a} className={cn("flex items-start gap-2 text-sm font-semibold", TONO_TEXTO.aviso)}>
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {a}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
