"use client";

/**
 * Una planilla de campo: para qué es, su fórmula, sus columnas en chiquito y
 * las cuatro cosas que se hacen con ella — imprimirla, bajar el Excel, ver el
 * prompt con que la IA la lee e importar la foto ya llenada.
 */
import { useState } from "react";
import Link from "next/link";
import { CardTitle } from "@buleje/design-system";
import {
  AlertTriangle,
  Calculator,
  Camera,
  ClipboardCheck,
  FileSpreadsheet,
  ListChecks,
  Loader2,
  Printer,
  Ruler,
  Smartphone,
  Sparkles,
  TreePine,
  type LucideIcon,
} from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { button } from "@/components/ui-system/button-variants";
import { irAEnlace } from "@/components/admin/shared/ir-a-enlace";
import { usePermisoDe } from "@/hooks/use-vistas-permitidas";
import type { PlanillaCampo, PlanillaId, PromptGuardado } from "@/lib/forestal/planillas/tipos";
import HojaMiniatura from "./HojaMiniatura";
import { imprimirPlanilla } from "./imprimir-planilla";
import { IR_AL_IMPORTADOR, pedirImportarFoto } from "./importar-pendiente";
import { bajarExcelDePlanilla } from "./planillas-api";
import { promptDesactualizado } from "./use-planillas";

const ICONO: Record<PlanillaId, LucideIcon> = {
  "aserrada-pt": Calculator,
  "rolliza-smalian": Ruler,
  "rolliza-oxapampa": Ruler,
  "conteo-patio": ListChecks,
  "parte-produccion": ClipboardCheck,
  "censo-arboles": TreePine,
};

const BOTON = button({ variant: "secondary", className: "w-full rounded-xl px-3" });
const BOTON_FOTO = button({ variant: "primary", className: "w-full rounded-xl px-3" });

export default function TarjetaPlanilla({
  planilla,
  guardado,
  negocio,
  onPrompt,
  onIrAVista,
}: {
  planilla: PlanillaCampo;
  guardado: PromptGuardado | null;
  negocio: string;
  onPrompt: () => void;
  /** Para los importadores que viven en Herramientas (cubicador, trozas). */
  onIrAVista: (vista: "cubicador" | "trozas") => void;
}) {
  const [ocupado, setOcupado] = useState<"imprimir" | "excel" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ir = IR_AL_IMPORTADOR[planilla.destino];
  const puedeIr = usePermisoDe([ir.tipo === "enlace" ? ir.permiso : "forestal-herramientas"]);
  const Icono = ICONO[planilla.id];
  const viejo = promptDesactualizado(planilla, guardado);
  const calculadas = planilla.columnas.filter((c) => c.calculada).map((c) => c.titulo);

  const correr = async (que: "imprimir" | "excel", fn: () => Promise<void>) => {
    setOcupado(que);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setOcupado(null);
    }
  };

  const importar = () => {
    if (ir.tipo === "sin-importador") return;
    pedirImportarFoto(planilla.id);
    if (ir.tipo === "vista") onIrAVista(ir.vista);
    else irAEnlace(ir.href);
  };

  return (
    <article className="flex h-full min-w-0 flex-col gap-3 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-3">
      <header className="flex items-start gap-3">
        <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--accent-muted)] text-[var(--accent)]">
          <Icono className="h-5 w-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <CardTitle as="h4" className="text-sm font-bold leading-snug text-[var(--text-primary)]">
            {planilla.nombre}
          </CardTitle>
          <p className="mt-0.5 text-sm leading-snug text-[var(--text-secondary)]">{planilla.descripcion}</p>
        </div>
        <InfoTip
          title={planilla.nombre}
          what={`Hoja A4 ${planilla.orientacion === "horizontal" ? "echada" : "parada"} de ${planilla.filasPorHoja} renglones, con casilleros arriba para ${planilla.cabecera.map((c) => c.titulo.toLowerCase()).join(", ")}.`}
          affects={
            ir.tipo === "sin-importador"
              ? `No se importa por foto: el conteo se hace con ${ir.donde}. La hoja es el respaldo en papel.`
              : `La foto llenada se carga en ${ir.tipo === "vista" ? (ir.vista === "cubicador" ? "el Cubicador de madera" : "el Cubicador de trozas") : ir.donde}; ahí revisas las filas antes de guardar.`
          }
          example={calculadas.length > 0 ? `La columna rayada (${calculadas.join(", ")}) la calcula el sistema con la fórmula: no hace falta llenarla.` : undefined}
          side="left"
        />
      </header>

      {planilla.metodo && (
        <p className="rounded-lg bg-[var(--surface-sunken)] px-2.5 py-1.5 font-mono text-xs leading-relaxed text-[var(--text-secondary)]">
          {planilla.metodo}
        </p>
      )}

      <HojaMiniatura planilla={planilla} />

      <p className={`flex items-center gap-1.5 text-sm ${viejo ? "font-semibold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]" : "text-[var(--text-secondary)]"}`}>
        {viejo ? <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden /> : <Sparkles className="h-4 w-4 shrink-0" aria-hidden />}
        {guardado
          ? viejo
            ? `Tu prompt es de la versión ${guardado.basadoEnVersion}; ya va la ${planilla.versionPrompt}`
            : "La IA la lee con tu prompt"
          : `La IA la lee con el prompt de fábrica (v${planilla.versionPrompt})`}
      </p>

      <div className="mt-auto grid grid-cols-2 gap-2">
        <button type="button" className={BOTON} disabled={ocupado !== null} onClick={() => void correr("imprimir", () => imprimirPlanilla(planilla, { negocio }))}>
          {ocupado === "imprimir" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Printer className="h-4 w-4" aria-hidden />}
          Imprimir
        </button>
        <button type="button" className={BOTON} disabled={ocupado !== null} onClick={() => void correr("excel", () => bajarExcelDePlanilla(planilla.id))}>
          {ocupado === "excel" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <FileSpreadsheet className="h-4 w-4" aria-hidden />}
          Excel
        </button>
        <button type="button" className={BOTON} onClick={onPrompt}>
          <Sparkles className="h-4 w-4" aria-hidden />
          Prompt
        </button>
        {ir.tipo === "sin-importador" ? (
          <Link href={ir.href} className={BOTON_FOTO}>
            <Smartphone className="h-4 w-4" aria-hidden />
            Contar
          </Link>
        ) : (
          <button
            type="button"
            className={BOTON_FOTO}
            disabled={!puedeIr}
            title={puedeIr ? undefined : `Tu usuario no entra a ${ir.tipo === "enlace" ? ir.donde.split(" › ")[0] : "Herramientas"}`}
            onClick={importar}
          >
            <Camera className="h-4 w-4" aria-hidden />
            Importar foto
          </button>
        )}
      </div>

      {error && (
        <p role="alert" className="text-sm font-semibold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
          {error}
        </p>
      )}
    </article>
  );
}
