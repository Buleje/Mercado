"use client";

/**
 * Lo que acompaña al precio de un cliente (ADR-430): la vista previa en
 * palabras —qué se le cobraría por cada especie— y el historial de versiones.
 *
 * La vista previa sale de `precioDelCliente`, la misma función que usa el cobro
 * en el servidor, con los mismos argumentos: lo que se lee acá es lo que se
 * cobra. Un «S/ 0.60» que la pantalla calculara por su cuenta podría no ser el
 * que termina en la cuenta del cliente.
 */

import { useId, useState } from "react";
import { Loader2, Trash2 } from "@buleje/design-system/icons";
import { ORDEN_TIPO, type TipoComercial } from "@/lib/forestal/cubicacion-tipo";
import { resumenTarifa, vistaPreviaResumida } from "@/lib/forestal/precio-cliente-borrador";
import type { GrupoEspecies, TarifaCliente } from "@/lib/forestal/precio-cliente";
import { etiquetaLarga } from "@/lib/forestal/semana-de-registro";

/* No `${I} h-9`: dos alturas en la misma clase las ordena Tailwind, no el orden del texto. */
const SELECT_CHICO =
  "h-10 rounded-xl border-[1.5px] border-[var(--rule-base)] bg-[var(--surface-raised)] px-2.5 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-muted)]";

export function VistaPreviaPrecio({
  tarifa,
  grupos,
  especies,
}: {
  tarifa: TarifaCliente;
  grupos: GrupoEspecies[];
  /** Nombres del catálogo de la planta. */
  especies: string[];
}) {
  const [tipo, setTipo] = useState<TipoComercial>("Comercial");
  const idTipo = useId();
  const lineas = vistaPreviaResumida(tarifa, grupos, especies, tipo);
  return (
    <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-bold text-[var(--text-primary)]">Así se le cobraría</span>
        <label htmlFor={idTipo} className="ml-auto text-xs text-[var(--text-secondary)]">
          Ver como
        </label>
        <select
          id={idTipo}
          className={SELECT_CHICO}
          value={tipo}
          onChange={(e) => setTipo(e.target.value as TipoComercial)}
        >
          {ORDEN_TIPO.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>
      <ul className="mt-2 space-y-1" aria-live="polite">
        {lineas.map((l) => (
          <li
            key={l.clave}
            className={`text-sm ${l.conPrecio ? "text-[var(--text-primary)]" : "text-[var(--text-tertiary)]"}`}
          >
            {l.texto}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function HistorialPrecios({
  versiones,
  vigenteId,
  hoy,
  grupos,
  quitando,
  onQuitar,
}: {
  /** De la más nueva a la más vieja. */
  versiones: TarifaCliente[];
  vigenteId: string | null;
  hoy: string;
  grupos: GrupoEspecies[];
  quitando: string | null;
  onQuitar: (t: TarifaCliente) => void;
}) {
  if (versiones.length === 0) return null;
  return (
    <div>
      <span className="mb-1.5 block text-sm font-bold text-[var(--text-primary)]">
        Historial{" "}
        <span className="font-normal text-[var(--text-tertiary)]">
          · lo ya cobrado queda con el precio de su día
        </span>
      </span>
      <ul className="divide-y divide-[var(--rule-soft)] rounded-xl border border-[var(--rule-base)]">
        {versiones.map((t) => {
          const estado =
            t.id === vigenteId ? "vigente" : t.vigenteDesde > hoy ? "programada" : "anterior";
          return (
            <li key={t.id} className="flex items-start gap-2 px-3 py-2">
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-1.5">
                  <span className="text-sm font-semibold text-[var(--text-primary)]">
                    Desde el {etiquetaLarga(t.vigenteDesde, hoy)}
                  </span>
                  <EstadoVersion estado={estado} />
                </span>
                <span className="block text-sm text-[var(--text-secondary)]">
                  {resumenTarifa(t, grupos)}
                </span>
                {t.nota && (
                  <span className="block text-xs text-[var(--text-tertiary)]">{t.nota}</span>
                )}
              </span>
              <button
                type="button"
                onClick={() => onQuitar(t)}
                disabled={quitando === t.id}
                aria-label={`Dar de baja el precio que rige desde el ${etiquetaLarga(t.vigenteDesde, hoy)}`}
                title="Dar de baja esta versión"
                className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-[var(--text-tertiary)] transition-colors hover:bg-[var(--data-error-500)]/10 hover:text-[var(--data-error-700)] disabled:opacity-50 dark:hover:text-[var(--data-error-500)]"
              >
                {quitando === t.id ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <Trash2 className="h-4 w-4" aria-hidden />
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function EstadoVersion({ estado }: { estado: "vigente" | "programada" | "anterior" }) {
  const clase =
    estado === "vigente"
      ? "bg-[var(--data-success-500)]/15 text-[var(--data-success-700)] dark:text-[var(--data-success-500)]"
      : estado === "programada"
        ? "bg-[var(--data-info-500)]/15 text-[var(--data-info-700)] dark:text-[var(--data-info-500)]"
        : "bg-[var(--surface-sunken)] text-[var(--text-tertiary)]";
  const texto =
    estado === "vigente" ? "Vigente" : estado === "programada" ? "Programada" : "Anterior";
  return <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${clase}`}>{texto}</span>;
}
