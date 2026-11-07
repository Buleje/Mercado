"use client";

/**
 * El formulario de UN vínculo de una parte (ADR-430): con otra parte del
 * Directorio o con un permiso, la relación, desde/hasta y una nota.
 *
 * Controlado: el estado vive en `CtpParteVinculos`, que lo valida con
 * `vinculoParteInputSchema` y decide si se guarda ya o espera a la ficha.
 */

import { Link2, Loader2 } from "@buleje/design-system/icons";
import type { usePermisosForestal } from "@/hooks/use-permisos-forestal";
import { ROL_LABEL, type Parte } from "@/lib/forestal/directorio";
import {
  ETIQUETA_RELACION,
  RELACIONES_PARTE,
  type RelacionParte,
  type VinculoParteInput,
} from "@/lib/forestal/vinculos-parte";
import { Btn, I } from "./ctp-shared";
import { Rotulado } from "./ctp-precio-campos";

export interface Formulario {
  con: "parte" | "permiso";
  vinculadaParteId: string;
  contratoId: string;
  relacion: RelacionParte;
  desde: string;
  hasta: string;
  notas: string;
}

export const VACIO: Formulario = {
  con: "parte",
  vinculadaParteId: "",
  contratoId: "",
  relacion: "tercero",
  desde: "",
  hasta: "",
  notas: "",
};

/**
 * «Representa a» + «el permiso X» se dice «Representa AL permiso X» (y «Tercero
 * DEL permiso»): la etiqueta de la relación termina en preposición y el
 * castellano la contrae con el artículo. Se vio en el navegador: «Representa a
 * el permiso QA-…».
 */
export function fraseVinculo(relacion: RelacionParte, esPermiso: boolean): string {
  const base = ETIQUETA_RELACION[relacion];
  if (!esPermiso) return base;
  if (base.endsWith(" a")) return `${base.slice(0, -2)} al permiso`;
  if (base.endsWith(" de")) return `${base.slice(0, -3)} del permiso`;
  return `${base} el permiso`;
}

/** Del formulario a la entrada del servidor: lo vacío viaja como `null`, nunca `""`. */
export function aVinculoInput(parteId: string, f: Formulario): VinculoParteInput {
  return {
    parteId,
    relacion: f.relacion,
    vinculadaParteId: f.con === "parte" ? f.vinculadaParteId || null : null,
    contratoId: f.con === "permiso" ? f.contratoId || null : null,
    desde: f.desde || null,
    hasta: f.hasta || null,
    notas: f.notas.trim() || null,
  };
}

export default function FormularioVinculo({
  f,
  set,
  otras,
  permisos,
  ocupado,
  onVincular,
  onCancelar,
}: {
  f: Formulario;
  set: (v: Partial<Formulario>) => void;
  otras: Parte[];
  permisos: ReturnType<typeof usePermisosForestal>;
  ocupado: boolean;
  onVincular: () => void;
  onCancelar: () => void;
}) {
  const chip = (on: boolean) =>
    `inline-flex h-11 items-center rounded-xl border-2 px-3.5 text-sm font-semibold transition-colors ${
      on
        ? "border-[var(--accent)] bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]"
        : "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:border-[var(--rule-strong)]"
    }`;
  const activos = permisos.contratos.filter((c) => c.isActive !== false);
  return (
    <div className="space-y-3 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] p-3">
      <div role="group" aria-label="Con qué se vincula" className="flex flex-wrap gap-2">
        <button
          type="button"
          aria-pressed={f.con === "parte"}
          className={chip(f.con === "parte")}
          onClick={() => set({ con: "parte" })}
        >
          Otra parte del Directorio
        </button>
        <button
          type="button"
          aria-pressed={f.con === "permiso"}
          className={chip(f.con === "permiso")}
          onClick={() => set({ con: "permiso" })}
        >
          Un permiso
        </button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Rotulado etiqueta="Relación" className="min-w-0">
          {(id) => (
            <select
              id={id}
              className={I}
              value={f.relacion}
              onChange={(e) => set({ relacion: e.target.value as RelacionParte })}
            >
              {RELACIONES_PARTE.map((r) => (
                <option key={r} value={r}>
                  {ETIQUETA_RELACION[r]}…
                </option>
              ))}
            </select>
          )}
        </Rotulado>
        {f.con === "parte" ? (
          <Rotulado etiqueta="Parte" className="min-w-0">
            {(id) => (
              <select
                id={id}
                className={I}
                value={f.vinculadaParteId}
                onChange={(e) => set({ vinculadaParteId: e.target.value })}
              >
                <option value="">
                  {otras.length ? "Elige del Directorio…" : "El Directorio no tiene otras partes"}
                </option>
                {otras.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre} — {p.roles.map((r) => ROL_LABEL[r]).join(", ")}
                  </option>
                ))}
              </select>
            )}
          </Rotulado>
        ) : (
          <Rotulado etiqueta="Permiso" className="min-w-0">
            {(id) => (
              <select
                id={id}
                className={I}
                value={f.contratoId}
                disabled={permisos.cargando}
                onChange={(e) => set({ contratoId: e.target.value })}
              >
                <option value="">
                  {permisos.cargando
                    ? "Buscando los permisos…"
                    : activos.length
                      ? "Elige el permiso…"
                      : "No hay permisos cargados"}
                </option>
                {activos.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.codigo} · {c.titularNombre}
                  </option>
                ))}
              </select>
            )}
          </Rotulado>
        )}
        <Rotulado etiqueta="Desde (opcional)" className="min-w-0">
          {(id) => (
            <input
              id={id}
              type="date"
              className={I}
              value={f.desde}
              onChange={(e) => set({ desde: e.target.value })}
            />
          )}
        </Rotulado>
        <Rotulado etiqueta="Hasta (opcional)" className="min-w-0">
          {(id) => (
            <input
              id={id}
              type="date"
              className={I}
              value={f.hasta}
              onChange={(e) => set({ hasta: e.target.value })}
            />
          )}
        </Rotulado>
        <Rotulado etiqueta="Nota" className="min-w-0 sm:col-span-2">
          {(id) => (
            <input
              id={id}
              type="text"
              className={I}
              maxLength={300}
              value={f.notas}
              placeholder="Le compra la madera de su comunidad…"
              onChange={(e) => set({ notas: e.target.value })}
            />
          )}
        </Rotulado>
      </div>
      {permisos.error && f.con === "permiso" && (
        <p className="text-sm text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
          {permisos.error}
        </p>
      )}
      <div className="flex flex-wrap justify-end gap-2">
        <Btn variant="ghost" onClick={onCancelar}>
          Cancelar
        </Btn>
        <Btn variant="primary" disabled={ocupado} onClick={onVincular}>
          {ocupado ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <Link2 className="h-4 w-4" aria-hidden />
          )}
          Vincular
        </Btn>
      </div>
    </div>
  );
}
