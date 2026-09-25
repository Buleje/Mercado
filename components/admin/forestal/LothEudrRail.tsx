"use client";

/**
 * LothEudrRail — el cumplimiento EUDR (Reglamento UE 2023/1115) del mapa del
 * Libro TH. Traduce las operaciones geolocalizadas + el polígono de la parcela
 * en un veredicto "¿tu madera entra a la UE?": gauge de readiness, checklist
 * accionable, cross-check contra el área autorizada del POA, la declaración de
 * deforestación cero y los dos exports que pide la Declaración de Diligencia
 * Debida (GeoJSON + informe).
 *
 * Era una columna de 360 px al lado del mapa que le quitaba el 40 % del ancho.
 * Ahora es el primer bloque plegable debajo (`LothMapaBloque`): plegado dice su
 * puntaje y su veredicto en una línea (`resumenEudr`), abierto reparte lo mismo
 * en dos columnas. Dibujar y borrar la parcela se mudaron al menú «Dibujar» de
 * la barra del mapa; acá queda «Dibujar parcela» sólo cuando FALTA, que es
 * cuando el checklist lo pide.
 *
 * Presentacional: recibe el readiness ya computado (`loth-geo`) + callbacks.
 */

import { CheckCircle2, XCircle, MapPin, Download, FileText, Loader2, Trees } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { EUDR_CUTOFF_DATE, type EudrReadiness, type LothParcela } from "@/lib/forestal/loth-geo";
import EudrGauge from "./EudrGauge";

interface Props {
  readiness: EudrReadiness;
  parcela: LothParcela;
  planAreaHa: number | null;
  planParcelaCorta: string | null;
  drawMode: boolean;
  saving: boolean;
  onStartDraw: () => void;
  onToggleDeforestacion: (v: boolean) => void;
  onExportGeoJson: () => void;
  onPrintDds: () => void;
}

type Tono = "success" | "warning" | "error" | "neutral";

const TONO_TEXTO: Record<Tono, string> = {
  success: "text-[var(--data-success-700)] dark:text-[var(--data-success-500)]",
  warning: "text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]",
  error: "text-[var(--data-error-700)] dark:text-[var(--data-error-500)]",
  neutral: "text-[var(--text-primary)]",
};

const BTN =
  "inline-flex h-10 items-center justify-center gap-1.5 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)] disabled:opacity-50";

/** El veredicto en una línea, para la cabecera del bloque plegado. */
export function resumenEudr(r: EudrReadiness): string {
  const partes = [
    r.listo ? "Tu madera resiste el EUDR" : "Faltan pasos para acreditar el EUDR",
    `GPS de talas ${r.coberturaPct} %`,
    r.parcelaDeclarada ? `${Number(r.areaHa).toFixed(1)} ha declaradas` : "sin polígono",
  ];
  if (r.parcelaDeclarada && r.fuera > 0) partes.push(`${r.fuera} op. fuera`);
  return partes.join(" · ");
}

export function tonoEudr(r: EudrReadiness): "success" | "warning" | "error" {
  return r.listo ? "success" : r.score >= 50 ? "warning" : "error";
}

