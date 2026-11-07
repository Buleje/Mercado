"use client";

/**
 * Una persona en «Completar datos»: su nombre (con lo que todavía le falta),
 * el DNI/RUC, el celular y el tipo para escribir ahí mismo, y cómo quedó.
 * Fila compacta de 48 px: campos de 40 px con 4 px arriba y abajo.
 *
 * `data-lote-fila` / `data-lote-col` son para que Enter baje a la misma
 * columna de la fila de abajo (lo maneja la tabla, `CompletarLote`).
 */

import { AlertTriangle, CheckCircle, Loader2 } from "@buleje/design-system/icons";
import { ETIQUETA_RELACION, TIPOS_RELACION } from "@/lib/adelantos/persona-campos";
import { faltaDocumento, faltaTelefono, faltaTipo } from "@/lib/adelantos/datos-persona";
import { campo } from "../crear-persona/clases";
import type { CampoCompletar, FilaDelLote } from "../../hooks/use-completar-lote";

const LINEA = "inline-flex items-center gap-1.5 text-sm font-semibold";

function Estado({ fila }: { fila: FilaDelLote }) {
  const { estado, cambio, avisos } = fila;
  if (estado?.fase === "guardando")
    return (
      <span className={`${LINEA} text-[var(--text-tertiary)]`}>
        <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden /> Guardando…
      </span>
    );
  if (estado?.fase === "ok")
    return (
      <span className={`${LINEA} text-[var(--data-success-ink)]`}>
        <CheckCircle className="h-4 w-4 shrink-0" aria-hidden /> Guardado
      </span>
    );
  if (estado?.fase === "error")
    return (
      <span className={`${LINEA} text-[var(--data-error-ink)]`} data-error-fila>
        <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden /> {estado.mensaje}
      </span>
    );
  const revisar = avisos.documento ? "Revisa el DNI/RUC" : avisos.telefono ? "Revisa el celular" : null;
  return (
    <span className="flex flex-col items-end gap-0.5 sm:items-start">
      {cambio && (
        <span className={`${LINEA} text-[var(--accent-ink)] dark:text-[var(--accent)]`}>
          <span className="h-2 w-2 shrink-0 rounded-full bg-[var(--accent)]" aria-hidden /> Sin guardar
        </span>
      )}
      {revisar && (
        <span className={`${LINEA} text-[var(--data-warning-ink)]`} title={avisos.documento ?? avisos.telefono ?? undefined}>
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden /> {revisar}
        </span>
      )}
    </span>
  );
}

export default function FilaCompletar({
  indice,
  fila,
  bloqueada,
  onEscribir,
}: {
  indice: number;
  fila: FilaDelLote;
  /** Mientras se guarda el lote nadie escribe: lo que se manda es lo que se ve. */
  bloqueada: boolean;
  onEscribir: (id: string, campo: CampoCompletar, valor: string) => void;
}) {
  const { persona: p, valores: v, avisos } = fila;
  const falta = [faltaDocumento(v) && "DNI/RUC", faltaTelefono(v) && "celular", faltaTipo(v) && "tipo"].filter(Boolean);
  const cambiada = !!fila.cambio && fila.estado?.fase !== "ok";
  const hayEstado = !!fila.estado || !!fila.cambio || !!avisos.documento || !!avisos.telefono;
  const comun = (col: CampoCompletar) => ({
    "data-lote-fila": indice,
    "data-lote-col": col,
    disabled: bloqueada,
    value: v[col],
    onChange: (e: { target: { value: string } }) => onEscribir(p.id, col, e.target.value),
  });

  return (
    <tr data-fila-completar={p.id} data-cambiada={cambiada || undefined} className={cambiada ? "[&>td]:bg-[var(--accent-soft)]" : undefined}>
      {/* En el celular (tarjetas, < 640 px) el nombre va de cabecera, sin rótulo
          «PERSONA», y «Cómo va» vacío no ocupa su renglón: 284 → ~230 px por persona. */}
      <td className="max-sm:block! max-sm:text-left! max-sm:before:hidden!">
        <span className="block font-semibold leading-tight text-[var(--text-primary)]">{p.nombre}</span>
        {falta.length > 0 && <span className="block text-xs leading-tight text-[var(--text-tertiary)]">Falta: {falta.join(" · ")}</span>}
      </td>
      <td>
        <input
          {...comun("documento")}
          inputMode="numeric"
          autoComplete="off"
          placeholder="DNI o RUC"
          aria-label={`DNI o RUC de ${p.nombre}`}
          aria-invalid={avisos.documento ? true : undefined}
          title={avisos.documento ?? undefined}
          className={campo(!!avisos.documento, "h-10 tabular-nums sm:w-36")}
        />
      </td>
      <td>
        <input
          {...comun("telefono")}
          inputMode="tel"
          autoComplete="off"
          placeholder="9XX XXX XXX"
          aria-label={`Celular de ${p.nombre}`}
          aria-invalid={avisos.telefono ? true : undefined}
          title={avisos.telefono ?? undefined}
          className={campo(!!avisos.telefono, "h-10 tabular-nums sm:w-36")}
        />
      </td>
      <td>
        <select {...comun("tipoRelacion")} aria-label={`Qué es ${p.nombre} para el negocio`} className={campo(false, "h-10 pr-8 sm:w-40")}>
          <option value="">Sin tipo</option>
          {TIPOS_RELACION.map((t) => (
            <option key={t} value={t}>
              {ETIQUETA_RELACION[t]}
            </option>
          ))}
        </select>
      </td>
      <td className={hayEstado ? undefined : "max-sm:hidden!"}>
        <Estado fila={fila} />
      </td>
    </tr>
  );
}
