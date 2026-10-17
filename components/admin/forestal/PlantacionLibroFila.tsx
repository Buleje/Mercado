"use client";

/**
 * Una especie del Libro TH dentro de «Traer lo del Libro TH» (trámite de
 * actualización del registro): lo que el libro sabe de ella —talado,
 * despachado, en pie— y qué pasa con ella en el trámite (`planDeLlenado`).
 *
 * Fila de lista, no de tabla: a 400 px el nombre, las cifras y el destino se
 * apilan solos sin la maquinaria de tarjetas de una tabla.
 */

import { Check, Plus } from "@buleje/design-system/icons";
import { formatNumber } from "@/lib/format";
import type { Destino, EspecieDelLibro } from "@/lib/forestal/plantacion-libro";
import { Btn } from "./ctp-shared";

const m3 = (v: number) => `${formatNumber(v, 3)} m³`;
const bloques = (ns: number[]) => (ns.length === 2 ? `${ns[0]} y ${ns[1]}` : `${ns.slice(0, -1).join(", ")} y ${ns[ns.length - 1]}`);

const CHIP = "inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-sm font-semibold";
const TONO = {
  accent: "bg-[var(--accent-soft)] text-[var(--accent-ink)] dark:text-[var(--accent)]",
  ok: "bg-[var(--data-success-500)]/12 text-[var(--data-success-700)] dark:text-[var(--data-success-500)]",
  aviso: "bg-[var(--data-warning-500)]/12 text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]",
  gris: "bg-[var(--surface-sunken)] text-[var(--text-secondary)]",
} as const;

/** Qué pasa con la especie en el trámite, en una frase. */
function textoDestino(d: Destino, talado: number): { texto: string; tono: keyof typeof TONO } {
  switch (d.tipo) {
    case "completar":
      return { texto: `Bloque ${d.bloque}: se completa con ${m3(d.m3)}`, tono: "accent" };
    case "coincide":
      return { texto: `Bloque ${d.bloque}: ya dice ${m3(talado)}`, tono: "ok" };
    case "ya_tiene":
      return {
        texto: `Bloque ${d.bloque}: ya tiene ${formatNumber(d.cantidad, { max: 4 })}${d.unidad ? ` ${d.unidad}` : ""} — no se cambia`,
        tono: "gris",
      };
    case "otra_unidad":
      return { texto: `Bloque ${d.bloque} está en «${d.unidad}» — no se cambia`, tono: "aviso" };
    case "repartir":
      return { texto: `En los bloques ${bloques(d.bloques)}: reparte ${m3(talado)} a mano`, tono: "aviso" };
    case "sin_tala":
      return { texto: "Sin tala en el libro", tono: "gris" };
    case "falta":
      return { texto: "No está en el trámite", tono: "gris" };
  }
}

export default function PlantacionLibroFila({
  especie,
  destino,
  onAgregar,
}: {
  especie: EspecieDelLibro;
  destino: Destino;
  onAgregar: () => void;
}) {
  const { texto, tono } = textoDestino(destino, especie.taladoM3);
  return (
    <li className="flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between" data-especie-libro={especie.comun}>
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-x-2 text-sm font-semibold text-[var(--text-primary)]">
          {especie.comun}
          {especie.cientifico && <span className="text-xs font-normal italic text-[var(--text-tertiary)]">{especie.cientifico}</span>}
          {!especie.registrada && (
            <span className={`${CHIP} ${TONO.aviso} py-0.5 text-xs`}>no está en el registro</span>
          )}
        </p>
        <p className="mt-0.5 text-sm tabular-nums text-[var(--text-secondary)]">
          Talado <b className="font-mono text-[var(--text-primary)]">{formatNumber(especie.taladoM3, 3)}</b> m³
          {" · "}Despachado <span className="font-mono">{formatNumber(especie.despachadoM3, 3)}</span> m³
          {especie.enPieM3 != null && (
            <>
              {" · "}En pie <span className="font-mono">{formatNumber(especie.enPieM3, 3)}</span> m³
            </>
          )}
        </p>
      </div>
      {destino.tipo === "falta" ? (
        <Btn size="sm" onClick={onAgregar} aria-label={`Agregar ${especie.comun} al trámite`} className="shrink-0 self-start sm:self-auto">
          <Plus className="h-4 w-4" aria-hidden="true" /> Agregar
        </Btn>
      ) : (
        <span className={`${CHIP} ${TONO[tono]} shrink-0 self-start sm:self-auto`}>
          {destino.tipo === "coincide" && <Check className="h-4 w-4" aria-hidden="true" />}
          {texto}
        </span>
      )}
    </li>
  );
}
