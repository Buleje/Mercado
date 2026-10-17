"use client";

/**
 * Datos INTERNOS de la tala: quién la tumbó y a qué hora. No salen en el
 * libro que se imprime para SERFOR (la Sección 1 de la RDE 264-2019 no tiene
 * esas columnas); sirven para la operación —pagar por árbol, saber quién
 * estaba con la motosierra— y se ven en el detalle de la línea.
 *
 * El motosierrista se elige de Recursos Humanos o se tipea: en el monte
 * trabajan también terceros que nunca pasaron por la planilla.
 */

import { useEffect, useId, useState } from "react";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { logger } from "@/lib/logger";
import type { ColaboradorMinDTO } from "@/lib/rrhh/tipos";

type Colaborador = Pick<ColaboradorMinDTO, "id" | "nombre" | "apodo" | "puesto" | "estado">;

interface Props {
  motosierrista: string;
  onMotosierrista: (nombre: string, colaboradorId: string | null) => void;
  hora: string;
  onHora: (hora: string) => void;
}

const INPUT =
  "h-10 w-full rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm text-[var(--text-primary)] outline-none transition-colors placeholder:text-[var(--text-tertiary)] focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]/20";

/** El colaborador cuyo nombre (o apodo) es exactamente lo tipeado. */
export function colaboradorPorNombre(lista: readonly Colaborador[], texto: string): Colaborador | null {
  const t = texto.trim().toLowerCase();
  if (!t) return null;
  return lista.find((c) => c.nombre.trim().toLowerCase() === t || (c.apodo ?? "").trim().toLowerCase() === t) ?? null;
}

export default function LothTalaDatosInternos({ motosierrista, onMotosierrista, hora, onHora }: Props) {
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([]);
  const idLista = useId();

  useEffect(() => {
    let cancel = false;
    fetch("/api/rrhh/colaboradores?campos=min", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { colaboradores?: Colaborador[] } | null) => {
        if (cancel || !j) return;
        setColaboradores((j.colaboradores ?? []).filter((c) => c.estado !== "CESADO"));
      })
      // Sin permiso de RRHH o sin red: el campo se tipea igual.
      .catch((err) => logger.error("[LothTalaDatosInternos] colaboradores failed", { error: String(err) }));
    return () => {
      cancel = true;
    };
  }, []);

  return (
    <section aria-label="Datos internos de la tala" className="space-y-2 border-t border-[var(--rule-soft)] pt-3">
      <div className="flex items-center gap-1">
        <p className="text-sm font-bold text-[var(--text-primary)]">Datos internos</p>
        <InfoTip
          title="Datos internos"
          what="No salen en el libro que se imprime para SERFOR: son para tu operación."
          affects="Se ven en el detalle de la línea. Sirven para pagar por árbol y saber quién tumbó cada uno."
        />
      </div>
      <div className="grid grid-cols-6 gap-3 [&>*]:min-w-0">
        <label className="col-span-6 block sm:col-span-4">
          <span className="mb-1 flex min-h-6 items-center text-sm font-medium text-[var(--text-primary)]">Motosierrista</span>
          <input
            type="text"
            list={colaboradores.length > 0 ? idLista : undefined}
            value={motosierrista}
            onChange={(e) => {
              const v = e.target.value;
              onMotosierrista(v, colaboradorPorNombre(colaboradores, v)?.id ?? null);
            }}
            maxLength={120}
            placeholder={colaboradores.length > 0 ? "Elige de tu personal o escribe el nombre" : "Nombre de quien tumbó el árbol"}
            className={INPUT}
          />
          {colaboradores.length > 0 && (
            <datalist id={idLista}>
              {colaboradores.map((c) => (
                <option key={c.id} value={c.nombre}>
                  {c.puesto?.nombre ?? ""}
                </option>
              ))}
            </datalist>
          )}
        </label>
        <label className="col-span-6 block sm:col-span-2">
          <span className="mb-1 flex min-h-6 items-center text-sm font-medium text-[var(--text-primary)]">Hora de tala</span>
          <input type="time" value={hora} onChange={(e) => onHora(e.target.value)} className={`${INPUT} font-mono tabular-nums`} />
        </label>
      </div>
    </section>
  );
}
