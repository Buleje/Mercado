"use client";

import { Field } from "@/components/admin/shared/Field";
import { BookmarkPlus } from "@buleje/design-system/icons";
import { reglaMotivo } from "@/lib/notas-credito/motivos";
import { MOTIVOS_SUNAT } from "@/components/admin/notas-credito/nc-compartido";
import { MotivoCard } from "@/components/admin/notas-credito/NcWizardPiezas";
import NcPlantillas from "@/components/admin/notas-credito/NcPlantillas";
import NcCamposMotivo from "@/components/admin/notas-credito/NcCamposMotivo";
import NcLineasNota from "@/components/admin/notas-credito/NcLineasNota";
import NcImporteNota from "@/components/admin/notas-credito/NcImporteNota";
import type { NotasCreditoVista } from "@/components/admin/notas-credito/hooks/use-notas-credito";

const ROTULO = "block text-sm font-bold text-[var(--text-secondary)] mb-1";
const ETIQUETAS = new Set(MOTIVOS_SUNAT.map((x) => x.label));

/** Título de las líneas según el motivo: qué significa cada unidad marcada. */
function tituloLineas(codigo: string): string {
  if (codigo === "08") return "Unidades bonificadas";
  if (codigo === "03") return "Productos que se corrigen";
  return "Unidades que se devuelven";
}

/**
 * Asistente, paso 2: motivo y lo que acredita (F11/F12/F14/M55, 17-10). Cada motivo pide sólo lo suyo:
 * 01/02/06 van por todo lo que queda, 03 pide el texto anterior y el nuevo, 07/08 las unidades y
 * 04/05/09/10 la base afectada. Pieza de NotasCreditoModule: recibe `useNotasCredito` entero.
 */
export default function NcPasoMotivo({ nc }: { nc: NotasCreditoVista }) {
  const {
    templates, showTemplates, setShowTemplates, wizardStep, setWizardStep, createError, setCreateError,
    form, setForm, selectedVenta, saveTemplate, deleteTemplate, loadTemplate, remanente, lineas, cantidades,
    setCantidad, marcarTodo, usarDevueltoEnCaja, limpiarCantidades, campos, setCampos, tasa, importe, descripcionFinal,
  } = nc;
  if (wizardStep !== 1) return null;
  const conDocumento = !!selectedVenta;

  const elegirMotivo = (code: string, label: string) => {
    setCreateError(null);
    setForm((prev) => ({
      ...prev,
      codigoMotivo: code,
      // El texto sugerido sigue al motivo mientras nadie lo haya escrito a mano.
      descripcionMotivo: !prev.descripcionMotivo.trim() || ETIQUETAS.has(prev.descripcionMotivo) ? label : prev.descripcionMotivo,
    }));
  };

  const siguiente = () => {
    const problema = importe.problema
      ?? (!descripcionFinal ? "Escribe por qué se hace la nota." : null)
      ?? (form.codigoMotivo === "02" && campos.rucBien && campos.rucBien.length !== 11 ? "El RUC correcto tiene 11 dígitos." : null);
    if (problema) { setCreateError(problema); return; }
    setCreateError(null);
    setWizardStep(2);
  };

  return (
    <div className="space-y-5">
      <NcPlantillas templates={templates} abierto={showTemplates} setAbierto={setShowTemplates}
        onUsar={(t) => { void loadTemplate(t); }} onQuitar={deleteTemplate} conDocumento={conDocumento} />

      <div>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm font-bold text-[var(--text-secondary)]">¿Por qué se hace la nota?</span>
          {form.codigoMotivo && form.descripcionMotivo.trim() && (
            <button type="button" onClick={() => { void saveTemplate(); }} className="flex min-h-12 items-center gap-1 rounded-xl px-2 text-sm font-bold text-primary hover:underline">
              <BookmarkPlus className="h-4 w-4" aria-hidden /> Guardar plantilla
            </button>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {MOTIVOS_SUNAT.map((mo) => (
            <MotivoCard key={mo.code} motivo={mo} selected={form.codigoMotivo === mo.code}
              bloqueo={reglaMotivo(mo.code).requiereDocumento && !conDocumento ? "Va por todo el documento: elígelo en el paso 1" : null}
              onClick={() => elegirMotivo(mo.code, mo.label)} />
          ))}
        </div>
      </div>

      {form.codigoMotivo && (
        <>
          <Field label="Descripción del motivo" labelClassName={ROTULO}>
            <textarea value={form.descripcionMotivo} onChange={(e) => setForm((p) => ({ ...p, descripcionMotivo: e.target.value }))} rows={2}
              placeholder="Lo que va a leer el cliente en la nota"
              className="w-full resize-none rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 py-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-primary/30" />
          </Field>

          <NcCamposMotivo codigo={form.codigoMotivo} campos={campos} setCampos={setCampos} />

          {(importe.forma === "lineas" || importe.forma === "descripcion") && (
            <NcLineasNota lineas={lineas} cantidades={cantidades} setCantidad={setCantidad} marcarTodo={marcarTodo}
              usarDevueltoEnCaja={usarDevueltoEnCaja} limpiar={limpiarCantidades} titulo={tituloLineas(form.codigoMotivo)}
              notasActivas={remanente.datos?.remanente.notasActivas ?? 0} />
          )}

          <NcImporteNota codigo={form.codigoMotivo} importe={importe} remanente={remanente.datos?.remanente ?? null} tasa={tasa}
            baseEscrita={form.monto} setBase={(v) => setForm((p) => ({ ...p, monto: v }))} />

          <Field label="Notas internas (opcional)" labelClassName={ROTULO}>
            <input type="text" value={form.notasText} onChange={(e) => setForm((p) => ({ ...p, notasText: e.target.value }))} placeholder="Sólo para tu equipo"
              className="h-12 w-full rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-primary/30" />
          </Field>
        </>
      )}

      {createError && <p role="alert" className="text-sm font-semibold text-[var(--data-error-500)]">{createError}</p>}

      <div className="flex gap-2 pt-2">
        <button type="button" onClick={() => setWizardStep(0)} className="min-h-12 flex-1 rounded-xl bg-[var(--surface-sunken)] px-4 text-sm font-bold text-[var(--text-secondary)] transition-colors hover:bg-[var(--rule-soft)]">
          ← Atrás
        </button>
        <button type="button" data-qa="nc-siguiente-motivo" onClick={siguiente} className="min-h-12 flex-1 rounded-xl bg-primary text-sm font-semibold text-white transition-colors hover:bg-primary-dark">
          Siguiente →
        </button>
      </div>
    </div>
  );
}
