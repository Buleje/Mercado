"use client";

/**
 * CtpCompliancePanel — pestaña "Cumplimiento" del Libro CTP (ADR-124/127).
 *
 * Las 5 alertas que hoy solo aparecían al abrir el Excel exportado
 * (`lib/forestal/ctp-export.ts`, hoja Resumen) ahora se ven en el módulo sin
 * tener que descargar nada. Mismos números, misma fuente: los agregados
 * vienen de `WoodEntriesDB.stats()` y `ForestCtpDB.saldos()` (DB, no cliente),
 * y el score sale de `lib/forestal/ctp-compliance.ts` — el mismo archivo que
 * ahora también consume el export, así que panel y Excel nunca van a decir
 * números distintos.
 */

import {
  AlertCircle,
  Clock,
  Gauge,
  Link2,
  PackageX,
  RefreshCw,
  ScrollText,
  ThumbsUp,
  TreePine,
} from "@buleje/design-system/icons";
import { StatCard, WarningAlert, ErrorAlert, SuccessAlert, LoadingState } from "@buleje/design-system";
import { useCtpCompliance } from "@/hooks/use-ctp-compliance";
import { ctpComplianceTone } from "@/lib/forestal/ctp-compliance";
import type { CtpPeriod } from "@/lib/forestal/ctp-period";

type ComplianceNavTarget = "ingresos" | "saldos" | "despacho" | "produccion" | "ficha";

interface CtpCompliancePanelProps {
  period: CtpPeriod;
  /** Salta a la pestaña donde se resuelve la alerta (Ingresos o Saldos). */
  onNavigate: (target: ComplianceNavTarget) => void;
}

const TONE_LABEL: Record<ReturnType<typeof ctpComplianceTone>, string> = {
  success: "Cumplimiento en orden",
  warning: "Hay puntos que revisar",
  error: "Requiere atención antes de cerrar el período",
};

