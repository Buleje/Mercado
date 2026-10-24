"use client";

/**
 * Alta de un documento de gestión forestal.
 *
 * Antes era un `<select>` con tres siglas —PO, PMFI, DEMA— y doce campos
 * iguales para las tres. Pero no son variantes de lo mismo: **cada una
 * corresponde a un título habilitante distinto** (concesión, predio privado,
 * comunidad), y quien lo llena —un ingeniero o un regente— reconoce el suyo por
 * el tipo de bosque en el que trabaja, no por la sigla suelta.
 *
 * Ahora el tipo se elige primero, con su nombre completo y para qué sirve, y el
 * formulario se acomoda: una plantación no tiene parcela de corta, un PGMF no
 * tiene la parcela del año, y el **regente forestal** —que firma el informe de
 * ejecución junto al titular— tiene por fin dónde ir.
 *
 * Reglas y fuentes: `lib/forestal/loth-tipos-plan.ts`.
 *
 * ## El titular no alcanza: el plan cuelga de UN permiso
 *
 * Brandon (2026-09-21): «al escoger directorio de una CCNN me aparecen las
 * opciones de qué permiso usar». Una comunidad maneja varios títulos
 * habilitantes a la vez, cada uno con **su área de manejo, su resolución y su
 * vigencia**, y el plan de manejo se aprueba para uno. Por eso el picker ahora
 * devuelve la ficha **y** el permiso (`ForestContrato`, ADR-421): con el papel
 * elegido, seis de los campos de este formulario dejan de tipearse.
 *
 * ## Lo que se puede elegir, se elige
 *
 * Región y ARFFS eran texto libre y el dato lo demuestra: en un plan real la
 * región dice «Constitucion» (una ciudad, no un departamento) y la misma
 * autoridad está escrita de tres formas distintas entre las fichas y los
 * permisos. La región pasa a la lista de departamentos del Perú; la ARFFS, a lo
 * que este negocio YA escribió, con «Otra…» para el caso nuevo — un catálogo
 * cerrado de ARFFS no se puede verificar entero, y el módulo no inventa datos
 * oficiales.
 */

import LothPlanFormCosteo, { type CamposDeCosteo } from "./LothPlanFormCosteo";
import CamposPersonalizados from "@/components/admin/shared/CamposPersonalizados";
import type { PlanPrevio } from "@/lib/forestal/loth-plan-alta";
import PlanDocumentosEnFormulario from "./plan-documentos/PlanDocumentosEnFormulario";
import LothPlanFormPlantacion, { EspeciesSeCorrigenEnRegistro } from "./LothPlanFormPlantacion";
import type { Plan } from "./loth-plan-shared";
import { FORMULARIO } from "./loth-plan-form-shared";
import { useLothPlanForm } from "./hooks/use-loth-plan-form";
import Bloque from "./LothPlanFormBloque";
import LothPlanFormTipo from "./LothPlanFormTipo";
import LothPlanFormDocumento from "./LothPlanFormDocumento";
import LothPlanFormTitular from "./LothPlanFormTitular";
import LothPlanFormArea from "./LothPlanFormArea";
import LothPlanFormPie from "./LothPlanFormPie";
import { idEsencial } from "@/lib/forestal/loth-plan-esenciales";
import { totalM3 } from "./loth-plan-especies-api";

/* El formulario vacío y el plan vuelto formulario viven en `loth-plan-form-shared`;
   se siguen exportando desde acá para quien ya los importaba (el test de edición). */
export { desdePlan, formularioVacio } from "./loth-plan-form-shared";

