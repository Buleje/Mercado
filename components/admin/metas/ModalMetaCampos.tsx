"use client";

/**
 * ModalMetaCampos — los cuatro bloques del modal de una meta, en un solo paso:
 * (1) el área, (2) qué mides, (3) cada cuánto y (4) cuánto quieres lograr
 * (`ModalMetaObjetivo`: la vista previa y la vara del período anterior).
 *
 * Todo control de 48 px y todo texto de 14 px o más (auditoría 10-10). «De
 * dónde sale» va en UN ⓘ junto a «¿Qué quieres medir?», de lo elegido (antes
 * un ⓘ de 24 px en cada opción).
 *
 * Sólo dibuja: el estado, la validación y el guardado viven en `ModalMeta`.
 */
import { useEffect, useRef, type CSSProperties, type ReactNode, type RefObject } from "react";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { AREAS_META, CATALOGO_METAS, categoriasDelArea, type AreaMeta } from "@/lib/admin/metas-catalogo";
import { NOMBRE_PERIODO } from "@/lib/admin/metas-periodo";
import { PERIODOS_META, type CategoriaMeta, type PeriodoMeta } from "@/lib/admin/metas-tareas";
import type { VistaPrevia } from "@/hooks/use-metas";
import { claseChip } from "./clases-meta";
import { ModalMetaObjetivo } from "./ModalMetaObjetivo";

export interface FormMeta {
  area: AreaMeta;
  category: CategoriaMeta;
  period: PeriodoMeta;
  target: string;
  unit: string;
  name: string;
  /** El nombre se escribió a mano: ya no se arma solo al cambiar la categoría. */
  nombreTocado: boolean;
  dueDate: string;
  /** Sólo en la meta a mano. */
  current: string;
}

export type CampoMeta = "name" | "target" | "unit" | "dueDate" | "current";
export type ErroresMeta = Partial<Record<CampoMeta, string>>;

const ETIQUETA = "mb-2 flex items-center gap-1.5 text-sm font-bold text-[var(--text-primary)]";

function Bloque({ n, titulo, children, ayuda }: { n: number; titulo: string; children: ReactNode; ayuda?: ReactNode }) {
  return (
    <fieldset className="min-w-0">
      <legend className={ETIQUETA}>
        <span className="grid h-6 w-6 place-items-center rounded-full bg-[var(--surface-sunken)] text-sm tabular-nums text-[var(--text-secondary)]">{n}</span>
        {titulo}
        {ayuda}
      </legend>
      {children}
    </fieldset>
  );
}

export function ModalMetaCampos({
  form,
  errores,
  previa,
  onArea,
  onCategoria,
  onPeriodo,
  onCampo,
  objetivoRef,
}: {
  form: FormMeta;
  errores: ErroresMeta;
  previa: VistaPrevia;
  onArea: (a: AreaMeta) => void;
  onCategoria: (c: CategoriaMeta) => void;
  onPeriodo: (p: PeriodoMeta) => void;
  onCampo: (campo: CampoMeta, valor: string) => void;
  objetivoRef?: RefObject<HTMLInputElement | null>;
}) {
  const cat = CATALOGO_METAS[form.category];
  const esManual = form.category === "manual";
  /* En el celular las áreas van en UNA fila que se desliza (eran 5 filas de chips
     antes de llegar a lo que se mide): la elegida se trae a la vista. Depende del
     área y no del montaje: al editar, el formulario llega un render DESPUÉS
     (`ModalMeta` lo arma en un efecto) y «A mano» quedaba fuera de la fila. */
  const filaAreas = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const fila = filaAreas.current;
    const chip = fila?.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (!fila || !chip || fila.scrollWidth <= fila.clientWidth) return;
    // Sólo la fila se mueve (scrollIntoView también correría el cuerpo del modal).
    const izq = chip.offsetLeft; // la fila es `relative`: es su offsetParent
    if (izq < fila.scrollLeft || izq + chip.offsetWidth > fila.scrollLeft + fila.clientWidth) {
      fila.scrollTo({ left: Math.max(0, izq - 20), behavior: "auto" });
    }
  }, [form.area]);

  return (
    <div className="space-y-5">
      <Bloque n={1} titulo="¿De qué área es?">
        <div
          ref={filaAreas}
          className="relative flex gap-2 max-sm:-mx-5 max-sm:overflow-x-auto max-sm:px-5 max-sm:pb-1 sm:flex-wrap"
        >
          {AREAS_META.map((a) => {
            const Icono = a.icono;
            const activa = form.area === a.id;
            return (
              <button
                key={a.id}
                type="button"
                aria-pressed={activa}
                onClick={() => onArea(a.id)}
                style={{ "--area": a.color } as CSSProperties}
                className={`inline-flex h-12 shrink-0 items-center gap-2 whitespace-nowrap rounded-full border px-3.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40 ${
                  activa
                    ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--text-primary)]"
                    : "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:border-[var(--accent)]"
                }`}
              >
                <Icono className="h-4 w-4 shrink-0 text-[var(--area)]" aria-hidden="true" />
                {a.nombre}
              </button>
            );
          })}
        </div>
      </Bloque>

      <Bloque
        n={2}
        titulo="¿Qué quieres medir?"
        ayuda={
          esManual ? undefined : (
            <InfoTip title={cat.nombre} what={`Sale de: ${cat.fuente}.`} ariaLabel={`De dónde sale «${cat.nombre}»`} />
          )
        }
      >
        <div role="radiogroup" aria-label="Qué quieres medir" className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {categoriasDelArea(form.area).map((c) => (
            <div
              key={c.id}
              className="relative flex items-start rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] has-[:checked]:border-[var(--accent)] has-[:checked]:bg-[var(--accent-soft)]"
            >
              <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-2 px-3 py-2.5">
                <input
                  type="radio"
                  name="meta-categoria"
                  value={c.id}
                  checked={form.category === c.id}
                  onChange={() => onCategoria(c.id)}
                  className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--accent)]"
                />
                <span className="min-w-0">
                  <span className="block text-sm font-bold text-[var(--text-primary)]">{c.nombre}</span>
                  <span className="block text-sm text-[var(--text-secondary)]">{c.queMide}</span>
                </span>
              </label>
            </div>
          ))}
        </div>
      </Bloque>

      <Bloque n={3} titulo="¿Cada cuánto?">
        <div role="group" aria-label="Período" className="flex flex-wrap gap-2">
          {PERIODOS_META.map((p) => (
            <button key={p} type="button" aria-pressed={form.period === p} onClick={() => onPeriodo(p)} className={claseChip(form.period === p)}>
              {NOMBRE_PERIODO[p]}
            </button>
          ))}
        </div>
      </Bloque>

      <Bloque
        n={4}
        titulo={cat.sentido === "baja" ? "¿Cuál es tu tope?" : "¿Cuánto quieres lograr?"}
        ayuda={
          cat.sentido === "baja" ? (
            <InfoTip title="Tope" what="En esta meta lo bueno es quedarte por debajo: la barra avisa si vas gastando más rápido que el ritmo." />
          ) : undefined
        }
      >
        <ModalMetaObjetivo form={form} errores={errores} previa={previa} onCampo={onCampo} objetivoRef={objetivoRef} />
      </Bloque>
    </div>
  );
}

