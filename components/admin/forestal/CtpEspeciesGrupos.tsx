"use client";

/**
 * Los grupos de especies de la planta (ADR-430): crearlos, renombrarlos,
 * borrarlos y decir qué especies van en cada uno.
 *
 * Pedido de Brandon (22-09): «por grupo: grupos que yo creo con sus especies y
 * su precio; lo demás al general». Los grupos son DE LA PLANTA —no de cada
 * cliente— para no rearmarlos cliente por cliente, y **cada especie va en un
 * solo grupo**: sumar a «Duras» una especie que estaba en «Blandas» la MUDA, y
 * se dice. Un cambio de grupo es un cambio de precio para todos los clientes
 * que tienen precio por grupo.
 *
 * Se edita en borrador y se guarda todo junto («Guardar grupos»): el servidor
 * reemplaza la lista entera, así que guardar a cada clic mandaría listas a
 * medias.
 */

import { useMemo, useState } from "react";
import { Loader2, Plus, Save, Trash2, X } from "@buleje/design-system/icons";
import { useConfirm } from "@/components/admin/shared/ConfirmDialog";
import {
  borrarGrupo,
  crearGrupo,
  gruposAInput,
  gruposCambiaron,
  motivoDeGrupos,
  moverEspecie,
  quitarEspecie,
  renombrarGrupo,
} from "@/lib/forestal/grupos-especies-edicion";
import type { GrupoEspecies, GruposEspeciesInput } from "@/lib/forestal/precio-cliente";
import { Btn, I } from "./ctp-shared";

export interface EspecieDelCatalogo {
  clave: string;
  nombre: string;
}

