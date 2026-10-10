"use client";

/**
 * ModalMetaCampos — los cuatro bloques del modal de una meta, en un solo paso:
 * (1) el área, (2) qué mides, (3) cada cuánto y (4) cuánto quieres lograr,
 * con la vista previa de lo que ya llevas en el período.
 *
 * Sólo dibuja: el estado, la validación y el guardado viven en `ModalMeta`.
 */
import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { AREAS_META, CATALOGO_METAS, categoriasDelArea, type AreaMeta } from "@/lib/admin/metas-catalogo";
import { NOMBRE_PERIODO } from "@/lib/admin/metas-periodo";
import { PERIODOS_META, type CategoriaMeta, type PeriodoMeta } from "@/lib/admin/metas-tareas";
import type { VistaPrevia } from "@/hooks/use-metas";
import { CAMPO, claseChip } from "./clases-meta";
import { cifraDeMeta } from "./formato-meta";

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
const ERROR = "mt-1 block text-xs font-semibold text-[var(--data-error-ink)]";
/** Todos los rótulos de campo del mismo alto: el que lleva ⓘ (24 px) ya no baja su campo. */
const ROTULO = "mb-1 flex min-h-6 items-center gap-1 text-xs font-semibold text-[var(--text-secondary)]";

function Bloque({ n, titulo, children, ayuda }: { n: number; titulo: string; children: ReactNode; ayuda?: ReactNode }) {
  return (
    <fieldset className="min-w-0">
      <legend className={ETIQUETA}>
        <span className="grid h-5 w-5 place-items-center rounded-full bg-[var(--surface-sunken)] text-xs tabular-nums text-[var(--text-secondary)]">{n}</span>
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
}: {
  form: FormMeta;
  errores: ErroresMeta;
  previa: VistaPrevia;
  onArea: (a: AreaMeta) => void;
  onCategoria: (c: CategoriaMeta) => void;
  onPeriodo: (p: PeriodoMeta) => void;
  onCampo: (campo: CampoMeta, valor: string) => void;
}) {
  const cat = CATALOGO_METAS[form.category];
  const esManual = form.category === "manual";
  const unidadAntes = form.unit === "S/";
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
                className={`inline-flex h-10 shrink-0 items-center gap-2 whitespace-nowrap rounded-full border px-3.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40 ${
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

      <Bloque n={2} titulo="¿Qué quieres medir?">
        <div role="radiogroup" aria-label="Qué quieres medir" className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {categoriasDelArea(form.area).map((c) => (
            <div
              key={c.id}
              className="relative flex items-start gap-1 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] has-[:checked]:border-[var(--accent)] has-[:checked]:bg-[var(--accent-soft)]"
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
                  <span className="block text-xs text-[var(--text-secondary)]">{c.queMide}</span>
                </span>
              </label>
              <span className="p-2">
                <InfoTip title={c.nombre} what={`Sale de: ${c.fuente}.`} ariaLabel={`De dónde sale «${c.nombre}»`} side="left" />
              </span>
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
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_minmax(0,0.9fr)]">
          <label className="block">
            <span className={ROTULO}>Objetivo</span>
            <span className="flex items-stretch">
              {unidadAntes && <UnidadPegada lado="antes">S/</UnidadPegada>}
              <input
                type="number"
                inputMode="decimal"
                min={0}
                step="any"
                required
                value={form.target}
                placeholder={String(cat.plantilla.target)}
                onChange={(e) => onCampo("target", e.target.value)}
                aria-invalid={Boolean(errores.target)}
                className={`${CAMPO} h-11 min-w-0 flex-1 tabular-nums ${unidadAntes ? "rounded-l-none" : "rounded-r-none"}`}
              />
              {!unidadAntes &&
                (cat.unidades.length > 1 ? (
                  <select
                    aria-label="Unidad"
                    value={form.unit}
                    onChange={(e) => onCampo("unit", e.target.value)}
                    className="h-11 rounded-r-xl border border-l-0 border-[var(--rule-base)] bg-[var(--surface-sunken)] px-2 text-sm font-semibold text-[var(--text-primary)]"
                  >
                    {cat.unidades.map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                  </select>
                ) : esManual ? (
                  <input
                    aria-label="Unidad"
                    value={form.unit}
                    maxLength={20}
                    placeholder="unid."
                    onChange={(e) => onCampo("unit", e.target.value)}
                    className="h-11 w-24 rounded-r-xl border border-l-0 border-[var(--rule-base)] bg-[var(--surface-sunken)] px-2 text-sm text-[var(--text-primary)]"
                  />
                ) : (
                  <UnidadPegada lado="despues">{form.unit}</UnidadPegada>
                ))}
            </span>
            {(errores.target || errores.unit) && <span className={ERROR}>{errores.target ?? errores.unit}</span>}
          </label>

          <label className="block">
            <span className={ROTULO}>Nombre</span>
            <input
              value={form.name}
              maxLength={120}
              placeholder={esManual ? "Ej.: Visitas a clientes" : cat.nombre}
              onChange={(e) => onCampo("name", e.target.value)}
              aria-invalid={Boolean(errores.name)}
              className={`${CAMPO} h-11`}
            />
            {errores.name && <span className={ERROR}>{errores.name}</span>}
          </label>

          <div className="block">
            <span className={ROTULO}>
              <label htmlFor="meta-vence">Vence (opcional)</label>
              <InfoTip
                title="Vencimiento"
                what="Sin fecha, la meta se repite cada período. Con fecha, cuando pasa queda cerrada con su resultado."
              />
            </span>
            <input id="meta-vence" type="date" value={form.dueDate} onChange={(e) => onCampo("dueDate", e.target.value)} className={`${CAMPO} h-11`} />
            {errores.dueDate && <span className={ERROR}>{errores.dueDate}</span>}
          </div>

          {esManual ? (
            <label className="block">
              <span className={ROTULO}>Avance (lo anotas tú)</span>
              <input
                type="number"
                inputMode="decimal"
                min={0}
                step="any"
                value={form.current}
                placeholder="0"
                onChange={(e) => onCampo("current", e.target.value)}
                aria-invalid={Boolean(errores.current)}
                className={`${CAMPO} h-11 tabular-nums`}
              />
              {errores.current && <span className={ERROR}>{errores.current}</span>}
            </label>
          ) : (
            <div
              aria-live="polite"
              className="rounded-xl bg-[var(--surface-sunken)] px-3 py-2.5 text-sm text-[var(--text-secondary)] sm:col-span-2 lg:col-span-3"
            >
              {previa.cargando ? (
                "Midiendo lo que llevas…"
              ) : previa.avance !== undefined ? (
                <>
                  En este período{previa.etiqueta ? ` (${previa.etiqueta})` : ""} llevas{" "}
                  <strong className="tabular-nums text-[var(--text-primary)]">{cifraDeMeta(previa.avance, form.unit)}</strong>
                  {previa.parcial && <span className="block text-xs">Dato parcial: {previa.parcial}</span>}
                </>
              ) : (
                "El avance sale solo de tus datos del período."
              )}
            </div>
          )}
        </div>
      </Bloque>
    </div>
  );
}

function UnidadPegada({ lado, children }: { lado: "antes" | "despues"; children: ReactNode }) {
  return (
    <span
      className={`inline-flex h-11 shrink-0 items-center border border-[var(--rule-base)] bg-[var(--surface-sunken)] px-3 text-sm font-semibold text-[var(--text-secondary)] ${
        lado === "antes" ? "rounded-l-xl border-r-0" : "rounded-r-xl border-l-0"
      }`}
    >
      {children}
    </span>
  );
}
