"use client";

/**
 * «¿De qué lote mixto salió?» en Declarar producción (ADR-441, paso 6): si se
 * elige uno, al registrar se abre «Vincular con el lote mixto» ya armado con
 * las corridas recién creadas. Opcional: sin elegir, la producción queda sin
 * origen como siempre y se vincula después.
 *
 * Sólo lo ve quien puede firmar la vinculación (dueño o administrador) y sólo
 * si hay algún mixto: si no, no ocupa lugar.
 */

import { useId } from "react";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { useMiRol } from "@/hooks/use-mi-rol";
import { lineaDelMixto } from "@/lib/forestal/lote-mixto-vista";
import { CAMPO } from "./armar-lote-escaneo-partes";
import { puedeFirmarVinculo } from "./CtpVincularMixtoModal";
import { useLotesMixtos } from "./hooks/use-lotes-mixtos";

export default function CtpMixtoDelAsiento({
  valor,
  onCambiar,
}: {
  valor: string | null;
  onCambiar: (mixtoId: string | null) => void;
}) {
  const id = useId();
  const firma = puedeFirmarVinculo(useMiRol());
  const { abiertos, repartidos } = useLotesMixtos({ activo: firma });
  /* Un repartido sin lotes vivos (se deshicieron) no tiene madera que ofrecer. */
  const candidatos = [...abiertos, ...repartidos.filter((m) => m.lotes.length > 0).slice(0, 10)];
  if (!firma || candidatos.length === 0) return null;
  return (
    <div className="mt-4 flex flex-wrap items-end gap-2 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] p-3">
      <label htmlFor={id} className="block min-w-0 flex-1 basis-[16rem] text-sm">
        <span className="mb-1 block font-bold text-[var(--text-secondary)]">¿De qué lote mixto salió?</span>
        <select id={id} value={valor ?? ""} onChange={(e) => onCambiar(e.target.value || null)} className={CAMPO}>
          <option value="">Ninguno: lo vinculo después</option>
          {candidatos.map((m) => (
            <option key={m.id} value={m.id}>
              {lineaDelMixto({
                code: m.code,
                status: m.status,
                piezas: m.status === "abierto" ? m.resumen.piezas : m.lotes.reduce((a, l) => a + l.piezas, 0),
                especies: m.resumen.especies,
              })}
            </option>
          ))}
        </select>
      </label>
      <InfoTip
        title="Lote mixto de origen"
        what="Si la madera que se cubicó salió de un lote mixto, elígelo: al registrar se abre la vinculación ya armada, una corrida por especie."
        affects="Se proponen todas las trozas de cada especie del mixto; destildas las que no entraron. Firmar es del dueño o un administrador."
        example="LM-2026-003 → Tornillo con 14 trozas, Copaiba con 5; al firmar quedan con su origen."
        side="left"
      />
    </div>
  );
}