export default function CtpCompliancePanel({ period, onNavigate }: CtpCompliancePanelProps) {
  const { data, loading, error, reload } = useCtpCompliance(period);

  if (loading && !data) return <LoadingState message="Calculando cumplimiento del período..." />;

  if (error && !data) {
    return (
      <ErrorAlert
        title="No se pudo calcular el cumplimiento"
        description={error}
        action={
          <button
            type="button"
            onClick={() => void reload()}
            className="inline-flex h-9 items-center gap-2 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)]"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Reintentar
          </button>
        }
      />
    );
  }
  if (!data) return null;

  const tone = ctpComplianceTone(data.score);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-[var(--text-tertiary)]">
          Chequeo de <strong className="text-[var(--text-secondary)]">{period.label}</strong> sobre{" "}
          {data.totalIngresos.toLocaleString("es-PE")} ingresos registrados. Mismos números que exporta
          el libro a Excel.
        </p>
        <button
          type="button"
          onClick={() => void reload()}
          disabled={loading}
          className="inline-flex h-10 shrink-0 items-center gap-2 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)] disabled:opacity-60"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Recargar
        </button>
      </div>

      <StatCard
        label="Score de cumplimiento del período"
        value={`${data.score}/100`}
        subValue={TONE_LABEL[tone]}
        icon={Gauge}
        emphasis={tone}
        density="comfortable"
      />

      <div className="grid gap-3 md:grid-cols-2">
        <ComplianceRow
          count={data.counts.fueraPlazo}
          icon={Clock}
          title={(n) => `${n} ${n === 1 ? "ingreso registrado" : "ingresos registrados"} fuera de plazo`}
          okTitle="Ningún ingreso fuera de plazo"
          description="SERFOR exige registrar el ingreso dentro de los 2 días hábiles de la operación (RDE D000025-2023)."
          action="Revisá la columna 'Días registro' en la pestaña Ingresos."
          onNavigate={() => onNavigate("ingresos")}
          navigateLabel="Ver ingresos"
          severity="error"
        />
        <ComplianceRow
          count={data.counts.pendientes}
          icon={ThumbsUp}
          title={(n) => `${n} ${n === 1 ? "ingreso" : "ingresos"} pendiente${data.counts.pendientes === 1 ? "" : "s"} de validar`}
          okTitle="Todos los ingresos están validados"
          description="Un ingreso sin validar no cuenta como materia prima disponible en Saldos."
          action="Validalos desde la pestaña Ingresos antes de cerrar el período."
          onNavigate={() => onNavigate("ingresos")}
          navigateLabel="Ver ingresos"
          severity="warning"
        />
        <ComplianceRow
          count={data.counts.citesCount}
          icon={ScrollText}
          title={(n) => `${n} ${n === 1 ? "ingreso es de especie CITES" : "ingresos son de especies CITES"}`}
          okTitle="Sin especies CITES en el período"
          description={
            data.citesSinPermisoEspecies.length > 0
              ? `Sin permiso CITES cargado en la Ficha: ${data.citesSinPermisoEspecies.slice(0, 3).join(", ")}${data.citesSinPermisoEspecies.length > 3 ? ` y ${data.citesSinPermisoEspecies.length - 3} más` : ""}.`
              : "Las especies CITES requieren permiso de aprovechamiento archivado."
          }
          action={
            data.citesSinPermisoEspecies.length > 0
              ? "Cargá su N° de permiso CITES en la pestaña Ficha CTP."
              : "Verificá que cada una tenga su permiso CITES a mano para una fiscalización."
          }
          onNavigate={() => onNavigate(data.citesSinPermisoEspecies.length > 0 ? "ficha" : "ingresos")}
          navigateLabel={data.citesSinPermisoEspecies.length > 0 ? "Ir a Ficha CTP" : "Ver ingresos"}
          severity="warning"
        />
        <ComplianceRow
          count={data.counts.especiesEnNegativo}
          icon={TreePine}
          title={(n) => `${n} ${n === 1 ? "especie tiene" : "especies tienen"} saldo negativo`}
          okTitle="Ninguna especie en sobre-consumo"
          description="Se transformó más volumen del que ingresó validado."
          action="Revisá el Balance por especie en la pestaña Saldos."
          onNavigate={() => onNavigate("saldos")}
          navigateLabel="Ver saldos"
          severity="error"
        />
        <ComplianceRow
          count={data.counts.stockNegativo}
          icon={PackageX}
          title={(n) => `${n} ${n === 1 ? "producto tiene" : "productos tienen"} stock negativo`}
          okTitle="Ningún producto con sobre-despacho"
          description={
            data.productosNegativos.length > 0
              ? `Se despachó más de lo producido en: ${data.productosNegativos.slice(0, 3).join(", ")}${data.productosNegativos.length > 3 ? ` y ${data.productosNegativos.length - 3} más` : ""}.`
              : "Se despachó más producto del que se produjo."
          }
          action="Revisá el Stock de productos transformados en la pestaña Saldos."
          onNavigate={() => onNavigate("saldos")}
          navigateLabel="Ver saldos"
          severity="error"
        />
        <ComplianceRow
          count={data.counts.despachosSinTraza}
          icon={Link2}
          title={(n) => `${n} ${n === 1 ? "despacho" : "despachos"} sin cadena de custodia completa`}
          okTitle="Todos los despachos tienen cadena de custodia completa"
          description={
            data.despachosSinTrazaLineas.length > 0
              ? `No pueden emitir certificado de trazabilidad: ${data.despachosSinTrazaLineas.length === 1 ? "línea" : "líneas"} #${data.despachosSinTrazaLineas.slice(0, 5).join(", #")}${data.despachosSinTrazaLineas.length > 5 ? ` y ${data.despachosSinTrazaLineas.length - 5} más` : ""}.`
              : "Hay volumen despachado sin corrida de origen atribuida."
          }
          action="Completala con 'Editar atribución' dentro del botón 'Cadena' del despacho."
          onNavigate={() => onNavigate("despacho")}
          navigateLabel="Ver despachos"
          severity="warning"
        />
        <ComplianceRow
          count={data.counts.rendimientoAlto ?? 0}
          icon={Gauge}
          title={(n) => `${n} ${n === 1 ? "corrida con rendimiento" : "corridas con rendimiento"} sobre el referencial SERFOR`}
          okTitle="Rendimientos dentro del referencial SERFOR"
          description={
            data.rendimientoAltoLineas.length > 0
              ? `Posible sobre-declaración (ref. 56% aserrada / 41% tablillas, RDE D000259-2024): ${data.rendimientoAltoLineas.length === 1 ? "corrida" : "corridas"} #${data.rendimientoAltoLineas.slice(0, 5).join(", #")}${data.rendimientoAltoLineas.length > 5 ? ` y ${data.rendimientoAltoLineas.length - 5} más` : ""}.`
              : "Se declaró más producto del que la troza suele rendir."
          }
          action="Verificá el volumen consumido vs. producido en la pestaña Producción."
          onNavigate={() => onNavigate("produccion")}
          navigateLabel="Ver producción"
          severity="warning"
        />
      </div>
    </div>
  );
}

interface ComplianceRowProps {
  count: number;
  icon: typeof AlertCircle;
  title: (n: number) => string;
  okTitle: string;
  description: string;
  action: string;
  onNavigate: () => void;
  navigateLabel: string;
  severity: "error" | "warning";
}

function ComplianceRow({
  count,
  icon,
  title,
  okTitle,
  description,
  action,
  onNavigate,
  navigateLabel,
  severity,
}: ComplianceRowProps) {
  const NavButton = (
    <button
      type="button"
      onClick={onNavigate}
      className="inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)]"
    >
      {navigateLabel}
    </button>
  );

  if (count <= 0) {
    return <SuccessAlert title={okTitle} />;
  }

  const AlertComp = severity === "error" ? ErrorAlert : WarningAlert;
  return (
    <AlertComp
      icon={icon}
      title={title(count)}
      description={
        <>
          {description} <strong>{action}</strong>
        </>
      }
      action={NavButton}
    />
  );
}
