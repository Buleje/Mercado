"use client";

/**
 * Bloque «Titular y regente» del formulario del plan: quién responde, el
 * permiso bajo el que se aprueba (traído del Directorio o propuesto por el
 * plan del libro) y el aviso si falta el regente.
 */

import { AlertTriangle, FileText, X as XIcon } from "@buleje/design-system/icons";
import DirectorioPicker from "./DirectorioPicker";
import { DOC_TIPOS } from "@/lib/forestal/directorio";
import { areaDelPermiso, habilitaPlanDeManejo } from "@/lib/forestal/permisos-de-parte";
import { TIPO_LABEL } from "./contratos-ui";
import { Field, cls } from "./loth-plan-ui";
import LothPlanFormPermisoDelLibro from "./LothPlanFormPermisoDelLibro";
import { nombreDelPlan } from "@/lib/forestal/loth-tablero-permiso";
import { ESPECIALIDADES_REGENTE } from "@/lib/forestal/loth-tipos-plan";
import Bloque from "./LothPlanFormBloque";
import type { LothPlanFormEstado } from "./hooks/use-loth-plan-form";

export default function LothPlanFormTitular({ form }: { form: LothPlanFormEstado }) {
  const {
    f, set, esPlantacion, meta, faltaRegente, contratos, traerDelDirectorio, contratoDelLibro, planDelLibro,
    usarPermisoDelLibro, setPropuestaDescartada, permiso, soltarPermiso, traidos,
  } = form;
  return (
    <Bloque n={esPlantacion ? 4 : 3} titulo="Titular y regente" accion={
      <DirectorioPicker
        rol="proveedor"
        label="Traer del Directorio"
        ayuda="La misma libreta del Libro CTP: comunidades, empresas y propietarios."
        conPermisos
        contratos={contratos}
        onElegir={traerDelDirectorio}
      />
    }>
      {contratoDelLibro && planDelLibro && (
        <LothPlanFormPermisoDelLibro
          contrato={contratoDelLibro}
          planDelLibro={nombreDelPlan(planDelLibro)}
          onUsar={() => usarPermisoDelLibro(contratoDelLibro)}
          onDescartar={() => setPropuestaDescartada(true)}
        />
      )}
      {permiso && (
        <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-[var(--data-info-100)] bg-[var(--data-info-50)] px-3 py-2 dark:border-[var(--data-info-500)]/30 dark:bg-[var(--data-info-500)]/10">
          <FileText className="h-4 w-4 shrink-0 text-[var(--data-info-700)] dark:text-[var(--data-info-500)]" aria-hidden="true" />
          <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--data-info-700)] dark:text-[var(--data-info-500)]">
            Bajo el permiso
          </span>
          <span className="font-mono text-sm font-bold text-[var(--text-primary)]">{permiso.codigo}</span>
          {permiso.tipo && <span className="text-xs text-[var(--text-secondary)]">{TIPO_LABEL[permiso.tipo]}</span>}
          <span className={`text-xs tabular-nums ${areaDelPermiso(permiso) ? "text-[var(--text-secondary)]" : "text-[var(--text-tertiary)]"}`}>
            {areaDelPermiso(permiso) ?? "sin área de manejo cargada"}
          </span>
          <button
            type="button"
            onClick={soltarPermiso}
            className="ml-auto grid h-7 w-7 shrink-0 place-items-center rounded-lg text-[var(--text-tertiary)] transition-colors hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]"
            aria-label="Dejar de declarar este plan bajo ese permiso"
            title="Soltar el permiso (lo ya cargado se queda)"
          >
            <XIcon className="h-3.5 w-3.5" />
          </button>
          {traidos.length > 0 && (
            <span className="w-full text-xs text-[var(--text-tertiary)]">
              Del permiso se completaron: {traidos.join(", ")}. Lo que ya estaba escrito no se tocó.
            </span>
          )}
          {!habilitaPlanDeManejo(permiso) && (
            <span className="w-full text-xs font-semibold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
              Ojo: ese papel es comercial, no habilita a aprovechar bosque. Revisá si el plan va bajo otro título.
            </span>
          )}
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Field label="Titular *">
          <input value={f.titularName} onChange={(e) => set("titularName", e.target.value)} placeholder="Maderera ... SAC" required className={cls} />
        </Field>
        <Field label="Representante legal">
          <input value={f.representanteLegal} onChange={(e) => set("representanteLegal", e.target.value)} placeholder="Si el titular es empresa" className={cls} />
        </Field>
        <Field label={`Regente forestal${meta.regente === "obligatorio" ? " *" : ""}`}>
          <input value={f.regenteName} onChange={(e) => set("regenteName", e.target.value)} placeholder="Ing. ..." className={cls} />
        </Field>
        <Field label="N° de registro SERFOR">
          <input value={f.regenteRegistro} onChange={(e) => set("regenteRegistro", e.target.value)} placeholder="RNR-0000" className={`${cls} font-mono`} />
        </Field>
        <Field label="Especialidad del regente">
          <select value={f.regenteEspecialidad} onChange={(e) => set("regenteEspecialidad", e.target.value)} className={cls}>
            {ESPECIALIDADES_REGENTE.map((x) => (
              <option key={x.key} value={x.key}>{x.label}</option>
            ))}
          </select>
        </Field>
        {/* El dueño del predio no siempre es el titular del permiso: en un
            PMFI el papel está a nombre del propietario y quien opera es otro.
            Sin este campo, ese nombre vive en un cuaderno. */}
        <Field label="Propietario del predio">
          <input value={f.propietarioNombre} onChange={(e) => set("propietarioNombre", e.target.value)} placeholder="Si no es el titular" className={cls} />
        </Field>
        <Field label="Su documento">
          <div className="flex gap-1.5">
            <select value={f.propietarioDocTipo} onChange={(e) => set("propietarioDocTipo", e.target.value)} className={`${cls} w-28 shrink-0`}>
              {DOC_TIPOS.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            <input value={f.propietarioDoc} onChange={(e) => set("propietarioDoc", e.target.value)} className={`${cls} font-mono`} />
          </div>
        </Field>
        <Field label="Apodo del plan">
          <input value={f.alias} onChange={(e) => set("alias", e.target.value)} placeholder="«el de Puerto Inca»" className={cls} />
        </Field>
      </div>
      {faltaRegente && (
        <p className="mt-2 flex items-start gap-2 rounded-xl border border-[var(--data-warning-500)]/50 bg-[var(--data-warning-100)] px-3 py-2 text-xs font-semibold text-[var(--data-warning-700)] dark:bg-[var(--data-warning-500)]/15 dark:text-[var(--data-warning-500)]">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Un {meta.sigla} lo elabora e implementa un regente forestal, y es quien firma el informe de ejecución junto
          al titular. Puedes guardar sin cargarlo, pero va a faltar en el expediente.
        </p>
      )}
    </Bloque>
  );
}
