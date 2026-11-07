"use client";

import { useState } from "react";
import { CardTitle } from "@buleje/design-system";
import { ChevronDown, Receipt } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import ReciboPapel, { SelectorFormatoRecibo } from "./ReciboPapel";
import type { ReciboVenta } from "./use-recibo-venta";

/**
 * Bloque «cómo sale el recibo» del modal de venta completada: el formato
 * (80 mm · 58 mm · A4), lo que falta cargar para que salga completo y la hoja.
 * En pantallas angostas va plegado debajo (se abre con «Ver el recibo»).
 */
export default function ReciboVistaPrevia({ recibo, className }: { recibo: ReciboVenta; className?: string }) {
  const [abierto, setAbierto] = useState(false);
  const { modelo, formato, setFormato, html } = recibo;
  const nombre = `${modelo.nombreCorto} ${modelo.numero}`;
  const delNegocio = modelo.faltantes.filter((f) => f.includes("del negocio"));

  return (
    <section aria-label="Vista previa del recibo" className={cn("min-w-0", className)}>
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        className="lg:hidden flex w-full items-center justify-between gap-2 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 h-12 text-base font-semibold text-[var(--text-primary)]"
      >
        <span className="flex min-w-0 items-center gap-2">
          <Receipt className="h-5 w-5 shrink-0 text-primary" aria-hidden />
          <span className="truncate">Ver {modelo.nombreCorto.toLowerCase()} {modelo.numero}</span>
        </span>
        <ChevronDown className={cn("h-5 w-5 shrink-0 transition-transform", abierto && "rotate-180")} aria-hidden />
      </button>

      <div className={cn(abierto ? "block" : "hidden", "lg:block space-y-3 pt-3 lg:pt-0")}>
        <div className="hidden lg:flex items-center gap-2 pr-10">
          <Receipt className="h-5 w-5 shrink-0 text-primary" aria-hidden />
          <CardTitle className="truncate">{nombre}</CardTitle>
        </div>
        <SelectorFormatoRecibo valor={formato} onChange={setFormato} />
        {modelo.faltantes.length > 0 && (
          <p className="flex items-start gap-1.5 text-sm font-medium text-[var(--data-warning-ink)]">
            <span className="min-w-0">Falta cargar: {modelo.faltantes.join(", ")}.</span>
            <InfoTip
              what="Sin estos datos la hoja sale incompleta: la boleta y la factura piden el RUC, la razón social y la dirección fiscal del negocio, y la factura el RUC y la razón social del cliente."
              affects={delNegocio.length > 0 ? "Los del negocio se cargan en Ajustes › Datos del negocio y salen en todos los recibos." : "Los del cliente se piden al cobrar."}
              example="RUC 20601234567 · Inversiones San Martín S.A.C. · Jr. Tacna 123, Pucallpa"
              side="left"
            />
          </p>
        )}
        <ReciboPapel html={html} formato={formato} titulo={`Vista previa: ${nombre}`} />
      </div>
    </section>
  );
}
