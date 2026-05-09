import React from "react";

const fmt = (n: number) =>
  new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" }).format(n);

interface YapeInstructionsProps {
  finalTotal: number;
}

export function YapeInstructions({ finalTotal }: YapeInstructionsProps) {
  return (
    <div className="rounded-xl border border-[var(--brand-yape)]/20 bg-[var(--brand-yape)]/5 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--brand-yape)]/10">
          <span className="text-sm font-black text-[var(--brand-yape)]">Y</span>
        </div>
        <p className="text-sm font-bold text-gray-900 dark:text-white">Instrucciones de Yape</p>
      </div>
      <ol className="space-y-2 text-xs text-gray-600 dark:text-gray-400">
        <li className="flex items-start gap-2">
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--brand-yape)]/10 text-[length:var(--ts-2xs)] font-bold text-[var(--brand-yape)]">1</span>
          <span>Confirma tu pedido aquí y recibirás el número de Yape del vendedor</span>
        </li>
        <li className="flex items-start gap-2">
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--brand-yape)]/10 text-[length:var(--ts-2xs)] font-bold text-[var(--brand-yape)]">2</span>
          <span>Abre tu app de Yape y transfiere <strong>{fmt(finalTotal)}</strong></span>
        </li>
        <li className="flex items-start gap-2">
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--brand-yape)]/10 text-[length:var(--ts-2xs)] font-bold text-[var(--brand-yape)]">3</span>
          <span>El vendedor verificará el pago y preparará tu pedido</span>
        </li>
      </ol>
    </div>
  );
}
