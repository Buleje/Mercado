"use client";

/**
 * El cruce del extracto con el sistema: cuatro chips (cantidad y monto, los suma
 * el servidor) y la lista del grupo elegido. Arranca en el primer grupo que pide
 * mirar algo (sólo en el banco → sólo en el sistema → con diferencia).
 */

import { useState } from "react";
import { cn, formatCurrency } from "@/lib/utils";
import type { BankRow, SystemPayment } from "@/lib/finance/bank-reconciliation";
import { CHIP, CHIP_OFF } from "@/components/admin/unified/finanzas/tesoreria/estilo";
import type { CuadreDelBanco, GrupoCuadre } from "@/components/admin/unified/finanzas/tesoreria/use-cuadrar-con-banco";

const GRUPOS: { id: GrupoCuadre; label: string; punto: string; vacio: string }[] = [
  { id: "coinciden", label: "Coinciden", punto: "bg-[var(--data-success-500)]", vacio: "Ningún movimiento del banco coincide con el sistema." },
  { id: "soloBanco", label: "Sólo en el banco", punto: "bg-[var(--data-info-500)]", vacio: "Todo lo del banco está anotado en el sistema." },
  { id: "soloSistema", label: "Sólo en el sistema", punto: "bg-[var(--data-warning-500)]", vacio: "Todo lo anotado en el sistema llegó al banco." },
  { id: "conDiferencia", label: "Con diferencia", punto: "bg-[var(--data-error-500)]", vacio: "Ningún movimiento cruzó con un monto distinto." },
];
const PRIMERO_A_MIRAR: GrupoCuadre[] = ["soloBanco", "soloSistema", "conDiferencia", "coinciden"];
const CHIP_ON = "border-[var(--accent)] bg-[var(--accent-muted)] text-[var(--text-primary)]";

/** «2026-10-15» → «15/10». */
const diaCorto = (fecha: string) => `${fecha.slice(8, 10)}/${fecha.slice(5, 7)}`;
const signo = (n: number) => (n > 0 ? `+${formatCurrency(n)}` : n < 0 ? `−${formatCurrency(-n)}` : formatCurrency(0));
const tonoMonto = (n: number) => (n < 0 ? "text-[var(--data-error-700)] dark:text-[var(--data-error-500)]" : "text-[var(--text-primary)]");

function Fila({ fecha, titulo, detalle, monto, extra }: { fecha: string; titulo: string; detalle?: string; monto: number; extra?: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3 px-4 py-3">
      <span className="w-12 shrink-0 pt-0.5 text-sm tabular-nums text-[var(--text-secondary)]">{diaCorto(fecha)}</span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-[var(--text-primary)]">{titulo || "Sin descripción"}</p>
        {detalle && <p className="truncate text-sm text-[var(--text-secondary)]">{detalle}</p>}
      </div>
      <div className="shrink-0 text-right">
        <p className={cn("text-sm font-bold tabular-nums", tonoMonto(monto))}>{signo(monto)}</p>
        {extra}
      </div>
    </li>
  );
}

const delSistema = (s: SystemPayment) => [s.method, s.description].filter(Boolean).join(" · ");
const delBanco = (b: BankRow) => (b.reference ? `N° ${b.reference}` : undefined);

export default function CuadroDelBanco({ resultado }: { resultado: CuadreDelBanco }) {
  const { resumen, grupos, periodo, banco, sistema } = resultado;
  const [grupo, setGrupo] = useState<GrupoCuadre>(() => PRIMERO_A_MIRAR.find((g) => resumen[g].cantidad > 0) ?? "coinciden");
  const activo = GRUPOS.find((g) => g.id === grupo) ?? GRUPOS[0];
  const mostradas = grupos[grupo].length;
  const total = resumen[grupo].cantidad;

  return (
    <div className="space-y-3">
      <p className="text-sm text-[var(--text-secondary)]">
        Del {diaCorto(periodo.desde)} al {diaCorto(periodo.hasta)}: {banco.movimientos} movimientos del banco y {sistema.movimientos} del sistema. No se guardó nada.
        {banco.descartadas === 1 && " 1 fila del archivo sin fecha o monto (un título o un saldo) no se leyó."}
        {banco.descartadas > 1 && ` ${banco.descartadas} filas del archivo sin fecha o monto (títulos, saldos) no se leyeron.`}
      </p>
      {sistema.recortado && (
        <p className="text-sm font-semibold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
          El sistema tiene más movimientos de los que entran en un cruce: sube un extracto más corto (un mes).
        </p>
      )}

      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Grupos del cruce">
        {GRUPOS.map((g) => (
          <button
            key={g.id}
            type="button"
            role="tab"
            aria-selected={grupo === g.id}
            onClick={() => setGrupo(g.id)}
            className={cn(CHIP, grupo === g.id ? CHIP_ON : CHIP_OFF)}
          >
            <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", g.punto)} aria-hidden="true" />
            {g.label}
            <span className="tabular-nums">{resumen[g.id].cantidad}</span>
            <span className="font-semibold tabular-nums text-[var(--text-secondary)]">
              {signo(resumen[g.id].monto)}
            </span>
          </button>
        ))}
      </div>

      {total === 0 ? (
        <p className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] px-4 py-3 text-sm font-bold text-[var(--text-secondary)]">{activo.vacio}</p>
      ) : (
        <ul role="tabpanel" aria-label={activo.label} className="divide-y divide-[var(--rule-soft)] rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)]">
          {grupo === "coinciden" &&
            grupos.coinciden.map((p, i) => (
              <Fila key={`${p.sistema.id}-${i}`} fecha={p.banco.date} titulo={p.banco.description} detalle={`Con: ${delSistema(p.sistema)} (${diaCorto(p.sistema.date)})`} monto={p.banco.amount} />
            ))}
          {grupo === "conDiferencia" &&
            grupos.conDiferencia.map((p, i) => (
              <Fila
                key={`${p.sistema.id}-${i}`}
                fecha={p.banco.date}
                titulo={p.banco.description}
                detalle={`Con: ${delSistema(p.sistema)} por ${formatCurrency(p.sistema.amount)}`}
                monto={p.banco.amount}
                extra={<p className="text-sm font-semibold tabular-nums text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">dif. {signo(p.diferencia)}</p>}
              />
            ))}
          {grupo === "soloBanco" &&
            grupos.soloBanco.map((b, i) => <Fila key={`${b.date}-${i}`} fecha={b.date} titulo={b.description} detalle={delBanco(b)} monto={b.amount} />)}
          {grupo === "soloSistema" &&
            grupos.soloSistema.map((s) => <Fila key={s.id} fecha={s.date} titulo={s.description ?? ""} detalle={s.method} monto={s.amount} />)}
        </ul>
      )}
      {mostradas < total && <p className="text-sm text-[var(--text-secondary)]">Se ven los primeros {mostradas} de {total}.</p>}
    </div>
  );
}
