"use client";

/**
 * PlantacionPasoBloques — paso del wizard RNPF con los bloques de la
 * plantación: identificación, vértices UTM y especies de cada uno.
 *
 * Los avisos (`validarPlantacion`) nunca bloquean ni borran nada — sólo
 * se muestran para que el operador decida completar antes de presentar.
 */

import { useMemo } from "react";
import { AlertTriangle, Plus } from "@buleje/design-system/icons";
import { CardTitle } from "@buleje/design-system";
import { validarPlantacion, type BloqueInput, type PlantacionInput } from "@/lib/forestal/plantacion-tramite";
import PlantacionBloqueCard from "./PlantacionBloqueCard";

export default function PlantacionPasoBloques({
  bloques,
  predioAreaTotalHa,
  tipoTramite,
  soloLectura,
  onChange,
}: {
  bloques: BloqueInput[];
  predioAreaTotalHa: number | null;
  tipoTramite: "inscripcion" | "actualizacion";
  soloLectura?: boolean;
  onChange: (bloques: BloqueInput[]) => void;
}) {
  const superficieBloques = useMemo(
    () => Math.round(bloques.reduce((a, b) => a + (b.superficieHa ?? 0), 0) * 10_000) / 10_000,
    [bloques],
  );
  const superaAreaPredio = Boolean(predioAreaTotalHa && predioAreaTotalHa > 0 && superficieBloques > predioAreaTotalHa);

  // Single source: la regla de qué avisar vive en `validarPlantacion` (lib
  // puro, testeado) — acá sólo se arma el `PlantacionInput` mínimo que necesita.
  const avisos = useMemo(() => {
    const doc: PlantacionInput = { tipoTramite, predioAreaTotalHa, bloques };
    return validarPlantacion(doc);
  }, [tipoTramite, predioAreaTotalHa, bloques]);

  const numEspecies = bloques.reduce((a, b) => a + b.especies.length, 0);

  function siguienteNumero(): number {
    return bloques.reduce((max, b) => Math.max(max, b.numero || 0), 0) + 1;
  }

  function agregarBloque() {
    const nuevo: BloqueInput = { numero: siguienteNumero(), vertices: [], especies: [] };
    onChange([...bloques, nuevo]);
  }

  function editarBloque(i: number, bloque: BloqueInput) {
    onChange(bloques.map((b, idx) => (idx === i ? bloque : b)));
  }

  function eliminarBloque(i: number) {
    if (!window.confirm("¿Eliminar este bloque? Se pierden sus vértices y especies cargadas.")) return;
    onChange(bloques.filter((_, idx) => idx !== i));
  }

  function duplicarBloque(i: number) {
    const original = bloques[i];
    if (!original) return;
    const copia: BloqueInput = {
      numero: siguienteNumero(),
      nombre: original.nombre,
      superficieHa: original.superficieHa,
      vertices: original.vertices.map((v) => ({ ...v, id: undefined })),
      especies: original.especies.map((e) => ({ ...e, id: undefined })),
    };
    onChange([...bloques.slice(0, i + 1), copia, ...bloques.slice(i + 1)]);
  }

  return (
    <div className="space-y-4">
      <div
        className="relative overflow-hidden rounded-2xl border-2 border-[var(--rule-base)] p-4"
        style={{ background: "linear-gradient(135deg, var(--accent-soft) 0%, var(--surface-raised) 60%)" }}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle as="h3" className="font-display text-xl leading-tight text-[var(--text-primary)]">Bloques de plantación</CardTitle>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              {bloques.length} {bloques.length === 1 ? "bloque" : "bloques"} · {numEspecies} {numEspecies === 1 ? "especie" : "especies"} ·{" "}
              {superficieBloques.toLocaleString("es-PE", { maximumFractionDigits: 2 })} ha declaradas en bloques
              {predioAreaTotalHa ? ` de ${predioAreaTotalHa.toLocaleString("es-PE", { maximumFractionDigits: 2 })} ha del predio` : ""}
            </p>
          </div>
          {!soloLectura && (
            <button
              type="button"
              onClick={agregarBloque}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[var(--brand-ink)] px-3 text-xs font-bold text-white hover:opacity-90"
            >
              <Plus className="h-3.5 w-3.5" /> Agregar bloque
            </button>
          )}
        </div>

        {superaAreaPredio && (
          <p className="mt-3 flex items-start gap-2 rounded-xl border-l-4 border-[var(--data-warning-500)] bg-[var(--data-warning-50)] p-3 text-sm text-[var(--data-warning-700)] dark:bg-[var(--data-warning-500)]/12 dark:text-[var(--data-warning-500)]">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              La suma de superficie de los bloques ({superficieBloques.toLocaleString("es-PE", { maximumFractionDigits: 2 })} ha) supera el
              área declarada del predio ({(predioAreaTotalHa ?? 0).toLocaleString("es-PE", { maximumFractionDigits: 2 })} ha).
            </span>
          </p>
        )}
      </div>

      {bloques.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-[var(--rule-base)] p-8 text-center">
          <p className="text-sm text-[var(--text-tertiary)]">Todavía no hay bloques cargados.</p>
          {!soloLectura && (
            <button
              type="button"
              onClick={agregarBloque}
              className="mt-3 inline-flex h-9 items-center gap-1.5 rounded-lg bg-[var(--brand-ink)] px-3 text-xs font-bold text-white hover:opacity-90"
            >
              <Plus className="h-3.5 w-3.5" /> Agregar el primer bloque
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {bloques.map((bloque, i) => (
            <PlantacionBloqueCard
              key={i}
              bloque={bloque}
              index={i}
              tipoTramite={tipoTramite}
              soloLectura={soloLectura}
              avisos={avisos}
              onChange={(b) => editarBloque(i, b)}
              onEliminar={() => eliminarBloque(i)}
              onDuplicar={() => duplicarBloque(i)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
