"use client";

/**
 * LothCompliancePanel — pestaña "Cumplimiento" del Libro de Operaciones TH.
 *
 * Gemelo de `CtpCompliancePanel` (ADR-305). Reencuadra las anomalías que ya
 * calcula la Analítica (`/plan?analytics=1` → `detectAnomalias`) como un veredicto
 * de "¿el libro resiste una fiscalización de OSINFOR ahora?": los bloqueos flotan
 * al tope, las advertencias abajo, y las verificaciones en orden se pliegan — no
 * un muro de cajas verdes que entierra el único punto a revisar.
 *
 * El score y los chequeos salen de `computeLothCompliance` (puro), el MISMO
 * archivo que consume el reporte imprimible → panel y PDF nunca divergen.
 */

import { useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  FileDown,
  Gauge,
  ListChecks,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
} from "@buleje/design-system/icons";
import { WarningAlert, ErrorAlert, LoadingState } from "@buleje/design-system";
import { BulejeGaugeChart } from "@/components/ui-system/charts";
import { Btn } from "./ctp-shared";
import {
  computeLothCompliance,
  type LothAnomaly,
  type LothCheck,
  type LothComplianceResult,
  type LothComplianceTone,
  type LothNavTarget,
} from "@/lib/forestal/loth-compliance";
import { printLothCumplimiento } from "@/lib/forestal/loth-cumplimiento-print";
import { permisoParaEspecie, type LothCitesPermiso } from "@/lib/forestal/loth-cites-types";

interface FullCaratula {
  titularName?: string | null;
  tituloHabilitante?: string | null;
  ruc?: string | null;
  representanteLegal?: string | null;
  resolucionNumber?: string | null;
  departamento?: string | null;
  provincia?: string | null;
  distrito?: string | null;
  registroNumber?: string | null;
  tomo?: string | null;
}

interface Props {
  totalLineas: number;
  onNavigate: (target: LothNavTarget) => void;
}

const TONE_LABEL: Record<LothComplianceTone, string> = {
  success: "Libro al día",
  warning: "Hay puntos que revisar",
  error: "Requiere atención",
};
const GAUGE_COLOR: Record<LothComplianceTone, string> = {
  success: "var(--data-success-500)",
  warning: "var(--data-warning-500)",
  error: "var(--data-error-500)",
};
const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

