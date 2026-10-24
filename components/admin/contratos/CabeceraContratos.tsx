"use client";

/**
 * La cabecera de Documentos › Contratos en UNA fila (11-10): título · ⓘ ·
 * Indicadores · Nuevo contrato · «⋯».
 *
 * Antes eran tres pisos: el título con «Nuevo contrato», una barra de cinco
 * pestañas (Dashboard · Plantillas · Mis Contratos · Crear Contrato · Editor)
 * —un tercer nivel debajo de Documentos › Contratos— y, en Dashboard, cinco
 * tarjetas y un bloque negro de ancho completo antes de llegar a un solo
 * contrato. Ahora lo que se abre es la lista; las cifras van en «Indicadores»
 * (plegadas, con el titular en una línea) y Plantillas, Editor y los gráficos
 * son pasos o consultas que se piden desde «Nuevo contrato» o el «⋯», con una
 * línea «← Mis contratos» para volver. Los `?sub=` de siempre siguen valiendo.
 */

import type { ComponentType } from "react";
import { CardTitle, SectionTitle } from "@buleje/design-system";
import {
  AlertCircle, ArrowLeft, BarChart3, BookOpen, CheckCircle, Clock, Edit3, FileText, MoreHorizontal, PenTool, Plus, RefreshCw,
} from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import ActionMenu from "@/components/admin/shared/action-menu";
import { useKpisPlegables } from "@/components/admin/forestal/kpis-plegables";
import { button } from "@/components/ui-system/button-variants";
import { cn } from "@/lib/utils";

export type SeccionContratos = "dashboard" | "plantillas" | "contratos" | "crear" | "editor";

export interface CifrasContratos {
  total: number;
  vigentes: number;
  pendientesFirma: number;
  porVencer: number;
  vencidos: number;
}

interface Props {
  seccion: SeccionContratos;
  irA: (s: SeccionContratos) => void;
  cifras: CifrasContratos;
  /** «S/ 1 200,00» — lo comprometido en contratos que siguen en pie. */
  plataVigente: string;
  /** Hay contratos en dólares: no se suman a la cifra en soles. */
  hayDolares: boolean;
  cargando: boolean;
  onActualizar: () => void;
}

const TITULO_DEL_PASO: Record<Exclude<SeccionContratos, "contratos">, string> = {
  dashboard: "Resumen",
  plantillas: "Elige una plantilla",
  crear: "Nuevo contrato",
  editor: "Editor de plantillas",
};

type Tono = "neutral" | "warning" | "danger";

function Tarjeta({ label, value, icon: Icon, tono }: { label: string; value: number; icon: ComponentType<{ className?: string }>; tono: Tono }) {
  const fondo =
    tono === "warning" ? "bg-[color-mix(in_oklch,var(--data-warning)_12%,transparent)]"
      : tono === "danger" ? "bg-[color-mix(in_oklch,var(--data-error)_12%,transparent)]"
      : "bg-[color-mix(in_oklch,var(--accent)_10%,transparent)]";
  const color =
    tono === "warning" ? "text-[var(--data-warning-ink)]"
      : tono === "danger" ? "text-[var(--data-error-ink)]"
      : "text-[var(--text-primary)]";
  return (
    <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4">
      <div className="flex items-center gap-3">
        <div className={cn("flex h-10 w-10 items-center justify-center rounded-lg", fondo)}>
          <Icon className={cn("h-5 w-5", tono === "neutral" ? "text-[var(--text-secondary)]" : color)} />
        </div>
        <div>
          <p className={cn("text-2xl font-bold tabular-nums", color)}>{value}</p>
          <p className="text-sm text-[var(--text-tertiary)]">{label}</p>
        </div>
      </div>
    </div>
  );
}

