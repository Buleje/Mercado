"use client";

import { Kicker } from "@buleje/design-system";
import { ArrowDown, ArrowUp, History, Printer } from "@buleje/design-system/icons";
import { htmlReporteDeCaja } from "@/lib/caja/reporte-impreso";
import { origenDeMovimiento } from "@/lib/caja/origen-movimiento";
import { formatCurrency, formatDateLong, formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { esCierreAutomatico } from "@/lib/caja/arqueo-veredicto";
import { MarcoModalCaja } from "./MarcoModalCaja";
import { CajaCuadreDelDia } from "./CajaCuadreDelDia";
import { useTenant } from "@/contexts/tenant-context";
import { useParteDelDia } from "./use-parte-del-dia";
import { abrirHojaImpresa } from "./acciones-parte";
import { COLOR_SIGNO, fmt, fmtDate, MOVEMENT_COLORS, signoDe, type CashRegister } from "./tipos";

const PAY_LABELS: Record<string, string> = { efectivo: "Efectivo", yape: "Yape", plin: "Plin", tarjeta: "Tarjeta" };

/** Detalle de una caja del historial, con su parte (de dónde vino y cuadre con ventas). */
export function ModalDetalleCaja({ caja, onCerrar }: { caja: CashRegister; onCerrar: () => void }) {
  const { branding } = useTenant();
  const { parte, cargando, error, releer } = useParteDelDia(caja.id, caja.id);
  const ventas = caja.movements.filter((m) => m.type === "venta");
  const porMedio: Record<string, { total: number; n: number }> = {};
  for (const s of ventas) {
    const p = (porMedio[s.method] ??= { total: 0, n: 0 });
    p.total += s.amount;
    p.n += 1;
  }
  const diferencia = caja.difference ?? 0;
  /* Cierre automático = nadie contó: la diferencia 0 no es un cuadre. */
  const sinConteo = caja.status === "cerrada" && esCierreAutomatico(caja.notes);

  /* Antes: `window.print()` imprimía la página entera del panel. Ahora sale la
     hoja del reporte de esa caja, con su parte si ya llegó. */
  const imprimir = () =>
    abrirHojaImpresa(htmlReporteDeCaja(caja, { fecha: formatDateLong(caja.closedAt ?? caja.openedAt), hora: formatTime(caja.openedAt) }, formatCurrency, parte, branding.name ?? undefined));

  return (
    <MarcoModalCaja
      claveMemoria="caja-detalle"
      titulo="Detalle de caja"
      subtitulo={`${fmtDate(caja.openedAt)} → ${caja.closedAt ? fmtDate(caja.closedAt) : "—"}`}
      icono={History}
      ancho="lg"
      onCerrar={onCerrar}
      pie={
        <button
          type="button"
          onClick={imprimir}
          className="flex-1 flex items-center justify-center gap-2 min-h-11 rounded-xl text-base font-semibold text-[var(--text-primary)] border border-[var(--rule-base)] bg-[var(--surface-raised)] hover:bg-[var(--surface-alt)] transition-colors"
        >
          <Printer className="h-5 w-5" aria-hidden /> Imprimir parte
        </button>
      }
    >
      <div className="grid grid-cols-3 gap-2 text-center">
        {(
          [
            ["Apertura", caja.openingAmount],
            ["Esperado", caja.expectedAmount ?? 0],
            ["Cierre", caja.closingAmount ?? 0],
          ] as const
        ).map(([rotulo, valor]) => (
          <div key={rotulo} className="rounded-xl bg-[var(--surface-alt)] px-2 py-2">
            <p className="text-xs font-bold text-[var(--text-tertiary)]">{rotulo}</p>
            <p className="text-sm font-extrabold tabular-nums text-[var(--text-primary)]">{fmt(valor)}</p>
          </div>
        ))}
      </div>
      <p
        className={cn(
          "rounded-xl px-3 py-2 text-center text-sm font-bold",
          sinConteo
            ? "bg-[var(--surface-sunken)] text-[var(--text-secondary)]"
            : diferencia >= 0 ? "bg-[var(--data-success-500)]/12 text-[var(--data-success-700)] dark:text-[var(--data-success-500)]" : "bg-[var(--data-error-50)] dark:bg-[var(--data-error-500)]/15 text-[var(--data-error-500)]",
        )}
      >
        {sinConteo ? "Cerrada sin conteo: nadie contó el efectivo" : <>Diferencia: {diferencia > 0 ? "+" : ""}{fmt(diferencia)}</>}
      </p>

      {Object.keys(porMedio).length > 0 && (
        <div>
          <Kicker className="libro-kicker mb-1.5">Ventas por medio</Kicker>
          <div className="flex flex-wrap gap-3 text-sm">
            {Object.entries(porMedio).map(([m, { total, n }]) => (
              <span key={m}>
                <span className="text-[var(--text-secondary)]">{PAY_LABELS[m] ?? m}:</span> <span className="font-bold text-[var(--text-primary)]">{fmt(total)}</span>{" "}
                <span className="text-[var(--text-tertiary)]">({n})</span>
              </span>
            ))}
          </div>
        </div>
      )}

      <CajaCuadreDelDia parte={parte} cargando={cargando} error={error} onReintentar={() => void releer()} compacto />

      <div>
        <Kicker className="libro-kicker mb-1.5">Movimientos · {caja.movements.length}</Kicker>
        <ul className="divide-y divide-[var(--rule-soft)] rounded-xl border border-[var(--rule-soft)]">
          {caja.movements.map((m) => {
            const signo = signoDe(m.type);
            const suma = signo === 1;
            return (
              <li key={m.id} className="px-3 py-2 flex items-center gap-3">
                <span className={cn("h-7 w-7 rounded-lg flex items-center justify-center shrink-0", MOVEMENT_COLORS[m.type] || "bg-[var(--surface-sunken)] text-[var(--text-secondary)]")}>
                  {suma ? <ArrowUp className="h-4 w-4" aria-hidden /> : <ArrowDown className="h-4 w-4" aria-hidden />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-[var(--text-primary)]">{origenDeMovimiento(m).etiqueta}</span>
                  <span className="block truncate text-xs text-[var(--text-tertiary)]">{m.description}</span>
                </span>
                <span className={cn("text-sm font-bold tabular-nums shrink-0", COLOR_SIGNO[signo])}>
                  {signo === 1 ? "+" : signo === -1 ? "−" : ""}
                  {fmt(m.amount)}
                </span>
                <span className="hidden sm:inline text-xs text-[var(--text-tertiary)] shrink-0">{fmtDate(m.createdAt)}</span>
              </li>
            );
          })}
        </ul>
      </div>
    </MarcoModalCaja>
  );
}
