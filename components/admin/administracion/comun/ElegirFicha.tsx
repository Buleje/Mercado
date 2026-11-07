"use client";

/**
 * ElegirFicha — una persona o empresa de un trámite o un alquiler: su ficha del
 * Directorio (`parteId`) o, si todavía no la tiene, el nombre escrito a mano.
 * Al escribir aparecen las fichas que se parecen; una ficha elegida se puede
 * soltar para volver al texto. El Directorio es uno solo (`ForestParty`): no
 * se duplica acá, sólo se busca en él.
 */
import { useId, useMemo } from "react";
import { UserCircle, X } from "@buleje/design-system/icons";
import { Field } from "@/components/admin/shared/Field";
import { CAMPO_ALTO } from "@/components/admin/planificacion/piezas/clases";
import { button } from "@/components/ui-system/button-variants";
import { claveBusqueda, type Parte } from "@/lib/forestal/directorio";

export interface ValorFicha {
  parteId: string | null;
  texto: string;
}

interface Props {
  label: string;
  valor: ValorFicha;
  /** El nombre de la ficha elegida cuando la lista todavía no llegó (viene en el DTO). */
  nombreFicha?: string | null;
  partes: readonly Parte[];
  onCambiar: (v: ValorFicha) => void;
  hint?: string;
  placeholder?: string;
}

const MAX_SUGERIDAS = 5;

export function ElegirFicha({ label, valor, nombreFicha, partes, onCambiar, hint, placeholder = "Escribe el nombre o búscalo" }: Props) {
  const listaId = useId();
  const elegida = valor.parteId ? partes.find((p) => p.id === valor.parteId) : null;

  const sugeridas = useMemo(() => {
    const k = claveBusqueda(valor.texto);
    if (valor.parteId || k.length < 2) return [];
    return partes
      .filter((p) => p.activo && (claveBusqueda(p.nombre).includes(k) || (p.docNumero ?? "").includes(k)))
      .slice(0, MAX_SUGERIDAS);
  }, [partes, valor.parteId, valor.texto]);

  if (valor.parteId) {
    const nombre = elegida?.nombre ?? nombreFicha ?? "Ficha del Directorio";
    return (
      <Field label={label} hint={hint}>
        <div className="flex min-h-12 items-center gap-2 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] pl-3">
          <UserCircle className="size-4 shrink-0 text-[var(--text-tertiary)]" aria-hidden="true" />
          <span className="min-w-0 flex-1 truncate font-medium text-[var(--text-primary)]">
            {nombre}
            {elegida?.docNumero && <span className="ml-2 text-sm text-[var(--text-tertiary)]">{elegida.docNumero}</span>}
          </span>
          <button
            type="button"
            className={button({ variant: "ghost", size: "icon" })}
            onClick={() => onCambiar({ parteId: null, texto: nombre })}
            title="Soltar la ficha y escribir el nombre"
            aria-label={`Soltar la ficha de ${nombre}`}
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>
      </Field>
    );
  }

  return (
    <Field label={label} hint={hint}>
      {(id) => (
        <div className="space-y-1">
          <input
            id={id}
            type="text"
            className={CAMPO_ALTO}
            value={valor.texto}
            placeholder={placeholder}
            aria-controls={sugeridas.length > 0 ? listaId : undefined}
            autoComplete="off"
            onChange={(e) => onCambiar({ parteId: null, texto: e.target.value })}
          />
          {sugeridas.length > 0 && (
            <ul id={listaId} className="space-y-1" aria-label="Fichas del Directorio que se parecen">
              {sugeridas.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    className={button({ variant: "ghost", className: "w-full justify-start gap-2 text-left" })}
                    onClick={() => onCambiar({ parteId: p.id, texto: "" })}
                  >
                    <UserCircle className="size-4 shrink-0" aria-hidden="true" />
                    <span className="min-w-0 truncate">Usar la ficha de {p.nombre}</span>
                    {p.docNumero && <span className="shrink-0 text-sm text-[var(--text-tertiary)]">{p.docNumero}</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Field>
  );
}
