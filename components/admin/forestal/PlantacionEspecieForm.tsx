"use client";

/**
 * PlantacionEspecieForm — una especie dentro de un bloque de plantación
 * (Sección 9 del Formato Único RNPF). El combobox de nombre común es de
 * apoyo (`sugerirEspecies`): el operador siempre puede escribir una especie
 * que no está en el catálogo — nunca se bloquea a una lista cerrada.
 */

import { useMemo, useState } from "react";
import { AlertTriangle, Copy, Search, Trash2 } from "@buleje/design-system/icons";
import type { EspecieBloqueInput } from "@/lib/forestal/plantacion-tramite";
import {
  buscarEnCatalogo,
  FINALIDADES_PLANTACION,
  sugerirEspecies,
  TIPOS_SISTEMA_AGROFORESTAL,
  TIPOS_VEGETATIVOS,
} from "@/lib/forestal/plantacion-catalogo";

const inputCls =
  "h-9 w-full rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-2.5 text-sm text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]/20 placeholder:text-[var(--text-tertiary)]";
const labelCls = "mb-1 block text-xs font-semibold text-[var(--text-secondary)]";

const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Setiembre", "Octubre", "Noviembre", "Diciembre",
];

const PREFIJO_AGROFORESTAL = "Tipo de sistema agroforestal: ";

/** Extrae/edita la línea de "Tipo de sistema agroforestal" dentro de `observaciones`
 *  — no hay campo propio en `EspecieBloqueInput` para ese dato del Formato N°01 §3. */
function tipoAgroforestalDeObservaciones(obs: string | null | undefined): string {
  const primera = (obs ?? "").split("\n")[0] ?? "";
  return primera.startsWith(PREFIJO_AGROFORESTAL) ? primera.slice(PREFIJO_AGROFORESTAL.length) : "";
}

function restoDeObservaciones(obs: string | null | undefined): string {
  const lineas = (obs ?? "").split("\n");
  return (lineas[0]?.startsWith(PREFIJO_AGROFORESTAL) ? lineas.slice(1) : lineas).join("\n");
}

function combinarObservaciones(tipoAgroforestal: string, resto: string): string {
  if (!tipoAgroforestal) return resto;
  return [`${PREFIJO_AGROFORESTAL}${tipoAgroforestal}`, resto].filter((l) => l !== "").join("\n");
}

