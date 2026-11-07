"use client";

/**
 * «Documento y RUC» de la ficha del Directorio (ADR-524): las fechas del DNI,
 * el RUC aparte (una persona natural tiene DNI y RUC: 10 + DNI + dígito) y lo
 * que dice SUNAT de ese RUC (estado, desde cuándo y condición). Es lo que
 * piden el banco, la municipalidad y SUNAT en los trámites.
 */
import { ESTADOS_RUC, type EstadoRuc } from "@/lib/admin/fichas-tramites-alquileres";
import { validarRuc } from "@/lib/admin/ruc";
import { limaDateKey } from "@/lib/utils";
import { Field, I, Seccion } from "./ctp-shared";
import { CONDICIONES_RUC, ESTADO_RUC_UI } from "./ficha-persona-ui";
import type { ParteFormEstado } from "./hooks/use-parte-form";

const vacio = (v: string) => (v.trim() ? v : null);

export default function CtpParteDocumentoRuc({ form }: { form: ParteFormEstado }) {
  const { b, set, docTipo } = form;
  const esDni = docTipo === "DNI";
  const rucAparte = docTipo !== "RUC";
  const ruc = b.ruc ?? "";
  const revision = rucAparte && ruc.trim() ? validarRuc(ruc, { docTipo, docNumero: b.docNumero }) : null;
  const hayRuc = !rucAparte || !!ruc.trim();
  const vencido = !!b.dniVenceEl && b.dniVenceEl < limaDateKey();

  return (
    <Seccion title="Documento y RUC" hint="Lo que piden el banco, SUNAT y la municipalidad en los trámites. Se llena a mano mirando el DNI y la consulta RUC.">
      {esDni && (
        <>
          <Field label="DNI emitido el" span={3} hint="La fecha de emisión que sale en el DNI.">
            <input type="date" className={I} value={b.dniEmitidoEl ?? ""} onChange={(e) => set({ dniEmitidoEl: e.target.value || null })} />
          </Field>
          <Field label="DNI vence el" span={3} hint="Te avisa antes de que venza: un DNI vencido frena el trámite." error={vencido ? "Ya venció: hay que renovarlo." : null}>
            <input type="date" className={I} value={b.dniVenceEl ?? ""} onChange={(e) => set({ dniVenceEl: e.target.value || null })} />
          </Field>
        </>
      )}
      {rucAparte && (
        <Field
          label="RUC aparte"
          span={esDni ? 6 : 12}
          hint="Si la persona tiene RUC además del DNI. El de persona natural es 10 + su DNI + 1 dígito."
          ejemplo="10456789012"
          afecta="Sale en los trámites con SUNAT y en los contratos de alquiler."
          error={revision && !revision.ok ? revision.motivo : null}
        >
          <input type="text" inputMode="numeric" maxLength={11} className={`${I} font-mono`} value={ruc} onChange={(e) => set({ ruc: vacio(e.target.value.replace(/\s+/g, "")) })} />
        </Field>
      )}
      {revision?.ok && revision.aviso && <p className="sm:col-span-12 text-sm text-[var(--data-warning-ink)]">{revision.aviso}</p>}
      {hayRuc && (
        <>
          <Field label="Estado del RUC" span={4} hint="Lo que dice la consulta RUC de SUNAT." afecta="Un RUC en baja no puede emitir comprobantes: hay que reactivarlo.">
            <select className={I} value={b.rucEstado ?? ""} onChange={(e) => set({ rucEstado: (e.target.value || null) as EstadoRuc | null })}>
              <option value="">Sin revisar</option>
              {ESTADOS_RUC.map((x) => (
                <option key={x} value={x}>
                  {ESTADO_RUC_UI[x]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Desde" span={4} hint="Desde cuándo está en ese estado (sale en la consulta RUC).">
            <input type="date" className={I} value={b.rucEstadoDesde ?? ""} onChange={(e) => set({ rucEstadoDesde: e.target.value || null })} />
          </Field>
          <Field label="Condición" span={4} hint="Habido, no habido o no hallado: la condición del domicilio fiscal.">
            <select className={I} value={b.rucCondicion ?? ""} onChange={(e) => set({ rucCondicion: e.target.value || null })}>
              <option value="">Sin revisar</option>
              {CONDICIONES_RUC.map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
              {b.rucCondicion && !(CONDICIONES_RUC as readonly string[]).includes(b.rucCondicion) && <option value={b.rucCondicion}>{b.rucCondicion}</option>}
            </select>
          </Field>
        </>
      )}
    </Seccion>
  );
}
