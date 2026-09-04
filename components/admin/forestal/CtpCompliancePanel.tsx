"use client";

/**
 * CtpCompliancePanel — pestaña "Cumplimiento" del Libro CTP (ADR-124/127).
 *
 * Las alertas que antes sólo aparecían al abrir el Excel exportado
 * (`lib/forestal/ctp-export.ts`, hoja Resumen) se ven acá sin descargar nada.
 * Mismos números, misma fuente: los agregados vienen de `WoodEntriesDB.stats()`
 * y `ForestCtpDB.saldos()` (DB, no cliente), y el score sale de
 * `lib/forestal/ctp-compliance.ts` — el mismo archivo que consume el export, así
 * que panel y Excel nunca dicen números distintos.
 *
 * Diseño (triage-first): un veredicto de "¿puedo cerrar el período?" arriba,
 * chips de conteo, los problemas flotan al tope (bloqueos antes que advertencias)
 * y las verificaciones en orden se pliegan en una tarjeta compacta — no en un
 * muro de cajas verdes que entierra el único punto a revisar.
 */

import { useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Clock,
  FileDown,
  Gauge,
  Link2,
  ListChecks,
  PackageX,
  RefreshCw,
  ScrollText,
  ShieldAlert,
  ShieldCheck,
  ThumbsUp,
  TreePine,
} from "@buleje/design-system/icons";
import { CardTitle, WarningAlert, ErrorAlert, LoadingState } from "@buleje/design-system";
import { BulejeGaugeChart } from "@/components/ui-system/charts";
import CtpComplianceHistoria from "./CtpComplianceHistoria";
import CtpDescuadresPanel from "./CtpDescuadresPanel";
import CtpSobreTopePanel from "./CtpSobreTopePanel";
import { Btn, VistaHeader } from "./ctp-shared";
import { useCtpCompliance } from "@/hooks/use-ctp-compliance";
import { ctpComplianceTone, ctpComplianceBreakdown, type CtpComplianceTone } from "@/lib/forestal/ctp-compliance";
import { printCumplimiento } from "@/lib/forestal/ctp-cumplimiento-print";
import { ctpPeriodShortLabel, type CtpPeriod } from "@/lib/forestal/ctp-period";
import type { CtpIngresosFiltroRapido } from "./ctp-shared";

type ComplianceNavTarget = "ingresos" | "saldos" | "despacho" | "produccion" | "ficha";
type Severity = "error" | "warning";

interface CtpCompliancePanelProps {
  period: CtpPeriod;
  /** Salta a la pestaña donde se resuelve la alerta (Ingresos, Saldos, etc.),
   *  con el filtro del caso ya puesto cuando el destino sabe aplicarlo. */
  onNavigate: (target: ComplianceNavTarget, filtro?: CtpIngresosFiltroRapido) => void;
}

/** Descriptor de un chequeo: los datos, no el JSX — se ordena y agrupa antes de pintar. */
interface CheckDescriptor {
  key: string;
  count: number;
  icon: typeof AlertCircle;
  severity: Severity;
  title: string;
  okTitle: string;
  description: string;
  action: string;
  navTarget: ComplianceNavTarget;
  /** Filtro que deja puesto en el destino (sólo Ingresos lo entiende hoy). */
  navFiltro?: CtpIngresosFiltroRapido;
  navigateLabel: string;
}

const TONE_LABEL: Record<CtpComplianceTone, string> = {
  success: "Cumplimiento en orden",
  warning: "Hay puntos que revisar",
  error: "Requiere atención antes de cerrar",
};

/** Color del arco del gauge por tono (tokens del DS). */
const GAUGE_COLOR: Record<CtpComplianceTone, string> = {
  success: "var(--data-success-500)",
  warning: "var(--data-warning-500)",
  error: "var(--data-error-500)",
};

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