export default function PlantacionEspecieForm({
  especie,
  index,
  tipoTramite,
  soloLectura,
  onChange,
  onEliminar,
  onDuplicar,
}: {
  especie: EspecieBloqueInput;
  index: number;
  tipoTramite: "inscripcion" | "actualizacion";
  soloLectura?: boolean;
  onChange: (especie: EspecieBloqueInput) => void;
  onEliminar: () => void;
  onDuplicar: () => void;
}) {
  const [buscando, setBuscando] = useState(false);

  const sugerencias = useMemo(
    () => (especie.nombreComun.trim() ? sugerirEspecies(especie.nombreComun) : sugerirEspecies("")),
    [especie.nombreComun],
  );

  function set<K extends keyof EspecieBloqueInput>(campo: K, valor: EspecieBloqueInput[K]) {
    onChange({ ...especie, [campo]: valor });
  }

  function elegirDelCatalogo(nombreComun: string) {
    const hit = buscarEnCatalogo(nombreComun);
    onChange({
      ...especie,
      nombreComun,
      nombreCientifico: hit?.cientifico ?? especie.nombreCientifico,
      cites: hit?.cites ? true : especie.cites,
    });
    setBuscando(false);
  }

  const catalogoCites = buscarEnCatalogo(especie.nombreComun)?.cites === true;
  const mostrarAvisoCites = Boolean(especie.cites);
  const tipoAgroforestal = tipoAgroforestalDeObservaciones(especie.observaciones);
  const observacionesResto = restoDeObservaciones(especie.observaciones);

  return (
    <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-xs font-bold uppercase tracking-wide text-[var(--text-tertiary)]">Especie {index + 1}</span>
        {!soloLectura && (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={onDuplicar}
              title="Duplicar especie"
              className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-[var(--text-tertiary)] transition hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]"
            >
              <Copy className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={onEliminar}
              title="Eliminar especie"
              className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-[var(--data-error-600)] transition hover:bg-[var(--data-error-50)] dark:hover:bg-[var(--data-error-500)]/12"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="relative sm:col-span-2">
          <label className={labelCls}>Nombre común</label>
          <div className="relative">
            <input
              type="text"
              value={especie.nombreComun}
              disabled={soloLectura}
              onChange={(e) => {
                set("nombreComun", e.target.value);
                setBuscando(true);
              }}
              onFocus={() => setBuscando(true)}
              onBlur={() => setTimeout(() => setBuscando(false), 150)}
              placeholder="ej: Tornillo"
              className={`${inputCls} pr-8`}
            />
            <Search className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-tertiary)]" />
          </div>
          {!soloLectura && buscando && sugerencias.length > 0 && (
            <div className="absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] shadow-[var(--shadow-md)]">
              {sugerencias.map((s) => (
                <button
                  key={s.comun}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => elegirDelCatalogo(s.comun)}
                  className="flex w-full items-center justify-between gap-2 px-2.5 py-1.5 text-left text-sm transition hover:bg-[var(--surface-sunken)]"
                >
                  <span className="text-[var(--text-primary)]">{s.comun}</span>
                  <span className="truncate text-xs italic text-[var(--text-tertiary)]">{s.cientifico}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div>
          <label className={labelCls}>Nombre científico</label>
          <input
            type="text"
            value={especie.nombreCientifico ?? ""}
            disabled={soloLectura}
            onChange={(e) => set("nombreCientifico", e.target.value)}
            placeholder="Se autocompleta desde el catálogo"
            className={`${inputCls} italic`}
          />
        </div>

        <div>
          <label className={labelCls}>Tipo vegetativo / material de propagación</label>
          <input
            type="text"
            list={`tipo-vegetativo-${index}`}
            value={especie.tipoVegetativo ?? ""}
            disabled={soloLectura}
            onChange={(e) => set("tipoVegetativo", e.target.value)}
            placeholder="Seleccioná o escribí"
            className={inputCls}
          />
          <datalist id={`tipo-vegetativo-${index}`}>
            {TIPOS_VEGETATIVOS.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        </div>

        <div>
          <label className={labelCls}>Cantidad</label>
          <input
            type="number"
            value={especie.cantidad ?? ""}
            disabled={soloLectura}
            onChange={(e) => set("cantidad", e.target.value === "" ? null : Number(e.target.value))}
            className={inputCls}
          />
        </div>

        <div>
          <label className={labelCls}>Finalidad</label>
          <select
            value={especie.finalidad ?? ""}
            disabled={soloLectura}
            onChange={(e) => set("finalidad", e.target.value || null)}
            className={inputCls}
          >
            <option value="">Seleccionar…</option>
            {FINALIDADES_PLANTACION.map((f) => (
              <option key={f.value} value={f.value}>{f.label}</option>
            ))}
          </select>
        </div>

        {especie.finalidad === "sistema_agroforestal" && (
          <div>
            <label className={labelCls}>Tipo de sistema agroforestal</label>
            <select
              value={tipoAgroforestal}
              disabled={soloLectura}
              onChange={(e) => set("observaciones", combinarObservaciones(e.target.value, observacionesResto) || null)}
              className={inputCls}
            >
              <option value="">Seleccionar…</option>
              {TIPOS_SISTEMA_AGROFORESTAL.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label className={labelCls}>Mes de instalación</label>
          <select
            value={especie.mesInstalacion ?? ""}
            disabled={soloLectura}
            onChange={(e) => set("mesInstalacion", e.target.value === "" ? null : Number(e.target.value))}
            className={inputCls}
          >
            <option value="">Mes…</option>
            {MESES.map((m, i) => (
              <option key={m} value={i + 1}>{m}</option>
            ))}
          </select>
        </div>

        <div>
          <label className={labelCls}>Año de instalación</label>
          <input
            type="number"
            value={especie.anioInstalacion ?? ""}
            disabled={soloLectura}
            onChange={(e) => set("anioInstalacion", e.target.value === "" ? null : Number(e.target.value))}
            placeholder="2024"
            className={inputCls}
          />
        </div>

        <div className="sm:col-span-2">
          <label className={labelCls}>Observaciones</label>
          <textarea
            value={observacionesResto}
            disabled={soloLectura}
            onChange={(e) => set("observaciones", combinarObservaciones(tipoAgroforestal, e.target.value) || null)}
            rows={2}
            className={`${inputCls} h-auto resize-y py-1.5`}
          />
        </div>

        {tipoTramite === "actualizacion" && (
          <>
            <div className="sm:col-span-2">
              <label className={labelCls}>Situación actual de la plantación</label>
              <textarea
                value={especie.situacionActual ?? ""}
                disabled={soloLectura}
                onChange={(e) => set("situacionActual", e.target.value || null)}
                rows={2}
                className={`${inputCls} h-auto resize-y py-1.5`}
              />
            </div>
            <div>
              <label className={labelCls}>Producción — cantidad</label>
              <input
                type="number"
                value={especie.produccionCantidad ?? ""}
                disabled={soloLectura}
                onChange={(e) => set("produccionCantidad", e.target.value === "" ? null : Number(e.target.value))}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Producción — unidad</label>
              <input
                type="text"
                list={`produccion-unidad-${index}`}
                value={especie.produccionUnidad ?? ""}
                disabled={soloLectura}
                onChange={(e) => set("produccionUnidad", e.target.value || null)}
                placeholder="árboles, kg, m³…"
                className={inputCls}
              />
              <datalist id={`produccion-unidad-${index}`}>
                <option value="árboles" />
                <option value="kg" />
                <option value="m³" />
                <option value="plantones" />
              </datalist>
            </div>
          </>
        )}
      </div>

      <div className="mt-3 flex items-center gap-2">
        <input
          id={`cites-${index}`}
          type="checkbox"
          checked={Boolean(especie.cites)}
          disabled={soloLectura}
          onChange={(e) => set("cites", e.target.checked)}
          className="h-4 w-4 accent-[var(--accent)]"
        />
        <label htmlFor={`cites-${index}`} className="text-sm font-medium text-[var(--text-primary)]">
          Especie bajo CITES
          {catalogoCites && !especie.cites && (
            <span className="ml-1.5 text-xs font-normal text-[var(--text-tertiary)]">(sugerido por el catálogo)</span>
          )}
        </label>
      </div>

      {mostrarAvisoCites && (
        <div className="mt-2 rounded-lg border-l-4 border-[var(--data-warning-500)] bg-[var(--data-warning-50)] p-2.5 text-xs text-[var(--data-warning-700)] dark:bg-[var(--data-warning-500)]/12 dark:text-[var(--data-warning-500)]">
          <p className="flex items-start gap-1.5 font-semibold">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Esta especie puede requerir información adicional.
          </p>
          <label className="mt-1.5 block text-xs font-semibold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
            Información adicional para especies CITES (procedencia de semillas o material de propagación)
          </label>
          <textarea
            value={especie.citesProcedencia ?? ""}
            disabled={soloLectura}
            onChange={(e) => set("citesProcedencia", e.target.value || null)}
            rows={2}
            className="mt-1 h-auto w-full resize-y rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-2.5 py-1.5 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--data-warning-500)]"
          />
        </div>
      )}
    </div>
  );
}
