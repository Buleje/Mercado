"use client";

/**
 * LothEudrRail — cabina de cumplimiento EUDR (Reglamento UE 2023/1115) que
 * acompaña al mapa del Libro TH. Traduce las operaciones geolocalizadas + el
 * polígono de la parcela en un veredicto "¿tu madera entra a la UE?": gauge de
 * readiness, checklist accionable, cross-check contra el área autorizada del POA
 * y los dos exports que pide la Declaración de Diligencia Debida (GeoJSON + PDF).
 *
 * Presentacional: recibe el readiness ya computado (`loth-geo`) + callbacks. Todo
 * el estado del mapa/dibujo vive en `LothMapaView`.
 */

import {
  ShieldCheck,
  ShieldAlert,
  CheckCircle2,
  XCircle,
  MapPin,
  Pencil,
  Download,
  FileText,
  Trash2,
  Loader2,
  Trees,
} from "@buleje/design-system/icons";
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
  onClearParcela: () => void;
  onToggleDeforestacion: (v: boolean) => void;
  onExportGeoJson: () => void;
  onPrintDds: () => void;
}

export default function LothEudrRail({
  readiness,
  parcela,
  planAreaHa,
  planParcelaCorta,
  drawMode,
  saving,
  onStartDraw,
  onClearParcela,
  onToggleDeforestacion,
  onExportGeoJson,
  onPrintDds,
}: Props) {
  const { listo, score, coberturaPct, areaHa, parcelaDeclarada, dentro, fuera } = readiness;
  const tone = listo ? "success" : score >= 50 ? "warning" : "error";
  const canExport = parcelaDeclarada && readiness.geoTotal > 0;

  return (
    <aside className="space-y-4">
      {/* Veredicto + gauge */}
      <div
        className={`rounded-2xl border-2 p-5 ${
          listo
            ? "border-[var(--data-success-500)] bg-[var(--data-success-50)]"
            : "border-[var(--rule-base)] bg-[var(--surface-raised)]"
        }`}
      >
        <div className="flex items-start gap-4">
          <EudrGauge value={score} tone={tone} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--text-tertiary)]">
              {listo ? <ShieldCheck className="h-3.5 w-3.5 text-[var(--data-success-600)]" /> : <ShieldAlert className="h-3.5 w-3.5 text-[var(--data-warning-600)]" />}
              Cumplimiento EUDR
            </div>
            <p className="mt-1 text-base font-bold leading-tight text-[var(--text-primary)]">
              {listo ? "Tu madera resiste el Reglamento UE Antideforestación" : "Faltan pasos para acreditar el EUDR"}
            </p>
            <p className="mt-1 text-xs text-[var(--text-tertiary)]">
              Geolocalización de la parcela + libre de deforestación posterior al {EUDR_CUTOFF_DATE}.
            </p>
          </div>
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
        <div className="flex items-start gap-2.5 rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-canvas)] px-3.5 py-3 text-xs">
          <Trees className="mt-0.5 h-4 w-4 shrink-0 text-[var(--brand-ink)]" />
          <div className="text-[var(--text-secondary)]">
            Dibujaste <b className="text-[var(--text-primary)]">{areaHa.toFixed(1)} ha</b> · el POA{planParcelaCorta ? ` (${planParcelaCorta})` : ""} autoriza{" "}
            <b className="text-[var(--text-primary)]">{planAreaHa.toFixed(1)} ha</b>.{" "}
            {areaHa > planAreaHa * 1.05 ? (
              <span className="font-bold text-[var(--data-error-700)]">El polígono excede el área autorizada.</span>
            ) : (
              <span className="font-bold text-[var(--data-success-700)]">Dentro del área autorizada.</span>
            )}
          </div>
        </div>
      )}

      {/* Checklist EUDR */}
      <div className="space-y-2 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-4">
        <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--text-tertiary)]">Checklist</p>
        {readiness.checks.map((c) => (
          <div key={c.key} className="flex items-start gap-2.5">
            {c.ok ? (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[var(--data-success-600)]" />
            ) : (
              <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--data-warning-600)]" />
            )}
            <div className="min-w-0">
              <p className="text-sm font-bold text-[var(--text-primary)]">{c.label}</p>
              <p className="text-xs text-[var(--text-tertiary)]">{c.detail}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Declaración de deforestación cero */}
      <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-3.5 py-3">
        <input
          type="checkbox"
          checked={parcela.deforestacionCero}
          onChange={(e) => onToggleDeforestacion(e.target.checked)}
          disabled={saving}
          className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--brand-ink)]"
        />
        <span className="text-xs text-[var(--text-secondary)]">
          <b className="text-[var(--text-primary)]">Declaro deforestación cero.</b> El área de aprovechamiento no fue deforestada después del {EUDR_CUTOFF_DATE} (atestación del titular ante la ARFFS/UE).
        </span>
      </label>

      {/* Acciones */}
      <div className="space-y-2">
        <button
          type="button"
          onClick={onStartDraw}
          disabled={drawMode || saving}
          className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[var(--brand-ink)] px-4 text-sm font-bold text-white shadow-sm hover:opacity-90 disabled:opacity-50"
        >
          {parcelaDeclarada ? <Pencil className="h-4 w-4" /> : <MapPin className="h-4 w-4" />}
          {drawMode ? "Dibujando…" : parcelaDeclarada ? "Editar parcela" : "Dibujar parcela"}
        </button>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onExportGeoJson}
            disabled={!canExport}
            title={canExport ? "Descargar la geolocalización en GeoJSON para la DDS" : "Declará la parcela y geolocalizá operaciones primero"}
            className="inline-flex h-11 items-center justify-center gap-1.5 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)] disabled:opacity-50"
          >
            <Download className="h-3.5 w-3.5" /> GeoJSON
          </button>
          <button
            type="button"
            onClick={onPrintDds}
            disabled={!parcelaDeclarada}
            title={parcelaDeclarada ? "Informe EUDR imprimible (DDS)" : "Declará la parcela primero"}
            className="inline-flex h-11 items-center justify-center gap-1.5 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)] disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />} Informe
          </button>
        </div>
        {parcelaDeclarada && !drawMode && (
          <button
            type="button"
            onClick={onClearParcela}
            disabled={saving}
            className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-xl text-xs font-bold text-[var(--data-error-700)] hover:bg-[var(--data-error-50)] disabled:opacity-50"
          >
            <Trash2 className="h-3.5 w-3.5" /> Borrar parcela
          </button>
        )}
      </div>
    </aside>
  );
}

// ─── Sub-componentes ─────────────────────────────────────────────────────────

function MiniStat({ label, value, hint, tone }: { label: string; value: string; hint: string; tone: "success" | "warning" | "error" | "neutral" }) {
  const valueColor =
    tone === "success"
      ? "text-[var(--data-success-700)]"
      : tone === "warning"
        ? "text-[var(--data-warning-700)]"
        : tone === "error"
          ? "text-[var(--data-error-700)]"
          : "text-[var(--text-primary)]";
  return (
    <div className="rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-3">
      <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--text-tertiary)]">{label}</p>
      <p className={`mt-0.5 font-mono text-lg font-bold tabular-nums ${valueColor}`}>{value}</p>
      <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">{hint}</p>
    </div>
  );
}
