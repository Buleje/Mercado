"use client";

/**
 * La ventana del prompt de una planilla: lo que la IA recibe para leer esa
 * hoja. Se ve el vigente (el de fábrica o el del negocio), se copia para
 * usarlo en otra IA, se edita y se guarda como el del negocio, y se vuelve al
 * de fábrica. Si el del negocio se escribió sobre una versión de fábrica
 * anterior, se avisa y se puede mirar el nuevo al lado.
 */
import { useState } from "react";
import { AlertTriangle, ChevronDown, Copy, Loader2, Lock, RotateCcw, Save, Sparkles } from "@buleje/design-system/icons";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import SegmentedControl from "@/components/ui-system/SegmentedControl";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { limaDateKey } from "@/lib/utils";
import type { PlanillaCampo, PromptGuardado } from "@/lib/forestal/planillas/tipos";
import { Btn, ModalFooter } from "../ctp-shared";
import { usePromptPlanilla } from "./use-prompt-planilla";

const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"] as const;

/** «jueves 10/09» del día de Lima (días escritos a mano: `Intl` cambia con ICU). */
function diaDeLima(iso: string): string {
  const k = limaDateKey(iso);
  const d = new Date(`${k}T00:00:00Z`);
  return Number.isFinite(d.getTime()) ? `${DIAS[d.getUTCDay()]} ${k.slice(8, 10)}/${k.slice(5, 7)}` : "";
}

const AREA =
  "block w-full rounded-xl border-[1.5px] border-[var(--rule-base)] bg-[var(--surface-raised)] p-3 font-mono text-sm leading-relaxed text-[var(--text-primary)] outline-none transition-[border-color,box-shadow] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-muted)] read-only:bg-[var(--surface-sunken)] read-only:text-[var(--text-secondary)]";

export default function VentanaPrompt({
  planilla,
  guardado,
  onCambio,
  onCerrar,
}: {
  planilla: PlanillaCampo;
  guardado: PromptGuardado | null;
  onCambio: (g: PromptGuardado | null) => void;
  onCerrar: () => void;
}) {
  const p = usePromptPlanilla(planilla, guardado, onCambio);
  const [ver, setVer] = useState<"tuyo" | "fabrica">("tuyo");
  const mirandoFabrica = guardado != null && ver === "fabrica";

  return (
    <AdminModal
      open
      onClose={onCerrar}
      variant="wide"
      title={`Prompt · ${planilla.nombre}`}
      description={
        p.origen === "negocio"
          ? `El de tu negocio${guardado?.actualizadoEn ? ` · ${diaDeLima(guardado.actualizadoEn)}` : ""}${guardado?.actualizadoPor ? ` · ${guardado.actualizadoPor}` : ""}`
          : `De fábrica · versión ${planilla.versionPrompt}`
      }
      icon={Sparkles}
      ayuda={
        <InfoTip
          title="¿Qué es el prompt?"
          what="Las instrucciones que le damos a la IA para leer esta hoja: qué columnas tiene, en qué unidad va cada una y qué hacer con lo que no se entiende."
          affects="Lo usa «Importar foto llenada»: si lo cambias acá, la próxima foto de esta planilla se lee con el tuyo. «Qué devolver» no se edita: sale de las columnas de la hoja y va siempre al final."
          example="Si tus operarios escriben «tor» por tornillo, agrégalo: «tor = Tornillo». No le cambies el nombre a las columnas: la IA las busca por ese nombre."
        />
      }
      footer={
        <ModalFooter error={p.error} aviso={p.aviso} nota={p.cambiado && !mirandoFabrica ? "Tienes cambios sin guardar" : undefined}>
          <Btn variant="ghost" onClick={() => void p.copiar()}>
            <Copy className="h-4 w-4" /> Copiar
          </Btn>
          {(p.origen === "negocio" || p.cambiado) && (
            <Btn variant="secondary" disabled={p.ocupado !== null} onClick={() => void (p.cambiado ? p.deshacer() : p.volverAFabrica())}>
              {p.ocupado === "fabrica" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
              {p.cambiado ? "Deshacer" : "Usar el de fábrica"}
            </Btn>
          )}
          <Btn variant="dark" disabled={!p.cambiado || p.vacio || p.ocupado !== null || mirandoFabrica} onClick={() => void p.guardar()}>
            {p.ocupado === "guardar" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Guardar como el mío
          </Btn>
        </ModalFooter>
      }
    >
      <div className={`space-y-3 ${MODAL_BODY}`}>
        {p.desactualizado && guardado && (
          <p className="flex items-start gap-2 rounded-xl border border-[var(--data-warning-500)] bg-[var(--data-warning-50)] px-3 py-2 text-sm font-semibold text-[var(--data-warning-700)] dark:bg-[var(--data-warning-500)]/12 dark:text-[var(--data-warning-500)]">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            Tu prompt se escribió sobre la versión {guardado.basadoEnVersion} de fábrica y ya va la {planilla.versionPrompt}. Mira el de fábrica y decide si lo guardas de nuevo o vuelves a él.
          </p>
        )}

        {guardado && (
          <SegmentedControl
            value={ver}
            onChange={setVer}
            label="Qué prompt ver"
            options={[
              { value: "tuyo", label: "El tuyo" },
              { value: "fabrica", label: `De fábrica (v${planilla.versionPrompt})` },
            ]}
          />
        )}

        {mirandoFabrica ? (
          <textarea readOnly value={p.deFabrica} rows={12} aria-label="Prompt de fábrica" className={AREA} />
        ) : (
          <textarea
            value={p.texto}
            onChange={(e) => p.setTexto(e.target.value)}
            rows={12}
            spellCheck={false}
            aria-label={`Prompt para leer la ${planilla.nombre}`}
            className={AREA}
          />
        )}

        <details className="group rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-sunken)]">
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-3 text-sm font-semibold text-[var(--text-secondary)]">
            <Lock className="h-4 w-4 shrink-0" aria-hidden />
            Qué devolver · lo arma el sistema con las columnas de la hoja
            <ChevronDown className="ml-auto h-4 w-4 shrink-0 transition-transform group-open:rotate-180" aria-hidden />
          </summary>
          <pre className="max-h-64 overflow-auto whitespace-pre-wrap border-t border-[var(--rule-soft)] p-3 font-mono text-xs leading-relaxed text-[var(--text-secondary)]">
            {p.bloqueFijo}
          </pre>
        </details>
      </div>
    </AdminModal>
  );
}