export default function CabeceraContratos({ seccion, irA, cifras, plataVigente, hayDolares, cargando, onActualizar }: Props) {
  const kpis = useKpisPlegables({
    claveMemoria: "documentos-contratos",
    alto: "md",
    compactoEnMovil: true,
    sinDatosAun: cargando,
    // ~22 caracteres es lo que entra en el botón (24rem, mono): lo demás va en el panel.
    resumen: `${cifras.total} contratos · ${cifras.porVencer} vencen`,
    encabezado: (
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 py-3">
        <span className="text-sm text-[var(--text-secondary)]">
          Plata comprometida en contratos vigentes
          {hayDolares && (
            <InfoTip
              className="ml-1.5 align-middle"
              title="Contratos en dólares"
              what={<span>Hay contratos en dólares: se muestran aparte en cada ficha, no se suman acá.</span>}
            />
          )}
        </span>
        <span className="text-2xl font-bold tabular-nums text-[var(--text-primary)]">{plataVigente}</span>
      </div>
    ),
    tarjetas: [
      <Tarjeta key="total" label="Contratos" value={cifras.total} icon={FileText} tono="neutral" />,
      <Tarjeta key="vigentes" label="Vigentes" value={cifras.vigentes} icon={CheckCircle} tono="neutral" />,
      <Tarjeta key="firma" label="Esperando firma" value={cifras.pendientesFirma} icon={PenTool} tono="neutral" />,
      <Tarjeta key="vencer" label="Por vencer" value={cifras.porVencer} icon={Clock} tono={cifras.porVencer > 0 ? "warning" : "neutral"} />,
      <Tarjeta key="vencidos" label="Vencidos" value={cifras.vencidos} icon={AlertCircle} tono={cifras.vencidos > 0 ? "danger" : "neutral"} />,
    ],
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
        <div className="flex shrink-0 items-center gap-2">
          <SectionTitle className="whitespace-nowrap">Contratos</SectionTitle>
          <InfoTip
            title="Contratos"
            side="bottom"
            what="Los contratos del negocio armados con plantillas peruanas: alquiler, servicios, trabajo y compraventa, con su firma y su vencimiento."
            affects="Un contrato por vencer te avisa antes de la fecha. Los de una persona del equipo se ven también en Equipo › Contratos."
            example="Alquilas el local de Jr. Ucayali por un año: eliges la plantilla, completas los datos y lo mandas a firmar."
          />
        </div>
        <div className="ml-auto flex min-w-0 items-center justify-end gap-2">
          {kpis.boton}
          <button
            type="button"
            onClick={() => irA("plantillas")}
            className={button({ variant: "primary", className: "rounded-xl max-sm:w-12 max-sm:px-0" })}
          >
            <Plus className="h-4 w-4" aria-hidden />
            <span className="max-sm:sr-only">Nuevo contrato</span>
          </button>
          <ActionMenu
            label="Más"
            icon={MoreHorizontal}
            soloIcono
            size="md"
            className="w-12 shrink-0"
            title="Plantillas, editor de plantillas, resumen y actualizar"
            actions={[
              { id: "lista", label: "Mis contratos", icon: FileText, onSelect: () => irA("contratos"), activo: seccion === "contratos" },
              { id: "resumen", label: "Resumen con gráficos", hint: "Por tipo, por mes y los que vencen pronto", icon: BarChart3, onSelect: () => irA("dashboard"), activo: seccion === "dashboard" },
              { id: "plantillas", label: "Plantillas", hint: "Los modelos con cláusulas peruanas", icon: BookOpen, onSelect: () => irA("plantillas"), activo: seccion === "plantillas" },
              { id: "editor", label: "Editor de plantillas", hint: "Ajusta las cláusulas de un modelo", icon: Edit3, onSelect: () => irA("editor"), activo: seccion === "editor" },
              { id: "actualizar", label: "Actualizar", icon: RefreshCw, onSelect: onActualizar },
            ]}
          />
        </div>
      </div>

      {kpis.panel}

      {seccion !== "contratos" && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <button
            type="button"
            onClick={() => irA("contratos")}
            className="-ml-3 inline-flex h-12 items-center gap-2 rounded-xl px-3 text-sm font-bold text-[var(--accent-ink)] transition-colors hover:bg-[var(--accent)]/10 dark:text-[var(--accent)]"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden /> Mis contratos
          </button>
          <div className="flex items-center gap-1.5">
            <CardTitle className="text-[var(--text-primary)]">{TITULO_DEL_PASO[seccion]}</CardTitle>
            {seccion === "plantillas" && (
              <InfoTip
                title="Plantillas"
                what="Cada plantilla trae cláusulas legales peruanas reales y la norma que la respalda."
                affects="Al elegir una completas sus datos paso a paso y el contrato queda listo para firmar."
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