export default function LothPlanForm({
  onClose,
  onSaved,
  planesPrevios = [],
  plan,
  onIrARegistro,
  onEstadoCierre,
}: {
  onClose: () => void;
  /** `planId` del plan recién creado o editado: la vista lo deja elegido. */
  onSaved: (planId?: string) => void;
  /**
   * Al EDITAR una plantación, sus especies no se tocan acá: se corrigen en la
   * pestaña «Registro y saldo», donde se ve cuánto ya se taló de cada una.
   * Esto cierra el formulario y lleva ahí.
   */
  onIrARegistro?: () => void;
  /**
   * Los planes ya cargados. De ellos sale lo que se repite entre un documento y
   * el siguiente —ARFFS, región, regente, UIT, costos— y las autoridades que ya
   * se escribieron: sin eso, el campo libre se vuelve a escribir distinto (pasó:
   * tres grafías de la misma autoridad en el mismo tenant).
   */
  planesPrevios?: readonly PlanPrevio[];
  /** El plan que se está EDITANDO. Sin esto, el formulario es un alta. */
  plan?: Plan | null;
  /**
   * Para que el modal pregunte antes de cerrarse: hay archivos cargados que
   * todavía no se subieron, o algo está subiendo ahora mismo (ADR-467).
   */
  onEstadoCierre?: (e: { pendientes: boolean; ocupado: boolean; creado: boolean }) => void;
}) {
  const form = useLothPlanForm({ plan, planesPrevios, onSaved, onEstadoCierre });
  const {
    f, set, err, esPlantacion, llevaEspecies, especies, setEspecies, intentoGuardar, filasLeidas,
    docsPend, setDocsPend, setSubiendoEnEdicion, camposPendientes, setCamposPendientes, submit, rot,
  } = form;

  return (
    <form onSubmit={submit} className="space-y-5 p-5">
      {err && (
        <div className="rounded-lg border border-[var(--data-error-100)] bg-[var(--data-error-50)] px-3 py-2 text-sm text-[var(--data-error-700)] dark:bg-[var(--data-error-500)]/12 dark:text-[var(--data-error-500)]">
          {err}
        </div>
      )}

      {/* 1 · Qué documento es: decide todo lo demás */}
      <LothPlanFormTipo form={form} planesPrevios={planesPrevios} />

      {/* 2 · El documento aprobado (o el registro, si es plantación: mismos
          campos de la base, otro papel en la mano — `rotulosDe`) */}
      <LothPlanFormDocumento form={form} />

      {/* 3 · Plantación: las especies y sus m³ registrados — la base del saldo (ADR-459) */}
      {esPlantacion && (
        <div id={idEsencial("especies")}>
          <Bloque
            n={3}
            titulo="Especies registradas"
            ayuda={{
              what: "Con estas especies y sus m³ trabaja el libro: la tala, el trozado y el despacho descuentan de acá. No hace falta censo.",
              example: "Bolaina 120 m³ y Capirona 80 m³: el saldo arranca en 200 m³.",
            }}
          >
            {llevaEspecies ? (
              <LothPlanFormPlantacion filas={especies} onFilas={setEspecies} mostrarErrores={intentoGuardar} leidas={filasLeidas} />
            ) : (
              <EspeciesSeCorrigenEnRegistro onIr={onIrARegistro} />
            )}
          </Bloque>
        </div>
      )}

      {/* 3 (4 en plantación) · Quién responde: titular y regente */}
      <LothPlanFormTitular form={form} />

      {/* 4 · Dónde y hasta cuándo (en una plantación: dónde, y la vigencia opcional) */}
      <LothPlanFormArea form={form} />

      {/* 5 · Lo que el plan ya guardaba y nadie preguntaba */}
      <LothPlanFormCosteo
        valores={{
          uitRef: f.uitRef,
          costoExtraccionM3: f.costoExtraccionM3,
          costoTransformacionM3: f.costoTransformacionM3,
          costoFleteM3: f.costoFleteM3,
          estado: f.estado,
          notes: f.notes,
        }}
        onCambio={(k: keyof CamposDeCosteo, v: string) => set(k, v)}
        contexto={{
          resolucionDate: f.resolucionDate,
          vigenciaHasta: f.vigenciaHasta,
          // El volumen sólo lo conoce el alta de una plantación (sus especies);
          // en un plan de bosque está en el censo, que no vive en este formulario.
          volumenM3: llevaEspecies ? totalM3(especies) : null,
          base: rot.base,
        }}
      />

      {/* Los papeles del plan, en sus carpetas del Drive (ADR-467). El costeo
          de arriba no lleva número: éste sigue al de la vigencia. */}
      <Bloque
        n={esPlantacion ? 6 : 5}
        titulo="Documentos"
        ayuda={{
          what: "Resolución o registro de plantación, papeles del jefe, títulos y lo que necesites: cada uno en su carpeta. Quedan en Documentos, dentro de «Libro TH».",
          example: "La vigencia de poder vence en marzo: ponle la fecha al archivo y te avisa antes.",
        }}
      >
        <PlanDocumentosEnFormulario
          planId={plan?.id ?? null}
          pendientes={docsPend}
          onPendientes={setDocsPend}
          onOcupado={setSubiendoEnEdicion}
          delPlan={{
            resolucionNumber: f.resolucionNumber || null,
            resolucionDate: f.resolucionDate || null,
            representanteLegal: f.representanteLegal || null,
            propietarioNombre: f.propietarioNombre || null,
          }}
        />
      </Bloque>

      {/* Lo que este negocio necesita y el formulario no previó (ADR-427) */}
      <CamposPersonalizados
        formulario={FORMULARIO}
        registroId={plan?.id ?? null}
        etiquetaFormulario="planes de manejo"
        pendientes={camposPendientes}
        onPendientes={setCamposPendientes}
      />

      <LothPlanFormPie form={form} onClose={onClose} />
    </form>
  );
}