export default function LothEudrRail({
  readiness,
  parcela,
  planAreaHa,
  planParcelaCorta,
  drawMode,
  saving,
  onStartDraw,
  onToggleDeforestacion,
  onExportGeoJson,
  onPrintDds,
}: Props) {
  const { listo, score, coberturaPct, areaHa, parcelaDeclarada, dentro, fuera } = readiness;
  const canExport = parcelaDeclarada && readiness.geoTotal > 0;

  return (
    <div className="grid gap-4 p-4 lg:grid-cols-2">
      <div className="space-y-3">
        {/* Veredicto + gauge */}
        <div className="flex items-start gap-4">
          <EudrGauge value={score} tone={tonoEudr(readiness)} />
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 text-base font-bold leading-tight text-[var(--text-primary)]">
              {listo ? "Tu madera resiste el Reglamento UE Antideforestación" : "Faltan pasos para acreditar el EUDR"}
              <InfoTip
                title="Cumplimiento EUDR"
                what="Se acredita con la geolocalización de la parcela y la declaración de libre de deforestación."
                example={`Posterior al ${EUDR_CUTOFF_DATE}, fecha de corte del Reglamento UE 2023/1115.`}
              />
            </p>
          </div>
        </div>

        {/* Métricas rápidas */}
        <div className="grid grid-cols-2 gap-3">
          <MiniStat
            label="Cobertura GPS"
            value={`${coberturaPct}%`}
            hint={`${readiness.talaGeo}/${readiness.talaTotal} talas`}
            tone={coberturaPct === 100 && readiness.talaTotal > 0 ? "success" : "warning"}
          />
          <MiniStat
            label="Área declarada"
            value={parcelaDeclarada ? `${areaHa.toFixed(1)} ha` : "—"}
            hint={parcelaDeclarada ? (fuera > 0 ? `${fuera} op. fuera` : `${dentro} op. dentro`) : "sin polígono"}
            tone={parcelaDeclarada ? (fuera > 0 ? "error" : "success") : "neutral"}
          />
        </div>

        {/* Cross-check contra el área autorizada del POA */}
        {parcelaDeclarada && planAreaHa != null && planAreaHa > 0 && (
          <div className="flex items-start gap-2.5 rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-canvas)] px-3.5 py-3 text-sm">
            <Trees className="mt-0.5 h-4 w-4 shrink-0 text-[var(--brand-ink)] dark:text-[var(--text-primary)]" aria-hidden="true" />
            <div className="text-[var(--text-secondary)]">
              Dibujaste <b className="text-[var(--text-primary)]">{areaHa.toFixed(1)} ha</b> · el POA{planParcelaCorta ? ` (${planParcelaCorta})` : ""} autoriza{" "}
              <b className="text-[var(--text-primary)]">{planAreaHa.toFixed(1)} ha</b>.{" "}
              {areaHa > planAreaHa * 1.05 ? (
                <span className={`font-bold ${TONO_TEXTO.error}`}>El polígono excede el área autorizada.</span>
              ) : (
                <span className={`font-bold ${TONO_TEXTO.success}`}>Dentro del área autorizada.</span>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="space-y-3">
        {/* Checklist EUDR */}
        <ul className="space-y-2" aria-label="Checklist EUDR">
          {readiness.checks.map((c) => (
            <li key={c.key} className="flex items-start gap-2.5">
              {c.ok ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[var(--data-success-600)]" aria-label="Cumplido" />
              ) : (
                <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--data-warning-600)]" aria-label="Pendiente" />
              )}
              <div className="min-w-0">
                <p className="text-sm font-bold text-[var(--text-primary)]">{c.label}</p>
                <p className="text-xs text-[var(--text-tertiary)]">{c.detail}</p>
              </div>
            </li>
          ))}
        </ul>

        {/* Declaración de deforestación cero */}
        <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3.5 py-3">
          <input
            type="checkbox"
            checked={parcela.deforestacionCero}
            onChange={(e) => onToggleDeforestacion(e.target.checked)}
            disabled={saving}
            className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--brand-ink)]"
          />
          <span className="text-sm text-[var(--text-secondary)]">
            <b className="text-[var(--text-primary)]">Declaro deforestación cero.</b> El área de aprovechamiento no fue deforestada después del {EUDR_CUTOFF_DATE} (atestación del titular ante la ARFFS/UE).
          </span>
        </label>

        {/* Acciones */}
        <div className="flex flex-wrap gap-2">
          {!parcelaDeclarada && (
            <button
              type="button"
              onClick={onStartDraw}
              disabled={drawMode || saving}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-[var(--brand-ink)] px-4 text-sm font-semibold text-white shadow-sm hover:opacity-90 disabled:opacity-50"
            >
              <MapPin className="h-4 w-4" aria-hidden="true" />
              {drawMode ? "Dibujando…" : "Dibujar parcela"}
            </button>
          )}
          <button
            type="button"
            onClick={onPrintDds}
            disabled={!parcelaDeclarada}
            title={parcelaDeclarada ? "Informe EUDR imprimible (DDS)" : "Declara la parcela primero"}
            className={BTN}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <FileText className="h-4 w-4" aria-hidden="true" />} Informe EUDR
          </button>
          <button
            type="button"
            onClick={onExportGeoJson}
            disabled={!canExport}
            title={canExport ? "Descargar la geolocalización en GeoJSON para la DDS" : "Declara la parcela y geolocaliza operaciones primero"}
            className={BTN}
          >
            <Download className="h-4 w-4" aria-hidden="true" /> GeoJSON
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Sub-componentes ─────────────────────────────────────────────────────────

function MiniStat({ label, value, hint, tone }: { label: string; value: string; hint: string; tone: Tono }) {
  return (
    <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] p-3">
      <p className="text-xs font-bold uppercase tracking-wide text-[var(--text-tertiary)]">{label}</p>
      <p className={`mt-0.5 font-mono text-lg font-bold tabular-nums ${TONO_TEXTO[tone]}`}>{value}</p>
      <p className="text-xs text-[var(--text-tertiary)]">{hint}</p>
    </div>
  );
}
