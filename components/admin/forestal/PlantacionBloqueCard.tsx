"use client";

/**
 * PlantacionBloqueCard — un bloque de plantación completo: identificación
 * (Sección 8 del Formato Único RNPF), sus vértices UTM y sus especies.
 */

import { useMemo } from "react";
import { Copy, Plus, Ruler, Trash2 } from "@buleje/design-system/icons";
import { CardTitle } from "@buleje/design-system";
import type { AdvertenciaPlantacion, BloqueInput, EspecieBloqueInput } from "@/lib/forestal/plantacion-tramite";
import { geometriaBloque, type VerticeBloque } from "@/lib/forestal/plantacion-cartografia";
import PlantacionVerticesTabla from "./PlantacionVerticesTabla";
import PlantacionEspecieForm from "./PlantacionEspecieForm";

const inputCls =
  "h-9 w-full rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-2.5 text-sm text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]/20";
const labelCls = "mb-1 block text-xs font-semibold text-[var(--text-secondary)]";

export default function PlantacionBloqueCard({
  bloque,
  index,
  tipoTramite,
  soloLectura,
  avisos,
  onChange,
  onEliminar,
  onDuplicar,
}: {
  bloque: BloqueInput;
  index: number;
  tipoTramite: "inscripcion" | "actualizacion";
  soloLectura?: boolean;
  avisos: AdvertenciaPlantacion[];
  onChange: (bloque: BloqueInput) => void;
  onEliminar: () => void;
  onDuplicar: () => void;
}) {
  const geometria = useMemo(() => geometriaBloque(bloque.vertices), [bloque.vertices]);

  function set<K extends keyof BloqueInput>(campo: K, valor: BloqueInput[K]) {
    onChange({ ...bloque, [campo]: valor });
  }

  function onVertices(vertices: VerticeBloque[]) {
    onChange({ ...bloque, vertices });
  }

  function agregarEspecie() {
    onChange({ ...bloque, especies: [...bloque.especies, { nombreComun: "" }] });
  }

  function editarEspecie(i: number, especie: EspecieBloqueInput) {
    onChange({ ...bloque, especies: bloque.especies.map((e, idx) => (idx === i ? especie : e)) });
  }

  function eliminarEspecie(i: number) {
    onChange({ ...bloque, especies: bloque.especies.filter((_, idx) => idx !== i) });
  }

  function duplicarEspecie(i: number) {
    const original = bloque.especies[i];
    if (!original) return;
    const copia: EspecieBloqueInput = { ...original, id: undefined };
    onChange({ ...bloque, especies: [...bloque.especies.slice(0, i + 1), copia, ...bloque.especies.slice(i + 1)] });
  }

  const avisoVertices = avisos.find((a) => a.campo === `bloques.${index}.vertices`);
  const avisosEspecies = new Map(
    avisos.filter((a) => a.campo.startsWith(`bloques.${index}.especies.`)).map((a) => [a.campo, a]),
  );

  return (
    <section className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)]">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b-2 border-[var(--rule-base)] px-4 py-3">
        <CardTitle as="h3" className="text-sm font-black uppercase tracking-widest text-[var(--text-secondary)]">
          Bloque {bloque.numero || index + 1}{bloque.nombre ? ` — ${bloque.nombre}` : ""}
        </CardTitle>
        {!soloLectura && (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={onDuplicar}
              title="Duplicar bloque"
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[var(--rule-base)] px-2.5 text-xs font-bold text-[var(--text-secondary)] hover:bg-[var(--surface-canvas)]"
            >
              <Copy className="h-3.5 w-3.5" /> Duplicar
            </button>
            <button
              type="button"
              onClick={onEliminar}
              title="Eliminar bloque"
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[var(--data-error-600)] hover:bg-[var(--data-error-50)] dark:hover:bg-[var(--data-error-500)]/12"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </header>

      <div className="space-y-4 p-4">
        {/* Identificación (Sección 8) */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <label className={labelCls}>N° de bloque</label>
            <input
              type="number"
              value={bloque.numero}
              disabled={soloLectura}
              onChange={(e) => set("numero", e.target.value === "" ? 0 : Number(e.target.value))}
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>Nombre del bloque (opcional)</label>
            <input
              type="text"
              value={bloque.nombre ?? ""}
              disabled={soloLectura}
              onChange={(e) => set("nombre", e.target.value || null)}
              placeholder="ej: Parcela Norte"
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>Superficie (ha)</label>
            <input
              type="number"
              step="0.01"
              value={bloque.superficieHa ?? ""}
              disabled={soloLectura}
              onChange={(e) => set("superficieHa", e.target.value === "" ? null : Number(e.target.value))}
              className={inputCls}
            />
            {geometria.areaCalculadaHa != null && (
              <p className="mt-1 flex items-center gap-1 text-xs text-[var(--text-tertiary)]">
                <Ruler className="h-3 w-3" /> Área calculada desde vértices: {geometria.areaCalculadaHa.toLocaleString("es-PE", { maximumFractionDigits: 2 })} ha
              </p>
            )}
          </div>
        </div>

        {/* Vértices UTM */}
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wide text-[var(--text-tertiary)]">Vértices UTM del bloque</span>
          </div>
          <PlantacionVerticesTabla vertices={bloque.vertices} soloLectura={soloLectura} onChange={onVertices} />
          {avisoVertices && (
            <p className="mt-1.5 text-xs font-semibold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">{avisoVertices.mensaje}</p>
          )}
        </div>

        {/* Especies */}
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wide text-[var(--text-tertiary)]">Especies</span>
          </div>
          <div className="space-y-2">
            {bloque.especies.map((especie, i) => {
              const aviso = avisosEspecies.get(`bloques.${index}.especies.${i}`);
              return (
                <div key={i}>
                  <PlantacionEspecieForm
                    especie={especie}
                    index={i}
                    tipoTramite={tipoTramite}
                    soloLectura={soloLectura}
                    onChange={(e) => editarEspecie(i, e)}
                    onEliminar={() => eliminarEspecie(i)}
                    onDuplicar={() => duplicarEspecie(i)}
                  />
                  {aviso && (
                    <p className="mt-1 text-xs font-semibold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">{aviso.mensaje}</p>
                  )}
                </div>
              );
            })}
          </div>
          {!soloLectura && (
            <button
              type="button"
              onClick={agregarEspecie}
              className="mt-2 inline-flex h-9 items-center gap-1.5 rounded-lg border border-dashed border-[var(--rule-base)] px-3 text-xs font-bold text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--accent-ink)] dark:hover:text-[var(--accent)]"
            >
              <Plus className="h-3.5 w-3.5" /> Agregar especie
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
