"use client";

/**
 * El saldo del permiso en una línea, al lado de la ficha (Control del permiso,
 * compactado 17-10): por talar, en patio y excedido, más las dos notas que la
 * tabla de Extracción no trae —trozas fuera del plan y trozas sin trozado—.
 *
 * La tabla por especie vivía tres veces (acá, en «Por árbol» y en Extracción):
 * queda UNA, la de Extracción, y acá va «Por especie →». Fuera de las pestañas
 * del Control (no hay Extracción a la que ir) la tabla se despliega en su lugar.
 */

import { ArrowRight, ChevronDown } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import type { SaldoDelPlan } from "@/lib/forestal/loth-saldo-especie";
import { useIrASeccionControl } from "./LothControlPestanas";
import { BOTON_LINEA } from "./LothFichaPermisoLinea";
import { AYUDA_SALDO } from "./LothSaldoEspecies";

const NOTA = "font-semibold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]";

export default function LothControlSaldoLinea({
  saldo,
  dondeVacio,
  verTabla,
  tablaId,
  onAlternarTabla,
}: {
  saldo: SaldoDelPlan;
  /** «el plan elegido» o «el plan del libro», para el vacío. */
  dondeVacio: string;
  verTabla: boolean;
  tablaId: string;
  onAlternarTabla: () => void;
}) {
  const irASeccion = useIrASeccionControl();
  const tot = saldo.totales;

  return (
    <div data-saldo-linea="" className="flex min-w-0 flex-wrap items-center gap-x-2 text-xs text-[var(--text-secondary)]">
      <span className="inline-flex items-center gap-1">
        <span className="text-sm font-bold text-[var(--text-primary)]">Saldo</span>
        <InfoTip title="Saldo por especie" {...AYUDA_SALDO} />
      </span>
      {saldo.filas.length === 0 ? (
        <span>Sin censo ni especies autorizadas en {dondeVacio}</span>
      ) : (
        <span className="tabular-nums">
          <b className="font-semibold text-[var(--text-primary)]">{fmtM3(tot.saldoPorTalarM3)} m³</b> por talar
          {" · "}
          <b className="font-semibold text-[var(--text-primary)]">{fmtM3(tot.enPatioM3)} m³</b> en patio
          {tot.excesoM3 > 0 && <b className="font-bold text-[var(--data-error-ink)]"> · excedido +{fmtM3(tot.excesoM3)} m³</b>}
        </span>
      )}
      {saldo.fuera.n > 0 && (
        <span
          className={NOTA}
          title={`${saldo.fuera.n} ${saldo.fuera.n === 1 ? "troza" : "trozas"} (${fmtM3(saldo.fuera.m3)} m³) de árboles que no son de este plan: no suman a ninguna especie.`}
        >
          · {saldo.fuera.n} fuera del plan
        </span>
      )}
      {saldo.sinTrozado > 0 && (
        <span
          className={NOTA}
          title={`${saldo.sinTrozado} ${saldo.sinTrozado === 1 ? "troza sale" : "trozas salen"} sin una línea de Trozado que la respalde: no suman.`}
        >
          · {saldo.sinTrozado} sin trozado
        </span>
      )}
      {irASeccion ? (
        <button
          type="button"
          onClick={() => irASeccion("extraccion")}
          title="La tabla por especie vive en Extracción: cupo, talado, trozado, despachado, consumido y saldo"
          className={`${BOTON_LINEA} text-[var(--accent-dark)] dark:text-[var(--accent)]`}
        >
          Por especie <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </button>
      ) : (
        <button
          type="button"
          onClick={onAlternarTabla}
          aria-expanded={verTabla}
          aria-controls={tablaId}
          className={`${BOTON_LINEA} text-[var(--text-secondary)] hover:text-[var(--text-primary)]`}
        >
          {verTabla ? "Ocultar" : "Ver"} por especie
          <ChevronDown className={`h-4 w-4 transition-transform ${verTabla ? "rotate-180" : ""}`} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
