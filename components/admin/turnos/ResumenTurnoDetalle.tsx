"use client";

/**
 * El cuerpo del «Resumen del turno»: ventas, medio de pago, caja, descuentos,
 * más vendidos, meta, tiempo muerto y comparativo. Movido de TurnosModule; los
 * títulos de bloque pasan a rótulo (`Kicker` + `libro-kicker`) y sin emojis.
 */
import { Kicker } from "@buleje/design-system";
import { Clock, CreditCard, DollarSign, ShoppingCart, TrendingDown, TrendingUp } from "@buleje/design-system/icons";
import { m } from "@/components/admin/providers";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import { comparativoDelTurno, diaConFecha, type Turno, type TurnoSummary } from "./tipos";

function Rotulo({ icono: Icono, children }: { icono?: typeof Clock; children: React.ReactNode }) {
  return (
    <Kicker as="h3" className="libro-kicker mb-2 flex items-center gap-1.5">
      {Icono && <Icono className="h-3.5 w-3.5" aria-hidden />}{children}
    </Kicker>
  );
}

function Fila({ izq, der, className }: { izq: React.ReactNode; der: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex justify-between text-sm", className)}>
      <span className="text-[var(--text-secondary)]">{izq}</span>
      <span className="font-bold text-[var(--text-primary)] tabular-nums">{der}</span>
    </div>
  );
}

function colorDiferencia(d: number): string {
  if (Math.abs(d) < 0.01) return "text-[var(--data-success-500)]";
  return d > 0 ? "text-[var(--data-warning-500)]" : "text-[var(--data-error-500)]";
}

/** Huecos sin ventas en medio del turno (Mejora M4). */
function huecosSinVentas(ventas: { hora: string; total: number }[]) {
  const horas = ventas.map((v) => v.hora);
  const conVentas = new Set(ventas.filter((v) => v.total > 0).map((v) => v.hora));
  const huecos: { desde: string; hasta: string; duracion: number }[] = [];
  let inicio: number | null = null;
  horas.forEach((h, i) => {
    if (!conVentas.has(h)) { if (inicio === null) inicio = i; return; }
    if (inicio !== null) { huecos.push({ desde: horas[inicio], hasta: h, duracion: i - inicio }); inicio = null; }
  });
  return huecos;
}

function Porcentaje({ pct }: { pct: number }) {
  const sube = pct >= 0;
  const Icono = sube ? TrendingUp : TrendingDown;
  return (
    <span className={cn("inline-flex items-center gap-1 font-bold tabular-nums", sube ? "text-[var(--data-success-500)]" : "text-[var(--data-error-500)]")}>
      {sube ? "+" : ""}{pct.toFixed(0)}% <Icono className="h-3.5 w-3.5" aria-hidden />
    </span>
  );
}

