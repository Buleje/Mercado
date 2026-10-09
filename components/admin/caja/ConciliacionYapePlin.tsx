"use client";

/**
 * IDEA 3: conciliación Yape/Plin — Yape-a-Yape. Comparas lo que la caja dice
 * que vendiste por Yape (o Plin) con el saldo que ves en tu app. Las últimas
 * conciliaciones quedan en este navegador (`buleje-concil-history`).
 */
import { useState } from "react";
import { Kicker } from "@buleje/design-system";
import { Smartphone } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { formatCurrency, formatDateShort } from "@/lib/format";
import { cn } from "@/lib/utils";
import { fmt } from "./tipos";

interface Conciliacion {
  fecha: string;
  ventasDigital: number;
  saldoApp: number;
  diferencia: number;
  metodo: string;
}

export function ConciliacionYapePlin({ breakdown }: { breakdown: Record<string, number> }) {
  const [tab, setTab] = useState<"yape" | "plin">(breakdown["yape"] ? "yape" : "plin");
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
    <div className="rounded-xl border border-[var(--rule-soft)] dark:border-[var(--rule-base)] p-4">
      <div className="mb-3 flex items-center gap-1.5">
        <Smartphone className="h-4 w-4 text-[var(--text-secondary)]" aria-hidden />
        <Kicker className="libro-kicker">Conciliación digital</Kicker>
        <InfoTip what="Compara lo vendido por Yape o Plin según la caja con el saldo que ves en tu app. Hasta S/ 5 de diferencia se toma como que cuadra." example="La caja dice S/ 120 por Yape y tu app muestra S/ 120: cuadra." />
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
              className={cn("px-3 min-h-9 rounded-lg text-xs font-bold transition-colors capitalize", tab === m ? "bg-primary text-white" : "bg-[var(--surface-sunken)] text-[var(--text-secondary)]")}
            >
              {m}
            </button>
          ))}
      </div>
      <div className="flex flex-wrap items-end gap-3 mb-3">
        <div className="flex-1">
          <p className="text-xs font-bold text-[var(--text-secondary)] mb-1">Ventas {tab} hoy</p>
          <p className="text-xl font-extrabold font-mono text-[var(--text-primary)]">{fmt(ventasDigital)}</p>
        </div>
        <label className="flex-1">
          <span className="block text-xs font-bold text-[var(--text-secondary)] mb-1">Saldo en tu app</span>
          <span className="flex items-center gap-1">
            <span className="text-xs text-[var(--text-secondary)]">S/</span>
            <input
              type="number"
              inputMode="decimal"
              value={monto}
              onChange={(e) => setMonto(e.target.value)}
              placeholder="0.00"
              step="0.50"
              className="w-28 px-2 min-h-9 rounded-xl border border-[var(--rule-base)] text-sm font-mono text-right bg-[var(--surface-raised)] text-[var(--text-primary)] outline-none focus:border-primary"
            />
          </span>
        </label>
      </div>
      {monto && (
        <div className={cn("rounded-lg p-3 mb-3 text-center", cuadra ? "bg-primary/10" : "bg-[var(--data-warning-500)]/10")}>
          <p className={cn("text-sm font-bold", cuadra ? "text-[var(--data-success-700)] dark:text-[var(--data-success-500)]" : "text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]")}>
            {cuadra
              ? `Cuadra perfecto${diferencia !== 0 ? ` (dif. ${formatCurrency(diferencia)})` : ""}`
              : `Diferencia de ${formatCurrency(Math.abs(diferencia))} — ${diferencia > 0 ? "sobrante" : "revisa si hay transferencias personales"}`}
          </p>
          <button type="button" onClick={anotar} className="mt-2 px-4 min-h-9 rounded-lg bg-primary text-white text-xs font-bold hover:bg-primary-dark transition-colors">
            Anotar conciliación
          </button>
        </div>
      )}
      {historial.length > 0 && (
        <div className="border-t border-[var(--rule-soft)] pt-2 mt-2 space-y-1">
          <Kicker className="libro-kicker">Últimas conciliaciones</Kicker>
          {historial.slice(0, 3).map((h) => (
            <div key={h.fecha} className="flex items-center justify-between text-xs">
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
    </div>
  );
}
