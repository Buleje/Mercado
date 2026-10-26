"use client";

/**
 * Paso «Papeles y notas» de la ficha del Directorio: el membrete y los papeles
 * del titular, las notas internas con su bitácora, los campos propios del
 * negocio (ADR-427) y, al editar, «Dar de baja». En pantalla ancha van en dos
 * columnas: papeles a un lado, notas al otro.
 */

import CamposPersonalizados from "@/components/admin/shared/CamposPersonalizados";
import { CampoGrid, Field, I, Seccion } from "./ctp-shared";
import CtpParteLogo from "./CtpParteLogo";
import CtpParteAdjuntos from "./CtpParteAdjuntos";
import CtpParteCarpeta from "./CtpParteCarpeta";
import CtpParteBitacora from "./CtpParteBitacora";
import { FORMULARIO_FICHA, type ParteFormEstado } from "./hooks/use-parte-form";

export default function CtpPartePasoPapeles({ form }: { form: ParteFormEstado }) {
  const { parte, b, set } = form;
  return (
    <>
      <div className="grid grid-cols-1 items-start gap-x-6 lg:grid-cols-2">
        <Seccion title="Logo y papeles del titular">
          <CampoGrid className="sm:col-span-12">
            <Field
              label="Membrete de sus documentos"
              span={12}
              hint="El logo o sello de la comunidad o empresa, en foto o PNG."
              ejemplo="El sello redondo de la comunidad, escaneado"
              afecta="Sale en la cabecera de la guía y de sus anexos."
            >
              <CtpParteLogo logo={b.logo ?? ""} onCambio={(logo) => set({ logo })} />
            </Field>
            <Field
              label="Documentos del titular"
              span={12}
              hint="Los papeles de la comunidad o empresa. Los de cada permiso van en su plan de manejo."
              ejemplo="Ficha RUC, vigencia de poder, DNI del representante"
              afecta="Se guardan en el Archivo, en la carpeta de este titular."
            >
              <CtpParteAdjuntos adjuntos={b.adjuntos ?? []} nombreParte={b.nombre} onCambio={(adjuntos) => set({ adjuntos })} />
            </Field>
            {parte?.id && (
              <Field label="Su carpeta en el Archivo" span={12} hint="Ábrela para ver todo lo que tiene en el sistema." afecta="Ahí están sus papeles, fotos y documentos sueltos.">
                <CtpParteCarpeta parteId={parte.id} />
              </Field>
            )}
          </CampoGrid>
        </Seccion>

        {/* En dos columnas la segunda sección no lleva la raya de arriba: la
            separa el aire, no una línea a media altura. */}
        <Seccion title="Notas" className="lg:mt-0 lg:border-t-0 lg:pt-0">
          <CampoGrid className="sm:col-span-12">
            <Field
              label="Observaciones internas"
              span={12}
              hint="Una línea que lo describe; se reemplaza al editarla. Lo que pasó día a día va en la bitácora."
              ejemplo="Entrega shihuahuaco seco; pide adelanto en efectivo"
              afecta="Sólo la ve tu equipo, nunca sale en la guía."
            >
              <input type="text" className={I} value={b.notas ?? ""} onChange={(e) => set({ notas: e.target.value })} />
            </Field>
            <CtpParteBitacora notas={parte?.bitacora ?? []} nueva={b.nuevaNota ?? ""} onNueva={(nuevaNota) => set({ nuevaNota })} />
            {/* Lo que este negocio le pregunta a sus partes y la ficha no
                previó (ADR-427). */}
            <CamposPersonalizados
              className="sm:col-span-12"
              formulario={FORMULARIO_FICHA}
              registroId={b.id ?? null}
              etiquetaFormulario="fichas del Directorio"
              pendientes={form.camposPendientes}
              onPendientes={form.setCamposPendientes}
            />
          </CampoGrid>
        </Seccion>
      </div>

      {/* Dar de baja sin ir al Directorio. `activo` existía en el modelo y el
          modal lo leía sin exponerlo: una parte que ya no opera sólo se podía
          desactivar desde la otra pantalla. Sólo al EDITAR: una ficha que se
          está creando inactiva no tiene sentido. */}
      {parte && (
        <label className="mt-4 flex min-h-11 items-start gap-2.5 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3 py-2.5">
          <input
            type="checkbox"
            checked={b.activo === false}
            onChange={(e) => set({ activo: !e.target.checked })}
            className="mt-0.5 h-4 w-4 accent-[var(--data-error-600)]"
          />
          <span className="text-sm text-[var(--text-primary)]">
            Dar de baja
            <span className="block text-sm text-[var(--text-tertiary)]">
              Deja de ofrecerse en los selectores de guías y formularios. No se borra: lo que ya se emitió con esta parte
              sigue igual.
            </span>
          </span>
        </label>
      )}
    </>
  );
}