export default function LothCompliancePanel({ totalLineas, onNavigate }: Props) {
  const [anomalias, setAnomalias] = useState<LothAnomaly[] | null>(null);
  const [caratula, setCaratula] = useState<FullCaratula | null>(null);
  const [citesEspecies, setCitesEspecies] = useState<string[]>([]);
  const [citesPermisos, setCitesPermisos] = useState<LothCitesPermiso[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reportError, setReportError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [aRes, cRes, xRes] = await Promise.all([
        fetch("/api/admin/forestal/plan?analytics=1", { credentials: "include" }),
        fetch("/api/admin/forestal/loth/caratula", { credentials: "include" }),
        fetch("/api/admin/forestal/loth/cites", { credentials: "include" }),
      ]);
      if (!aRes.ok) {
        const d = await aRes.json().catch(() => ({}));
        throw new Error(d.message ?? d.error ?? `HTTP ${aRes.status}`);
      }
      const analytics = (await aRes.json()).analytics;
      setAnomalias(analytics?.anomalias ?? []);
      setCitesEspecies(analytics?.citesEspecies ?? []);
      if (cRes.ok) setCaratula((await cRes.json()).active ?? null);
      if (xRes.ok) setCitesPermisos((await xRes.json()).catalogo?.permisos ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading && anomalias === null) return <LoadingState message="Calculando cumplimiento del libro..." />;
  if (error && anomalias === null) {
    return (
      <ErrorAlert
        title="No se pudo calcular el cumplimiento"
        description={error}
        action={
          <Btn variant="secondary" size="sm" onClick={() => void load()}>
            <RefreshCw className="h-3.5 w-3.5" /> Reintentar
          </Btn>
        }
      />
    );
  }

  const citesSinPermiso = citesEspecies.filter((sp) => !permisoParaEspecie({ permisos: citesPermisos }, sp));
  const result = computeLothCompliance({ anomalias: anomalias ?? [], caratula, totalLineas, citesSinPermiso });
  const { problemas, enOrden, bloqueos, advertencias, readiness, breakdown, tone, score } = result;
  const totalRestado = breakdown.reduce((a, d) => a + d.puntos, 0);

  function handleReport() {
    setReportError(null);
    try {
      printLothCumplimiento({ result, caratula, totalLineas });
    } catch (err) {
      setReportError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="min-w-[16rem] flex-1 text-sm text-[var(--text-tertiary)]">
          Chequeo del libro sobre <strong className="text-[var(--text-secondary)]">{totalLineas.toLocaleString("es-PE")}</strong>{" "}
          {plural(totalLineas, "línea registrada", "líneas registradas")}. Mismos números que la Analítica.
        </p>
        <div className="flex shrink-0 items-center gap-2">
          <Btn variant="dark" size="md" onClick={handleReport}>
            <FileDown className="h-4 w-4" /> Descargar reporte
          </Btn>
          <Btn variant="secondary" size="md" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Recargar
          </Btn>
        </div>
      </div>

      {reportError && <WarningAlert title="No se pudo abrir el reporte" description={reportError} />}

      <ReadinessBanner readiness={readiness} bloqueos={bloqueos} advertencias={advertencias} onNavigate={onNavigate} />

      <div className="grid gap-4 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-4 sm:grid-cols-[auto_1fr] sm:items-center sm:gap-6">
        <div className="flex justify-center">
          <BulejeGaugeChart value={score} max={100} size={190} color={GAUGE_COLOR[tone]} sublabel="de 100" label={TONE_LABEL[tone]} />
        </div>
        <div>
          <div className="mb-2 flex items-center gap-2">
            <Gauge className="h-4 w-4 text-[var(--text-tertiary)]" />
            <p className="text-xs font-bold uppercase tracking-wide text-[var(--text-tertiary)]">
              Cómo se compone · 100 {totalRestado > 0 ? `− ${totalRestado} deducidos` : "· sin deducciones"}
            </p>
          </div>
          <ul className="space-y-1.5">
            {breakdown.map((d) => (
              <li key={d.key} className="flex items-center justify-between gap-3 text-sm">
                <span className="inline-flex min-w-0 items-center gap-2">
                  <span className={`h-2 w-2 shrink-0 rounded-full ${d.puntos > 0 ? "bg-[var(--data-error-500)]" : "bg-[var(--data-success-500)]"}`} aria-hidden="true" />
                  <span className="truncate text-[var(--text-secondary)]">{d.label}</span>
                </span>
                {d.puntos > 0 ? (
                  <span className="shrink-0 font-mono font-bold tabular-nums text-[var(--data-error-700)]">
                    −{d.puntos} pts <span className="text-[length:var(--ts-2xs)] font-normal text-[var(--text-tertiary)]">({d.casos} {plural(d.casos, "caso", "casos")})</span>
                  </span>
                ) : (
                  <span className="shrink-0 text-xs font-bold text-[var(--data-success-700)]">sin restar</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <TriageChip icon={ShieldAlert} count={bloqueos} label={plural(bloqueos, "bloqueo", "bloqueos")} tone="error" />
        <TriageChip icon={AlertTriangle} count={advertencias} label={plural(advertencias, "advertencia", "advertencias")} tone="warning" />
        <TriageChip icon={CheckCircle2} count={enOrden.length} label="en orden" tone="success" />
      </div>

      {problemas.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-[var(--data-warning-600)]" />
            <h3 className="text-sm font-bold text-[var(--text-primary)]">
              Requiere atención <span className="text-[var(--text-tertiary)]">({problemas.length})</span>
            </h3>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {problemas.map((c) => (
              <ProblemCard key={c.key} check={c} onNavigate={() => onNavigate(c.navTarget)} />
            ))}
          </div>
        </section>
      )}

      {enOrden.length > 0 && (
        <details open className="group rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)]">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 rounded-2xl px-4 py-3 hover:bg-[var(--surface-canvas)]">
            <span className="inline-flex items-center gap-2">
              <ListChecks className="h-4 w-4 text-[var(--data-success-600)]" />
              <span className="text-sm font-bold text-[var(--text-primary)]">
                Verificaciones en orden <span className="text-[var(--text-tertiary)]">({enOrden.length})</span>
              </span>
            </span>
            <span className="text-xs font-bold text-[var(--text-tertiary)] group-open:hidden">Mostrar</span>
            <span className="hidden text-xs font-bold text-[var(--text-tertiary)] group-open:inline">Ocultar</span>
          </summary>
          <ul className="grid gap-x-6 gap-y-2.5 border-t border-[var(--rule-base)] px-4 py-3 sm:grid-cols-2 lg:grid-cols-3">
            {enOrden.map((c) => (
              <li key={c.key} className="flex items-center gap-2 text-sm">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-[var(--data-success-600)]" />
                <span className="text-[var(--text-secondary)]">{c.okTitle}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

// ── Sub-componentes ──────────────────────────────────────────────────────────

const READINESS_META = {
  ready: { Icon: ShieldCheck, box: "border-[var(--data-success-500)]/30 bg-[var(--data-success-50)]", text: "text-[var(--data-success-700)]", title: "El libro resiste una fiscalización" },
  warning: { Icon: AlertTriangle, box: "border-[var(--data-warning-500)]/30 bg-[var(--data-warning-50)]", text: "text-[var(--data-warning-700)]", title: "El libro está en pie, con advertencias" },
  error: { Icon: ShieldAlert, box: "border-[var(--data-error-500)]/30 bg-[var(--data-error-50)]", text: "text-[var(--data-error-700)]", title: "Corregí antes de una fiscalización" },
} as const;

function ReadinessBanner({
  readiness,
  bloqueos,
  advertencias,
  onNavigate,
}: {
  readiness: LothComplianceResult["readiness"];
  bloqueos: number;
  advertencias: number;
  onNavigate: (t: LothNavTarget) => void;
}) {
  const m = READINESS_META[readiness];
  const detail =
    readiness === "error"
      ? `${bloqueos} ${plural(bloqueos, "bloqueo debe resolverse", "bloqueos deben resolverse")}${advertencias > 0 ? ` · ${advertencias} ${plural(advertencias, "advertencia", "advertencias")} por revisar` : ""}.`
      : readiness === "warning"
        ? `Sin bloqueos · ${advertencias} ${plural(advertencias, "advertencia por revisar", "advertencias por revisar")}.`
        : "Sin bloqueos ni advertencias — la cadena de custodia está completa.";
  return (
    <div className={`flex flex-wrap items-center justify-between gap-3 rounded-2xl border-2 p-4 ${m.box}`}>
      <div className="flex items-center gap-3">
        <m.Icon className={`h-6 w-6 shrink-0 ${m.text}`} />
        <div>
          <p className={`text-sm font-bold ${m.text}`}>{m.title}</p>
          <p className="text-xs text-[var(--text-secondary)]">{detail}</p>
        </div>
      </div>
      {readiness === "ready" && (
        <Btn variant="primary" size="sm" onClick={() => onNavigate("analitica")} className="shrink-0">
          <ShieldCheck className="h-4 w-4" /> Ver analítica
        </Btn>
      )}
    </div>
  );
}

const TRIAGE_TONE = {
  error: { on: "bg-[var(--data-error-100)] text-[var(--data-error-700)]", off: "bg-[var(--surface-sunken)] text-[var(--text-tertiary)]" },
  warning: { on: "bg-[var(--data-warning-100)] text-[var(--data-warning-700)]", off: "bg-[var(--surface-sunken)] text-[var(--text-tertiary)]" },
  success: { on: "bg-[var(--data-success-100)] text-[var(--data-success-700)]", off: "bg-[var(--surface-sunken)] text-[var(--text-tertiary)]" },
} as const;

function TriageChip({ icon: Icon, count, label, tone }: { icon: typeof AlertCircle; count: number; label: string; tone: keyof typeof TRIAGE_TONE }) {
  const cls = count > 0 ? TRIAGE_TONE[tone].on : TRIAGE_TONE[tone].off;
  return (
    <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-bold ${cls}`}>
      <Icon className="h-4 w-4" />
      <span className="tabular-nums">{count}</span> {label}
    </span>
  );
}

function ProblemCard({ check, onNavigate }: { check: LothCheck; onNavigate: () => void }) {
  const AlertComp = check.severity === "error" ? ErrorAlert : WarningAlert;
  return (
    <AlertComp
      title={check.title}
      description={
        <>
          {check.description} <strong>{check.action}</strong>
        </>
      }
      action={
        <Btn variant="secondary" size="sm" onClick={onNavigate}>
          {check.navigateLabel}
        </Btn>
      }
    />
  );
}