export function ResumenTurnoDetalle({ resumen: r, historial, metaVentas }: { resumen: TurnoSummary; historial: Turno[]; metaVentas: number }) {
  const pctDescuento = r.totalVentas > 0 ? (r.totalDescuentos / r.totalVentas) * 100 : 0;
  const superada = r.totalVentas >= metaVentas;
  const pctMeta = metaVentas > 0 ? Math.round((r.totalVentas / metaVentas) * 100) : 0;
  const huecos = r.ventasPorHora && r.ventasPorHora.length >= 2 ? huecosSinVentas(r.ventasPorHora) : null;
  const comp = comparativoDelTurno(historial, r);
  const esDeHoy = new Date(r.abrioEn).toDateString() === new Date().toDateString();

  return (
    <>
      <section className="bg-primary/10 dark:bg-primary/15 rounded-xl p-4">
        <Rotulo icono={ShoppingCart}>Ventas del turno</Rotulo>
        <div className="grid grid-cols-3 gap-3">
          {[["Total vendido", formatCurrency(r.totalVentas)], ["Ventas", String(r.cantidadVentas)], ["Ticket prom.", formatCurrency(r.ticketPromedio)]].map(([k, v]) => (
            <div key={k}>
              <p className="text-xs text-[var(--text-secondary)] font-semibold">{k}</p>
              <p className="text-lg font-extrabold text-[var(--text-primary)] tabular-nums">{v}</p>
            </div>
          ))}
        </div>
      </section>

      {r.metodosPago.length > 0 && (
        <section className="bg-[var(--surface-sunken)] rounded-xl p-4">
          <Rotulo icono={CreditCard}>Por medio de pago</Rotulo>
          <div className="space-y-1.5">
            {r.metodosPago.map((mp) => <Fila key={mp.metodo} izq={mp.metodo} der={formatCurrency(mp.total)} />)}
          </div>
        </section>
      )}

      <section className="bg-[var(--surface-sunken)] rounded-xl p-4">
        <Rotulo icono={DollarSign}>Caja</Rotulo>
        <div className="space-y-1.5">
          <Fila izq="Efectivo inicial" der={formatCurrency(r.inicioEfectivo)} />
          <Fila izq="Efectivo al cierre" der={r.cierreEfectivo == null ? "Sin conteo" : formatCurrency(r.cierreEfectivo)} />
          <div className="flex justify-between text-sm border-t border-[var(--rule-base)] pt-1.5">
            <span className="text-[var(--text-secondary)]">Diferencia</span>
            {r.diferencia == null ? (
              <span className="text-[var(--text-tertiary)]" title="Turno sin caja vinculada: no hay diferencia del servidor">—</span>
            ) : (
              <span className={cn("font-bold tabular-nums", colorDiferencia(r.diferencia))}>
                {Math.abs(r.diferencia) < 0.01 ? formatCurrency(0) : (r.diferencia > 0 ? "+" : "") + formatCurrency(r.diferencia)}
              </span>
            )}
          </div>
          <Fila
            izq="Descuentos"
            der={r.totalDescuentos > 0 ? `${formatCurrency(r.totalDescuentos)} (${pctDescuento.toFixed(1)}%)` : "Sin descuentos"}
            className={pctDescuento > 5 ? "[&>span:last-child]:text-[var(--data-error-500)]" : pctDescuento >= 2 ? "[&>span:last-child]:text-[var(--data-warning-500)]" : undefined}
          />
        </div>
      </section>

      {r.topProductos.length > 0 && (
        <section className="bg-[var(--surface-sunken)] rounded-xl p-4">
          <Rotulo icono={TrendingUp}>Más vendidos</Rotulo>
          <ol className="space-y-1.5">
            {r.topProductos.map((p, i) => (
              <li key={p.nombre} className="flex items-center gap-2 text-sm">
                <span className="text-xs font-extrabold text-[var(--text-tertiary)] w-4 text-right">{i + 1}</span>
                <span className="flex-1 text-[var(--text-secondary)] truncate">{p.nombre}</span>
                <span className="font-bold text-[var(--text-primary)] tabular-nums">x{p.cantidad}</span>
              </li>
            ))}
          </ol>
        </section>
      )}

      {superada ? (
        <m.div
          initial={{ scale: 0.8 }}
          animate={{ scale: [0.8, 1.1, 1] }}
          transition={{ duration: 0.5, times: [0, 0.6, 1] }}
          className="bg-[var(--surface-sunken)] border border-[var(--data-success-500)]/40 rounded-xl p-4 text-center"
        >
          <p className="text-xl font-extrabold text-[var(--data-success-500)] mb-1">¡Meta superada!</p>
          <p className="text-sm text-[var(--text-secondary)]">
            Meta {formatCurrency(metaVentas)} · te pasaste por <span className="font-bold text-[var(--data-success-500)]">{formatCurrency(r.totalVentas - metaVentas)}</span>
          </p>
        </m.div>
      ) : (
        <div className="bg-[var(--surface-sunken)] rounded-xl p-4 space-y-2">
          <p className="text-sm text-[var(--text-secondary)]">Meta: {formatCurrency(r.totalVentas)} de {formatCurrency(metaVentas)} ({pctMeta}%)</p>
          <div className="w-full bg-[var(--rule-soft)] rounded-full h-2.5" role="progressbar" aria-valuenow={Math.min(100, pctMeta)} aria-valuemin={0} aria-valuemax={100} aria-label="Avance de la meta">
            <div className="h-2.5 rounded-full bg-primary transition-all" style={{ width: `${Math.min(100, pctMeta)}%` }} />
          </div>
          <p className="text-xs text-[var(--text-tertiary)]">Faltaron {formatCurrency(Math.abs(r.totalVentas - metaVentas))}</p>
        </div>
      )}

      {huecos && (huecos.length === 0 ? (
        <p className="bg-primary/10 rounded-xl p-3 text-center text-xs font-bold text-[var(--data-success-500)]">Ventas constantes durante todo el turno</p>
      ) : (
        <section className="bg-[var(--data-warning-50)] dark:bg-[var(--data-warning-500)]/15 border border-[var(--data-warning-500)]/40 rounded-xl p-4 space-y-1">
          <Rotulo icono={Clock}>Tiempo muerto</Rotulo>
          {huecos.map((g) => (
            <p key={g.desde} className="text-sm text-[var(--text-primary)]">Sin ventas entre {g.desde} y {g.hasta} ({g.duracion} h)</p>
          ))}
        </section>
      ))}

      {(comp.ventasDiaAnterior > 0 || comp.prom7 > 0) && (
        <section className="bg-[var(--surface-sunken)] rounded-xl p-4">
          <Rotulo icono={TrendingUp}>Comparativo</Rotulo>
          <div className="space-y-1.5">
            {comp.ventasDiaAnterior > 0 && (
              <Fila izq={esDeHoy ? "Contra ayer" : `Contra el ${diaConFecha(comp.diaAnterior)}`} der={<Porcentaje pct={comp.pctDiaAnterior} />} />
            )}
            {comp.prom7 > 0 && <Fila izq="Contra el promedio de los 7 días previos" der={<Porcentaje pct={comp.pctProm} />} />}
          </div>
        </section>
      )}
    </>
  );
}
