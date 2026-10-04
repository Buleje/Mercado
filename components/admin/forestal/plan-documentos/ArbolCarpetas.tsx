"use client";

/**
 * Las carpetas del plan, a la izquierda (arriba en el celular): cada una con
 * cuántos de sus documentos esperados ya están y un punto con su estado.
 * Abajo, «Nueva carpeta»: se nombra y se elige si es sólo de este plan o de
 * todos los que vengan.
 */

import { useId, useState } from "react";
import { Folder, FolderOpen, FolderPlus, Loader2 } from "@buleje/design-system/icons";
import { BOTON_PRIMARIO, BOTON_SUAVE, CAMPO_INPUT } from "@/components/admin/shared/campos-personalizados-ui";
import { ASPECTO_ESTADO } from "./estados";
import { archivosDeCarpeta, estadoDeCarpeta, type CarpetaVista } from "./modelo";

export default function ArbolCarpetas({
  carpetas,
  elegida,
  onElegir,
  onCrear,
  puedeCrear,
}: {
  carpetas: readonly CarpetaVista[];
  elegida: string | null;
  onElegir: (clave: string) => void;
  /** Devuelve el motivo si no se pudo, o null. */
  onCrear: (nombre: string, paraTodosLosPlanes: boolean) => Promise<string | null>;
  puedeCrear: boolean;
}) {
  const id = useId();
  const [alta, setAlta] = useState(false);
  const [nombre, setNombre] = useState("");
  const [paraTodos, setParaTodos] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  async function crear() {
    const limpio = nombre.trim();
    if (limpio.length < 2) {
      setAviso("Ponle un nombre de al menos dos letras.");
      return;
    }
    if (carpetas.some((c) => c.nombre.trim().toLowerCase() === limpio.toLowerCase())) {
      setAviso(`Ya hay una carpeta «${limpio}».`);
      return;
    }
    setGuardando(true);
    const error = await onCrear(limpio, paraTodos);
    setGuardando(false);
    if (error) {
      setAviso(error);
      return;
    }
    setAlta(false);
    setNombre("");
    setParaTodos(false);
    setAviso(null);
  }

  return (
    <nav aria-label="Carpetas del plan" className="min-w-0 space-y-1">
      <ul className="space-y-1">
        {carpetas.map((c) => {
          const activa = c.clave === elegida;
          const estado = estadoDeCarpeta(c);
          const esperados = c.casilleros.length;
          const cargados = c.casilleros.filter((k) => k.estado !== "falta").length;
          const archivos = archivosDeCarpeta(c);
          const Glifo = activa ? FolderOpen : Folder;
          return (
            <li key={c.clave}>
              <button
                type="button"
                onClick={() => onElegir(c.clave)}
                aria-current={activa ? "true" : undefined}
                title={c.nombre}
                className={`flex min-h-11 w-full items-center gap-2 rounded-xl px-2.5 py-1.5 text-left text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40 ${
                  activa
                    ? "bg-[var(--accent)]/12 text-[var(--text-primary)]"
                    : "text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]"
                }`}
              >
                <Glifo className={`h-4 w-4 shrink-0 ${activa ? "text-[var(--accent-ink)]" : "text-[var(--text-tertiary)]"}`} aria-hidden="true" />
                {/* Dos renglones antes de cortar: «Jefe / representante (DNI,
                    actas, poderes)» cortado en «Jefe / represent…» no dice qué hay. */}
                <span className="line-clamp-2 min-w-0 flex-1 break-words leading-snug">{c.nombre}</span>
                {estado && (
                  <span className={`h-2 w-2 shrink-0 rounded-full ${ASPECTO_ESTADO[estado].punto}`} aria-hidden="true" />
                )}
                <span className="shrink-0 font-mono text-xs tabular-nums text-[var(--text-tertiary)]">
                  {esperados > 0 ? `${cargados}/${esperados}` : archivos > 0 ? String(archivos) : ""}
                </span>
                <span className="sr-only">
                  {esperados > 0 ? `, ${cargados} de ${esperados} documentos` : archivos > 0 ? `, ${archivos} archivos` : ", vacía"}
                  {estado ? `, ${ASPECTO_ESTADO[estado].label.toLowerCase()}` : ""}
                  {c.pendiente ? ", se crea al guardar" : ""}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {puedeCrear && !alta && (
        <button type="button" className={`${BOTON_SUAVE} h-10 w-full justify-center`} onClick={() => setAlta(true)}>
          <FolderPlus className="h-4 w-4" aria-hidden="true" />
          Nueva carpeta
        </button>
      )}

      {alta && (
        <div className="space-y-2 rounded-xl border-[1.5px] border-[var(--accent)] bg-[var(--surface-raised)] p-2.5">
          <label htmlFor={`${id}-nombre`} className="sr-only">
            Nombre de la carpeta
          </label>
          <input
            id={`${id}-nombre`}
            className={CAMPO_INPUT}
            value={nombre}
            placeholder="Contratos, planos, actas…"
            maxLength={80}
            // eslint-disable-next-line jsx-a11y/no-autofocus -- se abre a pedido con «Nueva carpeta»: el foco va donde se escribe
            autoFocus
            onChange={(e) => setNombre(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void crear();
              }
            }}
          />
          <fieldset className="space-y-1">
            <legend className="sr-only">Dónde aparece</legend>
            {[
              { v: false, t: "Sólo en este plan" },
              { v: true, t: "En todos los planes" },
            ].map((o) => (
              <label key={String(o.v)} className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-[var(--text-primary)]">
                <input
                  type="radio"
                  name={`${id}-alcance`}
                  checked={paraTodos === o.v}
                  onChange={() => setParaTodos(o.v)}
                  className="h-4 w-4 accent-[var(--accent)]"
                />
                {o.t}
              </label>
            ))}
          </fieldset>
          {aviso && (
            <p role="alert" className="text-xs font-semibold text-[var(--data-error-ink)]">
              {aviso}
            </p>
          )}
          <div className="flex justify-end gap-1.5">
            <button
              type="button"
              className={BOTON_SUAVE}
              onClick={() => {
                setAlta(false);
                setAviso(null);
              }}
            >
              Cancelar
            </button>
            <button type="button" className={BOTON_PRIMARIO} disabled={guardando} onClick={() => void crear()}>
              {guardando && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
              Crear
            </button>
          </div>
        </div>
      )}
    </nav>
  );
}