export default function CtpEspeciesGrupos({
  grupos,
  especies,
  guardando,
  error,
  onGuardar,
}: {
  /** Los guardados (del catálogo). */
  grupos: GrupoEspecies[];
  /** Las especies que ofrece la planta. */
  especies: EspecieDelCatalogo[];
  guardando: boolean;
  error: string | null;
  /** Devuelve el aviso de éxito, o `null` si falló (el motivo llega por `error`). */
  onGuardar: (input: GruposEspeciesInput) => Promise<string | null>;
}) {
  const { confirm } = useConfirm();
  const [borrador, setBorrador] = useState<GrupoEspecies[]>(grupos);
  const [base, setBase] = useState<GrupoEspecies[]>(grupos);
  const [nuevo, setNuevo] = useState("");
  const [aviso, setAviso] = useState<string | null>(null);
  const [problema, setProblema] = useState<string | null>(null);
  /* El `error` del catálogo puede venir de otra escritura (agregar una
     especie): acá se muestra sólo después de intentar guardar los grupos. */
  const [intentado, setIntentado] = useState(false);

  /* Llegó otra lista del servidor (la primera carga, o lo recién guardado): se
     toma si no hay nada sin guardar, o si es justo lo que se guardó. Ajuste en
     el render y no en un efecto: así no hay un cuadro con la lista vieja. */
  if (grupos !== base) {
    if (!gruposCambiaron(borrador, base) || !gruposCambiaron(borrador, grupos)) setBorrador(grupos);
    setBase(grupos);
  }

  const nombreDe = useMemo(() => new Map(especies.map((e) => [e.clave, e.nombre])), [especies]);
  const hayCambios = gruposCambiaron(borrador, grupos);
  const sinGrupo = especies.filter((e) => !borrador.some((g) => g.claves.includes(e.clave))).length;

  function crear() {
    const r = crearGrupo(borrador, nuevo);
    setProblema(r.error);
    if (r.error) return;
    setBorrador(r.grupos);
    setNuevo("");
    setAviso(null);
  }

  function sumar(grupo: GrupoEspecies, clave: string) {
    const nombre = nombreDe.get(clave) ?? clave;
    const r = moverEspecie(borrador, grupo.id, nombre);
    setBorrador(r.grupos);
    setAviso(
      r.desde
        ? `«${nombre}» salió de «${r.desde.nombre}» y pasó a «${grupo.nombre}»: una especie va en un solo grupo.`
        : null,
    );
  }

  async function borrar(g: GrupoEspecies) {
    const ok = await confirm({
      title: `¿Borrar el grupo «${g.nombre || "sin nombre"}»?`,
      description:
        "Sus especies quedan sin grupo. Los clientes que tenían precio para este grupo pasan a su precio general (o a la tarifa de la planta). Se aplica al guardar.",
      intent: "danger",
      confirmLabel: "Sí, borrar",
    });
    if (ok) setBorrador((gs) => borrarGrupo(gs, g.id));
  }

  async function guardar() {
    const m = motivoDeGrupos(borrador);
    setProblema(m);
    if (m) return;
    setIntentado(true);
    const r = await onGuardar(gruposAInput(borrador, (k) => nombreDe.get(k)));
    if (r) setAviso(r);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <label className="min-w-0 grow basis-[14rem]">
          <span className="mb-1 block text-sm font-medium text-[var(--text-primary)]">
            Grupo nuevo
          </span>
          <input
            className={I}
            value={nuevo}
            placeholder="Duras, Blandas, Semiduras…"
            onChange={(e) => setNuevo(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                crear();
              }
            }}
          />
        </label>
        <Btn onClick={crear} disabled={!nuevo.trim()}>
          <Plus className="h-4 w-4" aria-hidden />
          Crear grupo
        </Btn>
      </div>

      {(problema || (intentado && error)) && (
        <p
          role="alert"
          className="rounded-xl border border-[var(--data-error-500)]/40 bg-[var(--data-error-500)]/10 px-3 py-2 text-sm text-[var(--data-error-700)] dark:text-[var(--data-error-500)]"
        >
          {problema ?? error}
        </p>
      )}
      {aviso && !problema && !(intentado && error) && (
        <p
          role="status"
          className="rounded-xl border border-[var(--data-info-500)]/40 bg-[var(--data-info-500)]/10 px-3 py-2 text-sm text-[var(--text-primary)]"
        >
          {aviso}
        </p>
      )}

      {borrador.length === 0 ? (
        <p className="rounded-xl border border-dashed border-[var(--rule-base)] px-3 py-4 text-center text-sm text-[var(--text-secondary)]">
          Todavía no hay grupos. Crea uno —por ejemplo «Duras»— y súmale sus especies.
        </p>
      ) : (
        <ul className="space-y-2">
          {borrador.map((g) => {
            const fuera = especies.filter((e) => !g.claves.includes(e.clave));
            return (
              <li
                key={g.id}
                className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-3"
              >
                <div className="flex items-center gap-2">
                  <input
                    className={`${I} font-semibold`}
                    value={g.nombre}
                    aria-label={`Nombre del grupo ${g.nombre}`}
                    onChange={(e) => setBorrador((gs) => renombrarGrupo(gs, g.id, e.target.value))}
                  />
                  <button
                    type="button"
                    onClick={() => void borrar(g)}
                    aria-label={`Borrar el grupo ${g.nombre}`}
                    title="Borrar el grupo"
                    className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-[var(--text-tertiary)] transition-colors hover:bg-[var(--data-error-500)]/10 hover:text-[var(--data-error-700)] dark:hover:text-[var(--data-error-500)]"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </button>
                </div>
                <ul className="mt-2 flex flex-wrap gap-1.5" aria-label={`Especies de ${g.nombre}`}>
                  {g.claves.length === 0 && (
                    <li className="text-sm text-[var(--text-tertiary)]">Sin especies todavía.</li>
                  )}
                  {g.claves.map((k) => (
                    <li
                      key={k}
                      className="inline-flex h-9 items-center gap-1 rounded-lg bg-[var(--surface-sunken)] pl-2.5 pr-1 text-sm font-semibold text-[var(--text-primary)]"
                    >
                      {nombreDe.get(k) ?? k}
                      <button
                        type="button"
                        onClick={() => setBorrador((gs) => quitarEspecie(gs, g.id, k))}
                        aria-label={`Sacar ${nombreDe.get(k) ?? k} de ${g.nombre}`}
                        className="grid h-7 w-7 place-items-center rounded-md text-[var(--text-tertiary)] hover:bg-[var(--surface-raised)] hover:text-[var(--text-primary)]"
                      >
                        <X className="h-3.5 w-3.5" aria-hidden />
                      </button>
                    </li>
                  ))}
                </ul>
                {fuera.length > 0 && (
                  <select
                    className={`${I} mt-2`}
                    value=""
                    aria-label={`Sumar una especie a ${g.nombre}`}
                    onChange={(e) => {
                      if (e.target.value) sumar(g, e.target.value);
                    }}
                  >
                    <option value="">Sumar especie…</option>
                    {fuera.map((e) => {
                      const otro = borrador.find((x) => x.claves.includes(e.clave));
                      return (
                        <option key={e.clave} value={e.clave}>
                          {otro ? `${e.nombre} (está en ${otro.nombre || "otro grupo"})` : e.nombre}
                        </option>
                      );
                    })}
                  </select>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-auto text-sm text-[var(--text-secondary)]">
          {sinGrupo === 0
            ? "Todas las especies tienen grupo."
            : `${sinGrupo} especie${sinGrupo === 1 ? "" : "s"} sin grupo: van al precio general.`}
        </span>
        {hayCambios && (
          <Btn
            variant="ghost"
            onClick={() => {
              setBorrador(grupos);
              setAviso(null);
              setProblema(null);
            }}
          >
            Descartar
          </Btn>
        )}
        <Btn variant="primary" disabled={!hayCambios || guardando} onClick={() => void guardar()}>
          {guardando ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <Save className="h-4 w-4" aria-hidden />
          )}
          Guardar grupos
        </Btn>
      </div>
    </div>
  );
}