export default function CtpCompliancePanel({ period, onNavigate }: CtpCompliancePanelProps) {
  const { data, loading, error, reload } = useCtpCompliance(period);
  const [reportError, setReportError] = useState<string | null>(null);

  if (loading && !data) return <LoadingState message="Calculando cumplimiento del período..." />;

  if (error && !data) {
    return (
      <ErrorAlert
        title="No se pudo calcular el cumplimiento"
        description={error}
        action={
          <Btn variant="secondary" size="sm" onClick={() => void reload()}>
            <RefreshCw className="h-3.5 w-3.5" /> Reintentar
          </Btn>
        }
      />
    );
  }
  if (!data) return null;

  const tone = ctpComplianceTone(data.score);
  const breakdown = ctpComplianceBreakdown(data.counts);
  const totalRestado = breakdown.reduce((a, d) => a + d.puntos, 0);

  const cites = data.citesSinPermisoEspecies;
  const citesIng = data.citesSinPermisoIngresos;
  const prodNeg = data.productosNegativos;
  const trazaLin = data.despachosSinTrazaLineas;
  const rendLin = data.rendimientoAltoLineas;
  const docsVenc = data.documentosVencidosLabels;
  const docsPorVenc = data.documentosPorVencerLabels;

  // ── Los 9 chequeos como datos: se ordenan (bloqueos → advertencias) y se
  //    agrupan (problemas vs. en orden) antes de renderizar. ──
  const checks: CheckDescriptor[] = [
    {
      key: "fueraPlazo",
      count: data.counts.fueraPlazo,
      icon: Clock,
      severity: "error",
      title: `${data.counts.fueraPlazo} ${plural(data.counts.fueraPlazo, "ingreso registrado", "ingresos registrados")} fuera de plazo`,
      okTitle: "Ningún ingreso fuera de plazo",
      description: "SERFOR exige registrar el ingreso dentro de los 2 días hábiles de la operación (RDE D000025-2023).",
      action: "Revisá la columna 'Días registro' en la pestaña Ingresos.",
      navTarget: "ingresos",
      navFiltro: "fuera-de-plazo",
      navigateLabel: "Ver ingresos",
    },
    {
      key: "pendientes",
      count: data.counts.pendientes,
      icon: ThumbsUp,
      severity: "warning",
      title: `${data.counts.pendientes} ${plural(data.counts.pendientes, "ingreso pendiente", "ingresos pendientes")} de validar`,
      okTitle: "Todos los ingresos están validados",
      description: "Un ingreso sin validar no cuenta como materia prima disponible en Saldos.",
      action: "Validalos desde la pestaña Ingresos antes de cerrar el período.",
      navTarget: "ingresos",
      navFiltro: "pendiente",
      navigateLabel: "Ver ingresos",
    },
    {
      key: "cites",
      count: data.counts.citesCount,
      icon: ScrollText,
      severity: "warning",
      title: `${data.counts.citesCount} ${plural(data.counts.citesCount, "ingreso es de especie CITES", "ingresos son de especies CITES")}`,
      okTitle: "Sin especies CITES en el período",
      description:
        cites.length > 0
          ? `Sin permiso CITES cargado en la Ficha: ${cites.slice(0, 3).join(", ")}${cites.length > 3 ? ` y ${cites.length - 3} más` : ""}.`
          : "Las especies CITES requieren permiso de aprovechamiento archivado.",
      action:
        cites.length > 0
          ? "Cargá su N° de permiso CITES en la pestaña Ficha CTP."
          : "Verificá que cada una tenga su permiso CITES a mano para una fiscalización.",
      navTarget: cites.length > 0 ? "ficha" : "ingresos",
      navFiltro: cites.length > 0 ? undefined : "cites",
      navigateLabel: cites.length > 0 ? "Ir a Ficha CTP" : "Ver ingresos",
    },
    {
      key: "citesIng",
      count: citesIng.length,
      icon: ShieldAlert,
      severity: "warning",
      title: `${citesIng.length} ${plural(citesIng.length, "ingreso CITES sin permiso vinculado", "ingresos CITES sin permiso vinculado")}`,
      okTitle: "Cada ingreso CITES tiene su permiso vinculado",
      description:
        citesIng.length > 0
          ? `Un ingreso de especie protegida sin su N° de permiso vinculado no acredita origen legal ante una fiscalización: GTF ${citesIng.slice(0, 4).join(", ")}${citesIng.length > 4 ? ` y ${citesIng.length - 4} más` : ""}.`
          : "Cada acta de ingreso CITES acredita su permiso.",
      action: "Cargá el permiso en la Ficha CTP y vinculalo al registrar el ingreso.",
      navTarget: "ingresos",
      navFiltro: "cites",
      navigateLabel: "Ver ingresos",
    },
    {
      key: "especiesEnNegativo",
      count: data.counts.especiesEnNegativo,
      icon: TreePine,
      severity: "error",
      title: `${data.counts.especiesEnNegativo} ${plural(data.counts.especiesEnNegativo, "especie tiene", "especies tienen")} saldo negativo`,
      okTitle: "Ninguna especie en sobre-consumo",
      description: "Se transformó más volumen del que ingresó validado.",
      action: "Revisá el Balance por especie en la pestaña Saldos.",
      navTarget: "saldos",
      navigateLabel: "Ver saldos",
    },
    {
      key: "stockNegativo",
      count: data.counts.stockNegativo,
      icon: PackageX,
      severity: "error",
      title: `${data.counts.stockNegativo} ${plural(data.counts.stockNegativo, "producto tiene", "productos tienen")} stock negativo`,
      okTitle: "Ningún producto con sobre-despacho",
      description:
        prodNeg.length > 0
          ? `Se despachó más de lo producido en: ${prodNeg.slice(0, 3).join(", ")}${prodNeg.length > 3 ? ` y ${prodNeg.length - 3} más` : ""}.`
          : "Se despachó más producto del que se produjo.",
      action: "Revisá el Stock de productos transformados en la pestaña Saldos.",
      navTarget: "saldos",
      navigateLabel: "Ver saldos",
    },
    {
      key: "despachosSinTraza",
      count: data.counts.despachosSinTraza,
      icon: Link2,
      severity: "warning",
      title: `${data.counts.despachosSinTraza} ${plural(data.counts.despachosSinTraza, "despacho", "despachos")} sin cadena de custodia completa`,
      okTitle: "Todos los despachos tienen cadena de custodia completa",
      description:
        trazaLin.length > 0
          ? `No pueden emitir certificado de trazabilidad: ${plural(trazaLin.length, "línea", "líneas")} #${trazaLin.slice(0, 5).join(", #")}${trazaLin.length > 5 ? ` y ${trazaLin.length - 5} más` : ""}.`
          : "Hay volumen despachado sin corrida de origen atribuida.",
      action: "Completala con 'Editar atribución' dentro del botón 'Cadena' del despacho.",
      navTarget: "despacho",
      navigateLabel: "Ver despachos",
    },
    {
      key: "rendimientoAlto",
      count: data.counts.rendimientoAlto ?? 0,
      icon: Gauge,
      severity: "warning",
      title: `${data.counts.rendimientoAlto ?? 0} ${plural(data.counts.rendimientoAlto ?? 0, "corrida con rendimiento", "corridas con rendimiento")} sobre el referencial SERFOR`,
      okTitle: "Rendimientos dentro del referencial SERFOR",
      description:
        rendLin.length > 0
          ? `Posible sobre-declaración (ref. 56% aserrada / 41% tablillas, RDE D000259-2024): ${plural(rendLin.length, "corrida", "corridas")} #${rendLin.slice(0, 5).join(", #")}${rendLin.length > 5 ? ` y ${rendLin.length - 5} más` : ""}.`
          : "Se declaró más producto del que la troza suele rendir.",
      action: "Verificá el volumen consumido vs. producido en la pestaña Producción.",
      navTarget: "produccion",
      navigateLabel: "Ver producción",
    },
    {
      key: "documentosVencidos",
      count: data.counts.documentosVencidos ?? 0,
      icon: AlertCircle,
      severity: "error",
      title: `${data.counts.documentosVencidos ?? 0} ${plural(data.counts.documentosVencidos ?? 0, "documento vencido", "documentos vencidos")} en la Ficha`,
      okTitle: "Títulos habilitantes y permisos CITES vigentes",
      description:
        docsVenc.length > 0
          ? `Un título habilitante o permiso CITES vencido invalida el origen de la materia prima: ${docsVenc.slice(0, 4).join(", ")}${docsVenc.length > 4 ? ` y ${docsVenc.length - 4} más` : ""}.`
          : "Hay un documento habilitante vencido en la Ficha del CTP.",
      action: "Renová o actualizá su vencimiento en la pestaña Ficha CTP.",
      navTarget: "ficha",
      navigateLabel: "Ir a Ficha CTP",
    },
    {
      key: "documentosPorVencer",
      count: data.counts.documentosPorVencer ?? 0,
      icon: Clock,
      severity: "warning",
      title: `${data.counts.documentosPorVencer ?? 0} ${plural(data.counts.documentosPorVencer ?? 0, "documento vence", "documentos vencen")} en menos de 30 días`,
      okTitle: "Ningún documento de la Ficha vence este mes",
      description:
        docsPorVenc.length > 0
          ? `La renovación ante la ARFFS no es inmediata: ${docsPorVenc.slice(0, 4).join(", ")}${docsPorVenc.length > 4 ? ` y ${docsPorVenc.length - 4} más` : ""}.`
          : "Un documento habilitante de la Ficha está por vencer.",
      action: "Empezá el trámite de renovación antes de que caduque.",
      navTarget: "ficha",
      navigateLabel: "Ir a Ficha CTP",
    },
  ];

  const problemas = checks
    .filter((c) => c.count > 0)
    .sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "error" ? -1 : 1));
  const enOrden = checks.filter((c) => c.count <= 0);
  const bloqueos = problemas.filter((c) => c.severity === "error").length;
  const advertencias = problemas.filter((c) => c.severity === "warning").length;

  // Veredicto de cierre: los bloqueos (chequeos "error" activos) impiden cerrar;
  // las advertencias no bloquean pero conviene mirarlas.
  const readiness: Severity | "ready" = bloqueos > 0 ? "error" : advertencias > 0 ? "warning" : "ready";

  // Reporte imprimible (PDF) para fiscalización: misma data del panel + la
  // identidad del CTP (best-effort desde la Ficha; si falla, el reporte igual sale).
  const reportData = data; // alias no-nullable (data ya pasó el guard `if (!data)`).
  async function handleReport() {
    setReportError(null);
    const ficha = await fetch("/api/admin/forestal/ctp-ficha", { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((body) => body?.ficha ?? null)
      .catch((err) => {
        console.warn("[ctp-report] ficha fetch failed", err);
        return null;
      });
    try {
      printCumplimiento({
        periodLabel: period.label,
        score: reportData.score,
        toneLabel: TONE_LABEL[tone],
        totalIngresos: reportData.totalIngresos,
        readiness,
        bloqueos,
        advertencias,
        enOrdenCount: enOrden.length,
        breakdown: breakdown.map((b) => ({ label: b.label, puntos: b.puntos, casos: b.casos, topeAlcanzado: b.topeAlcanzado })),
        problemas: problemas.map((c) => ({ severity: c.severity, title: c.title, description: c.description, action: c.action })),
        enOrden: enOrden.map((c) => c.okTitle),
        ficha,
      });
    } catch (err) {
      setReportError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="space-y-3">
      <VistaHeader
        titulo="Chequeo del período"
        meta={`${ctpPeriodShortLabel(period)} · ${data.totalIngresos.toLocaleString("es-PE")} ingresos`}
        hint="Los mismos números que exporta el libro a Excel."
      >
        <Btn variant="dark" size="md" onClick={() => void handleReport()}>
          <FileDown className="h-4 w-4" /> Descargar reporte
        </Btn>
        <Btn variant="secondary" size="md" onClick={() => void reload()} disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Recargar
        </Btn>
      </VistaHeader>

      {reportError && <WarningAlert title="No se pudo abrir el reporte" description={reportError} />}

      <ReadinessBanner readiness={readiness} bloqueos={bloqueos} advertencias={advertencias} periodLabel={period.label} onNavigate={onNavigate} />

      {/* Score con gauge firma + desglose transparente de cómo se compone. */}
      <div className="grid gap-4 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-4 sm:grid-cols-[auto_1fr] sm:items-center sm:gap-6">
        <div className="flex justify-center">
          <BulejeGaugeChart value={data.score} max={100} size={190} color={GAUGE_COLOR[tone]} sublabel="de 100" label={TONE_LABEL[tone]} />
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
                    −{d.puntos} pts <span className="text-[length:var(--ts-2xs)] font-normal text-[var(--text-tertiary)]">({d.casos}{d.topeAlcanzado ? "+" : ""} {plural(d.casos, "caso", "casos")})</span>
                  </span>
                ) : (
                  <span className="shrink-0 text-xs font-bold text-[var(--data-success-700)]">sin restar</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* El gauge dice cómo estoy; esto, cómo vengo (ADR-384). Va pegado
          debajo porque la pregunta que sigue a «74/100» es siempre «¿y antes?». */}
      <CtpComplianceHistoria periodo={period.key} periodLabel={period.label} />

      {/* Triage: cuánto a corregir / revisar / en orden, de un vistazo. */}
      <div className="flex flex-wrap items-center gap-2">
        <TriageChip icon={ShieldAlert} count={bloqueos} label={plural(bloqueos, "bloqueo", "bloqueos")} tone="error" />
        <TriageChip icon={AlertTriangle} count={advertencias} label={plural(advertencias, "advertencia", "advertencias")} tone="warning" />
        <TriageChip icon={CheckCircle2} count={enOrden.length} label="en orden" tone="success" />
      </div>

      {/* El cruce de entrada del fiscalizador (ADR-353): declarado vs lista de
          piezas, sobre todo el libro. Va acá y no en una pestaña nueva porque
          una guía que no cuadra ES un hallazgo de fiscalización. */}
      <CtpDescuadresPanel />

      {/* El espejo del anterior, del otro lado del libro (ADR-358): corridas que
          declaran más de lo que sale de su materia prima. */}
      <CtpSobreTopePanel onNavigate={() => onNavigate("produccion")} />

      {problemas.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-[var(--data-warning-600)]" />
            <CardTitle className="text-sm font-bold">
              Requiere atención <span className="text-[var(--text-tertiary)]">({problemas.length})</span>
            </CardTitle>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {problemas.map((c) => (
              <ProblemCard key={c.key} check={c} onNavigate={() => onNavigate(c.navTarget, c.navFiltro)} />
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
  ready: {
    Icon: ShieldCheck,
    box: "border-[var(--data-success-500)]/30 bg-[var(--data-success-50)]",
    text: "text-[var(--data-success-700)]",
    title: "Listo para cerrar el período",
  },
  warning: {
    Icon: AlertTriangle,
    box: "border-[var(--data-warning-500)]/30 bg-[var(--data-warning-50)]",
    text: "text-[var(--data-warning-700)]",
    title: "Podés cerrar el período",
  },
  error: {
    Icon: ShieldAlert,
    box: "border-[var(--data-error-500)]/30 bg-[var(--data-error-50)]",
    text: "text-[var(--data-error-700)]",
    title: "Aún no conviene cerrar",
  },
} as const;

function ReadinessBanner({
  readiness,
  bloqueos,
  advertencias,
  periodLabel,
  onNavigate,
}: {
  readiness: Severity | "ready";
  bloqueos: number;
  advertencias: number;
  periodLabel: string;
  onNavigate: (t: ComplianceNavTarget) => void;
}) {
  const m = READINESS_META[readiness];
  const detail =
    readiness === "error"
      ? `${bloqueos} ${plural(bloqueos, "bloqueo debe resolverse", "bloqueos deben resolverse")} antes de cerrar${advertencias > 0 ? ` · ${advertencias} ${plural(advertencias, "advertencia", "advertencias")} por revisar` : ""}.`
      : readiness === "warning"
        ? `Sin bloqueos en ${periodLabel} · ${advertencias} ${plural(advertencias, "advertencia por revisar", "advertencias por revisar")}.`
        : `${periodLabel} sin bloqueos ni advertencias — el libro está al día.`;
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
        <Btn variant="primary" size="sm" onClick={() => onNavigate("saldos")} className="shrink-0">
          <ShieldCheck className="h-4 w-4" /> Revisar saldos y cerrar
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

function ProblemCard({ check, onNavigate }: { check: CheckDescriptor; onNavigate: () => void }) {
  const AlertComp = check.severity === "error" ? ErrorAlert : WarningAlert;
  return (
    <AlertComp
      icon={check.icon}
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
