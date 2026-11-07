"use client";

/**
 * IDEA 3: conciliación Yape/Plin — Yape-a-Yape. Comparas lo que la caja dice
 * que vendiste por Yape (o Plin) con el saldo que ves en tu app. Las últimas
 * conciliaciones quedan en este navegador (`buleje-concil-history`).
 */
import { useMemo, useState } from "react";
import { CardTitle } from "@buleje/design-system";
import { AlertTriangle, Smartphone } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { button } from "@/components/ui-system/button-variants";
import { formatCurrency, formatDateShort, formatTime } from "@/lib/format";
import { cobrosDigitalesParaRevisar, type MovimientoParaRevisar } from "@/lib/caja/cobros-para-revisar";
import { cn } from "@/lib/utils";
import { fmt } from "./tipos";

interface Conciliacion {
  fecha: string;
  ventasDigital: number;
  saldoApp: number;
  diferencia: number;
  metodo: string;
}

export function ConciliacionYapePlin({
  breakdown,
  movimientos,
}: {
  breakdown: Record<string, number>;
  /** Movimientos de la caja abierta: para marcar cobros repetidos (M29). */
  movimientos?: ReadonlyArray<MovimientoParaRevisar>;
}) {
  const [tab, setTab] = useState<"yape" | "plin">(breakdown["yape"] ? "yape" : "plin");
  const revisar = useMemo(() => cobrosDigitalesParaRevisar(movimientos ?? [], tab), [movimientos, tab]);
  const [monto, setMonto] = useState("");
  const [historial, setHistorial] = useState<Conciliacion[]>(() => {
    try {
      const raw = localStorage.getItem("buleje-concil-history");
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });

  const ventasDigital = breakdown[tab] ?? 0;
  const saldo = Number(monto) || 0;
  const diferencia = saldo - ventasDigital;
  const cuadra = monto ? Math.abs(diferencia) <= 5 : false;

  const anotar = () => {
    if (!monto) return;
    const nuevo = [{ fecha: new Date().toISOString(), ventasDigital, saldoApp: saldo, diferencia, metodo: tab }, ...historial].slice(0, 5);
    setHistorial(nuevo);
    try {
      localStorage.setItem("buleje-concil-history", JSON.stringify(nuevo));
    } catch {
      /* almacenamiento lleno: la conciliación igual se ve en pantalla */
    }
    setMonto("");
  };

  return (
    <section className="rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4">
      <div className="mb-3 flex items-center gap-1.5">
        <Smartphone className="h-4 w-4 text-[var(--text-secondary)]" aria-hidden />
        <CardTitle className="text-sm font-bold text-[var(--text-primary)]">Conciliación digital</CardTitle>
        <InfoTip
          what="Compara lo vendido por Yape o Plin según la caja con el saldo que ves en tu app. Hasta S/ 5 de diferencia se toma como que cuadra."
          affects="Que cuadre el total no verifica cada cobro: un Yape anotado dos veces y otro que falta se compensan. Por eso los repetidos salen aparte, para revisar."
          example="La caja dice S/ 120 por Yape y tu app muestra S/ 120: el total cuadra."
        />
      </div>
      <div className="flex gap-1 mb-3">
        {(["yape", "plin"] as const)
          .filter((m) => breakdown[m])
          .map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={tab === m}
              onClick={() => {
                setTab(m);
                setMonto("");
              }}
              className={cn("px-4 min-h-12 rounded-xl border text-sm font-bold transition-colors capitalize", tab === m ? "border-primary bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]" : "border-transparent bg-[var(--surface-sunken)] text-[var(--text-secondary)]")}
            >
              {m}
            </button>
          ))}
      </div>
      <div className="flex flex-wrap items-end gap-3 mb-3">
        <div className="flex-1">
          <p className="text-sm font-semibold text-[var(--text-secondary)] mb-1">Ventas {tab} hoy</p>
          <p className="text-xl font-extrabold font-mono text-[var(--text-primary)]">{fmt(ventasDigital)}</p>
        </div>
        <label className="flex-1">
          <span className="block text-sm font-semibold text-[var(--text-secondary)] mb-1">Saldo en tu app</span>
          <span className="flex items-center gap-1">
            <span className="text-sm text-[var(--text-secondary)]">S/</span>
            <input
              type="number"
              inputMode="decimal"
              value={monto}
              onChange={(e) => setMonto(e.target.value)}
              placeholder="0.00"
              step="0.50"
              className="w-28 px-2 min-h-12 rounded-xl border border-[var(--rule-base)] text-sm font-mono text-right bg-[var(--surface-raised)] text-[var(--text-primary)] outline-none focus:border-primary"
            />
          </span>
        </label>
      </div>
      {revisar.length > 0 && (
        <div data-qa="cobros-para-revisar" className="mb-3 rounded-xl border border-[var(--data-warning-500)]/40 bg-[var(--data-warning-500)]/10 p-3">
          <p className="mb-1 flex items-center gap-1.5 text-sm font-bold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
            <AlertTriangle className="h-4 w-4" aria-hidden /> Para revisar ({revisar.length})
            <InfoTip
              what="Cobros que parecen el mismo anotado dos veces. Nada se borra solo: búscalo en tu app y, si sobra, anota el egreso o la corrección."
              example="La misma venta entró dos veces a la caja; o dos ingresos por Plin de S/ 50 «Pago de Rosa» con 10 min de diferencia."
            />
          </p>
          <ul className="space-y-0.5 text-sm text-[var(--text-primary)]">
            {revisar.map((r) => (
              <li key={r.clave}>
                {r.motivo === "misma-venta" ? "La misma venta entró" : "Ingreso a mano repetido"} {r.movimientos.length} veces ·{" "}
                <span className="font-semibold tabular-nums">{formatCurrency(r.monto)}</span> · {r.movimientos.map((m) => formatTime(m.createdAt)).join(", ")}
                {r.movimientos[0].description ? ` · ${r.movimientos[0].description}` : ""}
              </li>
            ))}
          </ul>
        </div>
      )}
      {monto && (
        <div className={cn("rounded-lg p-3 mb-3 text-center", cuadra ? "bg-primary/10" : "bg-[var(--data-warning-500)]/10")}>
          <p className={cn("text-sm font-bold", cuadra ? "text-[var(--data-success-700)] dark:text-[var(--data-success-500)]" : "text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]")}>
            {cuadra
              ? `El total cuadra${diferencia !== 0 ? ` (dif. ${formatCurrency(diferencia)})` : ""}${revisar.length > 0 ? ` · revisa ${revisar.length === 1 ? "1 cobro repetido" : `${revisar.length} cobros repetidos`}` : ""}`
              : `Diferencia de ${formatCurrency(Math.abs(diferencia))} — ${diferencia > 0 ? "sobrante" : "revisa si hay transferencias personales"}`}
          </p>
          <button type="button" onClick={anotar} className={button({ variant: "primary", className: "mt-2 rounded-xl" })}>
            Anotar conciliación
          </button>
        </div>
      )}
      {historial.length > 0 && (
        <div className="border-t border-[var(--rule-soft)] pt-2 mt-2 space-y-1">
          <p className="text-sm font-semibold text-[var(--text-secondary)]">Últimas conciliaciones</p>
          {historial.slice(0, 3).map((h) => (
            <div key={h.fecha} className="flex items-center justify-between text-sm">
              <span className="text-[var(--text-secondary)]">
                {(() => {
                  try {
                    return formatDateShort(h.fecha);
                  } catch {
                    return "";
                  }
                })()}{" "}
                · <span className="capitalize font-medium">{h.metodo}</span>
              </span>
              <span className={cn("font-bold", Math.abs(h.diferencia) <= 5 ? "text-[var(--data-success-700)] dark:text-[var(--data-success-500)]" : "text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]")}>
                {h.diferencia >= 0 ? "+" : "−"}{formatCurrency(Math.abs(Number(h.diferencia)))}
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
