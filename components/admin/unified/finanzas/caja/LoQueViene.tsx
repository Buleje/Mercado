"use client";

/**
 * Lo que viene: lo que te van a pagar, lo que vas a pagar y lo que ya te
 * adelantaron y se cruza al liquidar (eso NO es plata por entrar). Cada fila
 * lleva a donde se cobra o se paga.
 */

import { useId, useState } from "react";
import { CardTitle } from "@buleje/design-system";
import { ArrowDownRight, ArrowRightLeft, ArrowUpRight, ChevronRight } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { diaConNombre } from "@/lib/forestal/plazo-de-apartado";
import { limaDateKey } from "@/lib/utils";
import type { ItemViene, LoQueViene as Viene } from "@/lib/finance/resultado-del-negocio";
import { esAproximado, etiquetaViene, montoTexto } from "@/components/admin/unified/finanzas/resultado/fuentes";
import { irAlOrigen } from "@/components/admin/unified/finanzas/resultado/ir-al-origen";
import AvisosDelMes from "@/components/admin/unified/finanzas/resultado/AvisosDelMes";

const ICONO = { entra: ArrowDownRight, sale: ArrowUpRight, cruzar: ArrowRightLeft } as const;
const VER: Partial<Record<ItemViene["tipo"], string>> = {
  recibido_para_cruzar: "Cruzar en Liquidar",
  te_deben_cuenta: "Ver quién te debe",
  adelantos_por_cobrar: "Ver adelantos",
  fiados: "Ver fiados",
  planilla_por_pagar: "Ver planilla",
};

const enCero = (i: ItemViene) => i.monto === 0 && i.cuantos === 0;

/** «vence jueves 10/09», o «venció …» si ya pasó (por día de Lima). */
const plazo = (vence: string) => `${vence.slice(0, 10) < limaDateKey() ? "venció" : "vence"} ${diaConNombre(vence)}`;

function FilaViene({ item }: { item: ItemViene }) {
  const Icono = ICONO[item.lado] ?? ArrowRightLeft;
  const nombre = etiquetaViene(item.tipo);
  const quienes = item.quienes.slice(0, 3);
  const resto = item.cuantos - quienes.length;
  const detalle =
    quienes.map((q) => `${q.nombre} ${montoTexto(q.monto)}${q.vence ? ` · ${plazo(q.vence)}` : ""}`).join(" · ") +
    (resto > 0 ? ` · y ${resto} más` : "");
  return (
    <li className="flex items-center gap-1">
      <button
        type="button"
        onClick={() => irAlOrigen(item.enlace)}
        aria-label={`${nombre}: ${montoTexto(item.monto, { aproximado: esAproximado(item.certeza) })}. ${VER[item.tipo] ?? "Ver"}`}
        className="group flex min-h-11 flex-1 items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-[var(--surface-sunken)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
      >
        <span className="flex min-w-0 items-start gap-2">
          <Icono className="mt-0.5 h-4 w-4 shrink-0 text-[var(--text-tertiary)]" aria-hidden />
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-[var(--text-primary)]">{nombre}</span>
            {quienes.length > 0 && (
              <span className="line-clamp-2 text-xs text-[var(--text-secondary)] [overflow-wrap:anywhere]" title={detalle}>
                {detalle}
              </span>
            )}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-1 text-sm font-bold tabular-nums text-[var(--text-primary)]">
          {montoTexto(item.monto, { aproximado: esAproximado(item.certeza) })}
          <ChevronRight className="h-4 w-4 text-[var(--text-tertiary)] transition-transform group-hover:translate-x-0.5" aria-hidden />
        </span>
      </button>
      <InfoTip title={nombre} what={item.nota} side="left" ariaLabel={`De dónde sale: ${nombre}`} />
    </li>
  );
}

function Grupo({ titulo, total, aproximado, items }: { titulo: string; total: number; aproximado: boolean; items: ItemViene[] }) {
  const id = useId();
  const [verTodos, setVerTodos] = useState(false);
  const ceros = items.filter(enCero).length;
  const visibles = verTodos ? items : items.filter((i) => !enCero(i));
  return (
    <section aria-labelledby={id} className="min-w-0">
      <div className="flex items-baseline justify-between gap-3 border-b border-[var(--rule-base)] px-2 pb-2">
        <CardTitle className="text-sm font-bold" as="h4" id={id}>
          {titulo}
        </CardTitle>
        <span className="text-base font-extrabold tabular-nums text-[var(--text-primary)]">{montoTexto(total, { aproximado })}</span>
      </div>
      {visibles.length > 0 ? (
        <ul className="mt-1 divide-y divide-[var(--rule-soft)]">
          {visibles.map((i) => (
            <FilaViene key={i.tipo} item={i} />
          ))}
        </ul>
      ) : (
        <p className="px-2 py-3 text-sm text-[var(--text-secondary)]">Nada pendiente.</p>
      )}
      {ceros > 0 && (
        <button
          type="button"
          onClick={() => setVerTodos((v) => !v)}
          aria-expanded={verTodos}
          className="mt-1 min-h-9 rounded-lg px-2 text-xs font-semibold text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
        >
          {verTodos ? "Ocultar los que están en cero" : `+${ceros} en cero`}
        </button>
      )}
    </section>
  );
}

export default function LoQueViene({ viene }: { viene: Viene }) {
  const porCobrar = viene.items.filter((i) => i.lado !== "sale");
  const porPagar = viene.items.filter((i) => i.lado === "sale");
  const aprox = (xs: ItemViene[]) => xs.some((i) => esAproximado(i.certeza) || i.monto == null);
  return (
    <div className="@container rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 py-4 sm:px-4">
      <div className="mb-3 flex items-center gap-1.5 px-2">
        <CardTitle className="text-sm font-bold" as="h3">Lo que viene</CardTitle>
        <InfoTip
          title="Lo que viene"
          what="Lo que te deben y lo que debes hoy, con los nombres que más pesan."
          affects="Lo que ya te adelantaron no suma a «te van a pagar»: se cruza al liquidar."
          example="WASACO te debe aserrío y ya te adelantó una parte: esa parte se cruza en Liquidar."
        />
      </div>
      <div className="grid gap-5 @xl:grid-cols-2">
        <Grupo titulo="Te van a pagar" total={viene.porCobrar} aproximado={aprox(porCobrar)} items={porCobrar} />
        <Grupo titulo="Vas a pagar" total={viene.porPagar} aproximado={aprox(porPagar)} items={porPagar} />
      </div>
      {(viene.otrasMonedas?.length ?? 0) > 0 && (
        <div className="mt-3 border-t border-[var(--rule-base)] px-2 pt-3">
          <AvisosDelMes avisos={[]} otrasMonedas={viene.otrasMonedas} onAbrir={() => undefined} />
        </div>
      )}
    </div>
  );
}
