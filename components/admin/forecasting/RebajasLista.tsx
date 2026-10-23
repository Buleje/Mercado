"use client";

/**
 * Análisis › Sugerencias de precio › «Rebajar lo que no se vende»: la lista
 * única de rebajas (`lib/precios/rebajas.ts`), la MISMA que arma la IA con
 * «Rebaja lo que no se vende» en Comandos IA › Precios en bloque.
 *
 * «Revisar y aplicar» abre la misma diferencia (Hoy → Queda, con casillas) y
 * aplica por el mismo POST /aplicar: historial, recibo en «Lo que hizo la IA»
 * y «Deshacer» en el aviso. Nada cambia sin ese toque.
 */

import { useMemo, useState } from "react";
import { Check, Sparkles, Tag } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { EnlacePanel } from "@/components/admin/shared/EnlacePanel";
import { useMiRol } from "@/hooks/use-mi-rol";
import { formatCurrency } from "@/lib/utils";
import { formatNumber } from "@/lib/format";
import { describirRebajas, REBAJA_VENCE_DIAS } from "@/lib/precios/rebajas";
import { MARGENES_REBAJAS_POR_DEFECTO, pctTexto } from "@/lib/precios/margenes-rebajas";
import { LineaMargenes } from "@/components/admin/comandos-ia/precios/LineaMargenes";
import DiferenciaPreciosModal from "@/components/admin/comandos-ia/precios/DiferenciaPreciosModal";
import { BTN } from "@/components/admin/comandos-ia/precios/FilasDiferencia";
import {
  aplicarPrecios,
  ORDEN_REBAJAS,
  pasarOrdenDePrecios,
  PUEDEN_CAMBIAR_PRECIOS,
  RUTA_PRECIOS_EN_BLOQUE,
  type FilaAplicar,
  type PlanPrecios,
  type ResultadoAplicar,
} from "@/components/admin/comandos-ia/precios/use-precios-en-bloque";
import { PanelCard } from "./ForecastPiezas";
import type { Rebajas } from "./forecast-datos";
import Plegable from "@/components/admin/shared/Plegable";

type Fila = Rebajas["filas"][number];

const MOTIVO: Record<Fila["motivo"], { label: string; clase: string }> = {
  vence: {
    label: "Vence",
    clase: "bg-[var(--data-error-50)] text-[var(--data-error-700)] dark:bg-[var(--surface-sunken)] dark:text-[var(--data-error-500)]",
  },
  "sin-venta": {
    label: "Sin ventas",
    clase: "bg-[var(--data-warning-50)] text-[var(--data-warning-700)] dark:bg-[var(--surface-sunken)] dark:text-[var(--data-warning-500)]",
  },
  "rota-poco": {
    label: "Rota poco",
    clase: "bg-[var(--data-info-50)] text-[var(--data-info-700)] dark:bg-[var(--surface-sunken)] dark:text-[var(--data-info-500)]",
  },
};

/** Las primeras a la vista; el resto tras «Ver todas» (la lista ya viene en orden: vence, plata parada). */
const VISIBLES = 8;
const NO_ENTRAN_VISIBLES = 20;

