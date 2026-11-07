"use client";

/**
 * «Ese nombre es un RUC» — aviso bajo el nombre de una ficha del Directorio.
 *
 * Medido en Blas (2026-10-09): un transportista quedó cargado con el nombre
 * «20605859438» y sin documento. Ese número ya era el RUC de otra ficha (la
 * propia Blas), así que la misma empresa vivía dos veces y la segunda no se
 * encontraba por documento en ninguna guía.
 *
 * Qué ofrece, según el caso:
 *   · el número ya es de otra ficha y esto es un ALTA → sumarle el papel a esa
 *     ficha (el servidor fusiona los roles por documento sin pisar sus datos);
 *   · el número ya es de otra ficha y esto es una EDICIÓN → sólo avisa: fusionar
 *     o dar de baja una ficha existente lo decide quien conoce el caso;
 *   · el número no está → pasarlo a «Documento» para traer el nombre de SUNAT.
 */

import { ArrowDown } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import {
  ROL_LABEL,
  documentoEnElNombre,
  fichaConDocumento,
  type DocTipo,
  type Parte,
  type RolParte,
} from "@/lib/forestal/directorio";

const BOTON =
  "inline-flex min-h-8 items-center gap-1 rounded-lg border border-[var(--data-warning-500)] bg-[var(--surface-raised)] px-2.5 text-xs font-bold text-[var(--data-warning-700)] transition-colors hover:bg-[var(--data-warning-100)] dark:text-[var(--data-warning-500)] dark:hover:bg-[var(--data-warning-500)]/15";

export default function CtpParteNombreEsDocumento({
  nombre,
  idFicha,
  roles,
  existentes,
  onCambiar,
  onUsarExistente,
}: {
  nombre: string;
  /** La ficha que se está editando; `null`/`undefined` = alta. */
  idFicha?: string | null;
  /** Los papeles marcados en el formulario. */
  roles: RolParte[];
  existentes: Parte[];
  onCambiar: (v: { nombre: string; docTipo: DocTipo; docNumero: string }) => void;
  /** Sólo desde un formulario que sabe seguir con la ficha elegida. */
  onUsarExistente?: (p: Parte) => void;
}) {
  const doc = documentoEnElNombre(nombre);
  if (!doc) return null;
  const ficha = fichaConDocumento(existentes, doc.numero, { excluirId: idFicha ?? null });
  const papelesNuevos = ficha ? roles.filter((r) => !ficha.roles.includes(r)) : [];
  const papeles = papelesNuevos.map((r) => ROL_LABEL[r].toLowerCase()).join(" y ");

  return (
    <div
      role="status"
      data-aviso="nombre-es-documento"
      className="col-span-12 rounded-xl border border-[var(--data-warning-500)]/50 bg-[var(--data-warning-100)] px-3 py-2 text-xs text-[var(--data-warning-700)] dark:bg-[var(--data-warning-500)]/15 dark:text-[var(--data-warning-500)]"
    >
      <p className="flex items-center gap-1 font-bold">
        {ficha
          ? `Ese ${doc.docTipo} ya es de ${ficha.nombre}`
          : `«${doc.numero}» es un ${doc.docTipo}, no un nombre`}
        <InfoTip
          title={`${doc.docTipo} en el nombre`}
          what={
            ficha
              ? idFicha
                ? "Esta ficha y esa parecen la misma empresa. Si es así, da de baja la que sobra y usa la otra."
                : "Usa la ficha que ya existe: le sumamos el papel y conserva su dirección y sus datos."
              : "El número va en «Documento»; el nombre lo traes de SUNAT o RENIEC con un toque."
          }
          affects="Con el número como nombre, las guías no encuentran la ficha por su documento."
          example="«20605859438» → INVERSIONES AGROFORESTALES BLAS S.A.C."
        />
      </p>
      {(!idFicha || !ficha) && (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {ficha ? (
            <>
              <button
                type="button"
                className={BOTON}
                onClick={() =>
                  onCambiar({
                    nombre: ficha.nombre,
                    docTipo: (ficha.docTipo ?? doc.docTipo) as DocTipo,
                    docNumero: ficha.docNumero ?? doc.numero,
                  })
                }
              >
                {papeles ? `Sumarle el papel de ${papeles}` : `Cargar los datos de ${ficha.nombre.slice(0, 26)}`}
              </button>
              {onUsarExistente && (
                <button type="button" className={BOTON} onClick={() => onUsarExistente(ficha)}>
                  Usar esa ficha
                </button>
              )}
            </>
          ) : (
            <button
              type="button"
              className={BOTON}
              onClick={() => onCambiar({ nombre: "", docTipo: doc.docTipo, docNumero: doc.numero })}
            >
              <ArrowDown className="h-3.5 w-3.5" aria-hidden />
              Pasarlo a Documento
            </button>
          )}
        </div>
      )}
    </div>
  );
}
