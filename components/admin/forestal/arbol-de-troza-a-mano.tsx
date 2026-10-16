"use client";

/**
 * «Árbol (opcional)» de la troza anotada a mano (Brandon 15-10, «Árbol de
 * origen en la troza»): de qué árbol del censo salió, para que la salida pueda
 * responder «¿de qué árbol?» (`.claude/rules/forestal-serfor.md`).
 *
 * Un botón con el árbol elegido (o «Sin árbol», que sigue valiendo) que abre
 * una lista buscable por código: los árboles de la especie de la fila y, si la
 * guía tiene permiso, sólo los de ese permiso; primero los que tienen tala. El
 * censo se lee al abrirla por primera vez. Lo que el servidor rechazaría se
 * dice acá (`useArbolesAMano.revisar`, la misma regla): un árbol de un permiso
 * en una guía sin permiso ofrece «Usar el permiso …».
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Search, TreePine } from "@buleje/design-system/icons";
import { claveEspecie } from "@/lib/forestal/loth-constants";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import {
  arbolesParaLaFila,
  restanteDeLaTala,
  type ArbolParaTroza,
  type CodigoArbolAMano,
} from "@/lib/forestal/loth-arbol-a-mano";
import type { DespachoGuiaLoth } from "./hooks/use-despacho-guia-loth";
import { Btn, I } from "./ctp-shared";

/** Lo corto de cada rechazo, para la pastilla de la fila (el motivo entero va en su `title` y en «Falta»). */
export const ETIQUETA_DEL_ARBOL: Record<CodigoArbolAMano, string> = {
  ARBOL_NO_EXISTE: "Árbol fuera del censo",
  GUIA_SIN_PERMISO_CON_ARBOL: "Árbol de un permiso",
  TALA_PLAN_DISTINTO_AL_CENSO: "Árbol de otro permiso",
  TALA_ARBOL_EN_VARIOS_PLANES: "Árbol en varios permisos",
  TALA_ESPECIE_DISTINTA_AL_CENSO: "Otra especie que el árbol",
};

const OPCION =
  "flex min-h-12 w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-left text-sm hover:bg-[var(--surface-sunken)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]";

/** La tala del árbol en una línea: «tala 1,200 m³ · quedan 0,746» o «sin tala en el libro». */
function textoDeTala(a: ArbolParaTroza): string {
  const queda = restanteDeLaTala(a);
  return queda == null
    ? "sin tala en el libro"
    : `tala ${fmtM3(a.talaM3 ?? 0)} m³ · quedan ${fmtM3(Math.max(0, queda))}`;
}

