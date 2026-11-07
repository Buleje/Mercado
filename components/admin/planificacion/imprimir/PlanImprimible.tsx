"use client";

/**
 * «Imprimir el plan» (ADR-497): el plan entero como documento, para llevarlo
 * al banco, a un socio o a un concurso. Arriba se eligen las partes; abajo,
 * la vista previa tal como sale.
 *
 * Por qué un portal: la impresión global (`globals.css`, `@media print`)
 * esconde todo `.fixed` y todo `body *`, y el modal es `.fixed`. La hoja que
 * se imprime es un hermano de <body> (`#plan-imprimible`, oculto en
 * pantalla) y su CSS de impresión esconde lo demás. El modo oscuro se apaga
 * mientras dura la impresión y los tokens de texto se fijan en tinta oscura
 * por si el navegador imprime después de `afterprint` (Android).
 */
import { useState } from "react";
import { createPortal } from "react-dom";
import { Check, Printer } from "@buleje/design-system/icons";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { ModalFooter } from "@/components/admin/shared/ModalFooter";
import { usePanelTokens } from "@/components/admin/shared/use-panel-tokens";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { button } from "@/components/ui-system/button-variants";
import { usePlanEmpresa } from "@/hooks/use-plan-empresa";
import { llenado } from "@/lib/planificacion/calculos";
import { NOMBRE_SECCION, SECCIONES_PLAN, type DatosPlan, type DatosSeccion, type SeccionPlan } from "@/lib/planificacion/secciones";
import { cn, limaDateKey } from "@/lib/utils";
import { DocumentoPlan } from "./DocumentoPlan";

const ID_HOJA = "plan-imprimible";

const CSS_IMPRESION = `@media print {
  html, body { overflow: visible !important; height: auto !important; }
  body > *:not(#${ID_HOJA}) { display: none !important; }
  #${ID_HOJA} { display: block !important; position: static !important; color-scheme: light;
    --text-primary: black; --text-secondary: dimgray; --text-tertiary: gray;
    --rule-base: silver; --rule-soft: gainsboro; --rule-strong: gray; --surface-raised: transparent; }
  #${ID_HOJA}, #${ID_HOJA} * { visibility: visible !important; }
  @page { size: A4; margin: 14mm; }
}`;

/** Las secciones que tienen algo escrito: una en blanco no sale en el papel. */
function conContenido(plan: Partial<DatosPlan>): SeccionPlan[] {
  return SECCIONES_PLAN.filter((s) => {
    const d = plan[s];
    return d !== undefined && llenado(s, d as DatosSeccion<typeof s>) > 0;
  });
}

function SelectorPartes({
  partes,
  fuera,
  enBlanco,
  onAlternar,
}: {
  partes: readonly SeccionPlan[];
  fuera: ReadonlySet<SeccionPlan>;
  enBlanco: readonly SeccionPlan[];
  onAlternar: (s: SeccionPlan) => void;
}) {
  return (
    <fieldset className="space-y-2">
      <legend className="flex items-center gap-1.5 text-sm font-medium text-[var(--text-primary)]">
        Qué va en el documento
        <InfoTip
          what="Toca una parte para sacarla o volver a ponerla. Sale en el orden del plan, numerada."
          affects={enBlanco.length > 0 ? `No salen porque están en blanco: ${enBlanco.map((s) => NOMBRE_SECCION[s]).join(", ")}.` : undefined}
          example="Para el banco: ficha, inversión, socios y objetivos. Para un concurso: todo."
        />
      </legend>
      <div className="flex flex-wrap gap-2">
        {partes.map((s) => {
          const dentro = !fuera.has(s);
          return (
            <button
              key={s}
              type="button"
              aria-pressed={dentro}
              onClick={() => onAlternar(s)}
              className={cn(
                "flex h-10 items-center gap-1.5 rounded-full border px-3 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:outline-none",
                dentro
                  ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-ink)]"
                  : "border-[var(--rule-base)] text-[var(--text-secondary)] hover:border-[var(--rule-strong)]",
              )}
            >
              {dentro ? <Check className="h-4 w-4" aria-hidden /> : null}
              {NOMBRE_SECCION[s]}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

interface Props {
  abierto: boolean;
  onCerrar: () => void;
}

export function PlanImprimible({ abierto, onCerrar }: Props) {
  const { datos, membrete } = usePlanEmpresa();
  const tokens = usePanelTokens(abierto);
  const [fuera, setFuera] = useState<ReadonlySet<SeccionPlan>>(new Set());
  const hoy = limaDateKey();
  const partes = conContenido(datos);
  const enBlanco = SECCIONES_PLAN.filter((s) => datos[s] !== undefined && !partes.includes(s));
  const elegidas = partes.filter((s) => !fuera.has(s));
  const nombre = membrete?.nombre || datos.ficha?.nombreComercial || "tu empresa";

  const alternar = (s: SeccionPlan) =>
    setFuera((prev) => {
      const sig = new Set(prev);
      if (sig.has(s)) sig.delete(s);
      else sig.add(s);
      return sig;
    });

  const imprimir = () => {
    const html = document.documentElement;
    const oscuro = html.classList.contains("dark");
    const esquema = html.style.colorScheme;
    const titulo = document.title;
    if (oscuro) {
      html.classList.remove("dark");
      html.style.colorScheme = "light";
    }
    /* El título es el nombre del PDF cuando se guarda en vez de imprimir. */
    document.title = `Plan de ${nombre} ${hoy}`;
    const volver = () => {
      if (oscuro) {
        html.classList.add("dark");
        html.style.colorScheme = esquema;
      }
      document.title = titulo;
    };
    window.addEventListener("afterprint", volver, { once: true });
    window.print();
  };

  const documento = <DocumentoPlan plan={datos} membrete={membrete} hoy={hoy} secciones={elegidas} />;

  return (
    <>
      <AdminModal
        open={abierto}
        onClose={onCerrar}
        title="Imprimir el plan"
        icon={Printer}
        size="xl"
        footer={
          <ModalFooter nota="Sale en A4 y en claro, aunque uses el modo oscuro.">
            <button type="button" className={button({ variant: "secondary" })} onClick={onCerrar}>
              Cerrar
            </button>
            <button type="button" className={button({ variant: "primary" })} onClick={imprimir} disabled={elegidas.length === 0}>
              <Printer className="h-4 w-4" aria-hidden />
              Imprimir
            </button>
          </ModalFooter>
        }
      >
        <div className={cn(MODAL_BODY, "space-y-4")}>
          {partes.length === 0 ? (
            <span className="block text-sm text-[var(--text-secondary)]">Todavía no hay nada escrito en el plan para imprimir.</span>
          ) : (
            <>
              <SelectorPartes partes={partes} fuera={fuera} enBlanco={enBlanco} onAlternar={alternar} />
              <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4 sm:p-8" data-qa="plan-vista-previa">
                {documento}
              </div>
            </>
          )}
        </div>
      </AdminModal>
      {abierto && typeof document !== "undefined"
        ? createPortal(
            <div id={ID_HOJA} className="hidden print:block" style={tokens} aria-hidden>
              <style>{CSS_IMPRESION}</style>
              {documento}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