function FilaLista({ f }: { f: Fila }) {
  const m = MOTIVO[f.motivo];
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
      <span className="min-w-0 flex-1 text-sm font-medium text-[var(--text-primary)] [overflow-wrap:anywhere]">{f.nombre}</span>
      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${m.clase}`}>{m.label}</span>
      <span className="text-sm tabular-nums text-[var(--text-secondary)]">
        <s>{formatCurrency(f.precioHoy)}</s> → <strong className="text-[var(--text-primary)]">{formatCurrency(f.precioNuevo)}</strong>
      </span>
      <span className="w-14 text-right text-xs font-semibold tabular-nums text-[var(--text-secondary)]">{formatNumber(f.pct)} %</span>
      <span className="basis-full text-xs text-[var(--text-secondary)] [overflow-wrap:anywhere]">{f.detalle}</span>
    </li>
  );
}

export default function RebajasLista({ rebajas }: { rebajas: Rebajas }) {
  const rol = useMiRol();
  // null = todavía no se sabe: permisivo (el servidor es el gate de verdad).
  const puede = !rol || PUEDEN_CAMBIAR_PRECIOS.has(rol);
  const [aplicadas, setAplicadas] = useState<ReadonlySet<number>>(new Set());
  const [todas, setTodas] = useState(false);
  const [plan, setPlan] = useState<PlanPrecios | null>(null);
  const [aplicando, setAplicando] = useState(false);

  const filas = useMemo(() => rebajas.filas.filter((f) => !aplicadas.has(f.productId)), [rebajas.filas, aplicadas]);
  const margenes = rebajas.margenes ?? MARGENES_REBAJAS_POR_DEFECTO;
  const regla = describirRebajas(rebajas.dias, { margenes });
  const visibles = todas ? filas : filas.slice(0, VISIBLES);

  const abrir = () =>
    setPlan({
      origen: "rebajas",
      interpretacion: regla,
      filas,
      noAplica: rebajas.noEntran.map(({ nombre, motivo }) => ({ nombre, motivo })),
      sinCambio: 0,
      costoIaUsd: 0,
      margenes,
    });

  const aplicar = async (elegidas: FilaAplicar[], resumen: string): Promise<ResultadoAplicar> => {
    setAplicando(true);
    try {
      const r = await aplicarPrecios(elegidas, resumen, 0);
      if (r.ok) {
        setAplicadas((prev) => new Set([...prev, ...elegidas.map((e) => e.productId)]));
        setPlan(null);
      }
      return r;
    } finally {
      setAplicando(false);
    }
  };

  const cabecera = (
    <div className="flex flex-wrap items-center gap-2">
      <InfoTip
        title="Una sola regla de rebajas"
        what={`Primero lo que vence en ${REBAJA_VENCE_DIAS} días (20 % a 30 %), después lo que no se vendió en ${rebajas.dias} días (15 %) y lo que rota poco (10 % a 15 %). Nunca baja del costo + ${pctTexto(margenes.pisoSobreCosto)} y redondea a 10 céntimos; las que dejan menos de ${pctTexto(margenes.margenMinimoSugerido)} de margen empiezan sin marcar.`}
        affects="Es la misma lista que arma la IA con «Rebaja lo que no se vende»: aplicar desde aquí o desde allá deja el mismo recibo para deshacer."
        example="Lo vencido no se rebaja (se saca de la venta); lo que no tiene costo o stock no entra."
        side="bottom"
      />
      {puede && (
        <EnlacePanel href={RUTA_PRECIOS_EN_BLOQUE} onClick={() => pasarOrdenDePrecios(ORDEN_REBAJAS)} className="inline-flex items-center gap-1 text-sm">
          <Sparkles className="h-4 w-4" aria-hidden />
          Aplicar con la IA
        </EnlacePanel>
      )}
    </div>
  );

  return (
    <PanelCard
      icon={<Tag className="h-4 w-4" />}
      title={`Rebajar lo que no se vende${filas.length ? ` (${filas.length})` : ""}`}
      loading={false}
      error={null}
      isEmpty={filas.length === 0}
      emptyMsg={rebajas.filas.length ? "Listo: aplicaste toda la lista." : "Nada que rebajar: lo que tienes se está vendiendo."}
      headerExtra={cabecera}
    >
      <LineaMargenes margenes={margenes} puedeCambiar={puede} />
      {filas.length > 0 && (
        <div className="mt-2 space-y-3">
          <ul className="divide-y divide-[var(--rule-soft)]">
            {visibles.map((f) => (
              <FilaLista key={f.productId} f={f} />
            ))}
          </ul>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {filas.length > VISIBLES && (
              <button type="button" onClick={() => setTodas((v) => !v)} className={BTN.secundario} aria-expanded={todas}>
                {todas ? "Ver menos" : `Ver todas (${filas.length})`}
              </button>
            )}
            {puede && (
              <button type="button" onClick={abrir} className={BTN.primario}>
                <Check className="h-4 w-4" aria-hidden />
                Revisar y aplicar ({filas.length})
              </button>
            )}
          </div>
        </div>
      )}

      {rebajas.noEntran.length > 0 && (
        <Plegable
          clave="forecasting:rebajas:no-entran"
          titulo={`${rebajas.noEntran.length} ${rebajas.noEntran.length === 1 ? "no entra" : "no entran"}`}
          className="mt-3"
        >
          <ul className="space-y-1">
            {rebajas.noEntran.slice(0, NO_ENTRAN_VISIBLES).map((x) => (
              <li key={x.productId} className="text-sm text-[var(--text-secondary)] [overflow-wrap:anywhere]">
                <span className="font-medium text-[var(--text-primary)]">{x.nombre}</span> · {x.motivo}
              </li>
            ))}
            {rebajas.noEntran.length > NO_ENTRAN_VISIBLES && (
              <li className="text-sm text-[var(--text-tertiary)]">y {rebajas.noEntran.length - NO_ENTRAN_VISIBLES} más</li>
            )}
          </ul>
        </Plegable>
      )}

      {plan && <DiferenciaPreciosModal key={`${plan.filas.length}`} plan={plan} aplicando={aplicando} onCerrar={() => setPlan(null)} onAplicar={aplicar} />}
    </PanelCard>
  );
}