export function ArbolDeTrozaAMano({
  g,
  arbolId,
  onChange,
  especie,
  onEspecie,
  nombres,
}: {
  g: DespachoGuiaLoth;
  arbolId: string | null;
  onChange: (id: string | null) => void;
  /** La especie de la fila: filtra la lista y se juzga contra la del censo. */
  especie: string;
  /** Pone la especie del árbol en la fila cuando está vacía (con la grafía del catálogo). */
  onEspecie: (nombre: string) => void;
  /** Los nombres que ofrece el campo Especie (del permiso + catálogo). */
  nombres: readonly string[];
}) {
  const a = g.arbolesAMano;
  const [abierto, setAbierto] = useState(false);
  const [q, setQ] = useState("");
  /** El N° escrito a mano que se perdería con el permiso del árbol: se confirma antes. */
  const [nPerdido, setNPerdido] = useState<string | null>(null);
  const refBoton = useRef<HTMLButtonElement>(null);
  const refBuscar = useRef<HTMLInputElement>(null);
  const elegido = arbolId ? (a.porId.get(arbolId) ?? null) : null;
  const revision = a.revisar(arbolId, especie);
  const lista = useMemo(
    () => arbolesParaLaFila(a.arboles ?? [], { especie, planId: g.planId, q }),
    [a.arboles, especie, g.planId, q],
  );
  const nombreDelPlan = (id: string) => {
    const p = g.prep?.planes.find((x) => x.id === id);
    return p
      ? [p.planNumber || p.planType, p.titularName].filter(Boolean).join(" · ") || "su permiso"
      : "otro permiso";
  };

  function cerrar() {
    setAbierto(false);
    setQ("");
    refBoton.current?.focus();
  }
  function elegir(arbol: ArbolParaTroza | null) {
    onChange(arbol?.id ?? null);
    if (arbol && !especie.trim()) {
      const nombre = nombres.find((n) => claveEspecie(n) === claveEspecie(arbol.especie));
      if (nombre) onEspecie(nombre);
    }
    cerrar();
  }

  /* Escape cierra la lista y NO el modal: `preventDefault` en captura, como
     `ActionMenu` (el `DismissableLayer` de Radix sólo cierra si no se previno). */
  useEffect(() => {
    if (!abierto) return;
    refBuscar.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      setAbierto(false);
      setQ("");
      refBoton.current?.focus();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [abierto]);

  /* El permiso del árbol para una guía que va sin él (o con otro): cambiarlo
     vuelve a sembrar lo del permiso (lo demás escrito se queda) y suelta las
     trozas del libro elegidas. El N° escrito a mano sólo se pierde si el
     talonario es de otro titular: eso se confirma antes. */
  const conOtroPermiso =
    elegido &&
    revision &&
    !revision.ok &&
    (revision.code === "GUIA_SIN_PERMISO_CON_ARBOL" ||
      revision.code === "TALA_PLAN_DISTINTO_AL_CENSO");

  return (
    <div className="grid gap-1" data-qa="arbol-a-mano">
      <span className="text-xs font-semibold text-[var(--text-secondary)]">Árbol (opcional)</span>
      <button
        ref={refBoton}
        type="button"
        aria-expanded={abierto}
        aria-controls="arbol-a-mano-lista"
        onClick={() => {
          if (abierto) return cerrar();
          setAbierto(true);
          void a.cargar();
        }}
        className={`${I} flex h-12 items-center gap-2 text-left ${revision && !revision.ok ? "border-[var(--data-error-500)]" : ""}`}
      >
        <TreePine className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]" aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate">
          {elegido ? (
            <>
              <span className="font-mono font-bold">{elegido.treeCode}</span>
              <span className="text-xs text-[var(--text-secondary)]">
                {" "}
                · {textoDeTala(elegido)}
              </span>
            </>
          ) : (
            <span className="text-[var(--text-secondary)]">Sin árbol</span>
          )}
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 transition-transform ${abierto ? "rotate-180" : ""}`}
          aria-hidden="true"
        />
      </button>

      {abierto && (
        <div
          id="arbol-a-mano-lista"
          className="grid gap-2 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-2 shadow-[var(--shadow-md)]"
        >
          <label className="flex h-12 items-center gap-2 rounded-xl border-[1.5px] border-[var(--rule-base)] px-3 focus-within:border-[var(--accent)]">
            <Search className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]" aria-hidden="true" />
            <span className="sr-only">Buscar árbol por código</span>
            <input
              ref={refBuscar}
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && lista.length === 1) {
                  e.preventDefault();
                  elegir(lista[0]);
                }
              }}
              placeholder="Busca por código (001-TOR)"
              autoComplete="off"
              className="h-full min-w-0 flex-1 bg-transparent text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-tertiary)]"
            />
          </label>
          <ul className="grid max-h-64 gap-0.5 overflow-y-auto" aria-label="Árboles del censo">
            <li>
              <button
                type="button"
                onClick={() => elegir(null)}
                aria-pressed={!arbolId}
                className={OPCION}
              >
                <span className="font-semibold">Sin árbol</span>
                <span className="text-xs text-[var(--text-tertiary)]">
                  la troza va sólo con su número
                </span>
              </button>
            </li>
            {lista.map((arbol) => (
              <li key={arbol.id}>
                <button
                  type="button"
                  onClick={() => elegir(arbol)}
                  aria-pressed={arbol.id === arbolId}
                  className={`${OPCION} ${arbol.id === arbolId ? "bg-[var(--accent-muted)]" : ""}`}
                >
                  <span className="min-w-0">
                    <span className="font-mono font-bold">{arbol.treeCode}</span>
                    <span className="text-[var(--text-secondary)]"> · {arbol.especie}</span>
                    {!g.planId && (
                      <span className="block truncate text-xs text-[var(--text-tertiary)]">
                        {nombreDelPlan(arbol.planId)}
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 text-xs tabular-nums text-[var(--text-secondary)]">
                    {textoDeTala(arbol)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {a.cargando && (
            <p className="px-3 text-sm text-[var(--text-secondary)]">Leyendo el censo…</p>
          )}
          {a.error && (
            <p
              role="alert"
              className="flex flex-wrap items-center gap-2 px-3 text-sm font-semibold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]"
            >
              {a.error}
              <Btn onClick={() => void a.cargar(true)}>Reintentar</Btn>
            </p>
          )}
          {a.arboles && !a.cargando && lista.length === 0 && (
            <p className="px-3 text-sm text-[var(--text-secondary)]">
              No hay árboles{especie.trim() ? ` de ${especie.trim()}` : ""} en el censo
              {g.planId ? " de este permiso" : ""}
              {q.trim() ? ` con «${q.trim()}»` : ""}.
            </p>
          )}
        </div>
      )}

      {revision && !revision.ok && (
        <p
          role="alert"
          className="text-sm font-semibold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]"
        >
          {revision.mensaje}
        </p>
      )}
      {conOtroPermiso &&
        (g.elegidas.size > 0 ? (
          <p className="text-xs text-[var(--text-secondary)]">
            Esta guía ya lleva trozas del libro
            {g.planId ? ` del permiso ${nombreDelPlan(g.planId)}` : " sin permiso"}: anota esta
            troza sin árbol o despáchala en otra guía.
          </p>
        ) : nPerdido ? (
          <div role="alert" className="grid gap-2 text-sm text-[var(--text-primary)]">
            <span>
              El N° <b className="font-mono">{nPerdido}</b> que escribiste es del talonario de otro
              titular: con el permiso {nombreDelPlan(elegido.planId)} pasa al que sigue. Lo demás
              que escribiste se queda.
            </span>
            <span className="flex flex-wrap gap-2">
              <Btn
                variant="primary"
                onClick={() => {
                  setNPerdido(null);
                  g.setPlanId(elegido.planId);
                }}
              >
                Cambiar el permiso
              </Btn>
              <Btn onClick={() => setNPerdido(null)}>Cancelar</Btn>
            </span>
          </div>
        ) : (
          <Btn
            className="justify-self-start"
            onClick={() => {
              const n = g.numeroQueSePierde(elegido.planId);
              if (n) setNPerdido(n);
              else g.setPlanId(elegido.planId);
            }}
          >
            Usar el permiso {nombreDelPlan(elegido.planId)}
          </Btn>
        ))}
    </div>
  );
}
