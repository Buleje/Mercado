"use client";

/**
 * El catálogo de especies del aserradero — crear, renombrar, quitar (ADR-410).
 *
 * Pedido de Brandon (2026-09-10): *«en el cubicador que se pueda crear especie,
 * quitarlas, modificarlas, y que se guarde esa información»*. Hasta hoy la lista
 * era una constante del código, igual para todos: catorce especies de la Selva
 * Central. El que trabaja cumala blanca la tipeaba a mano cada vez —y cada quien
 * la escribía distinto, que es de dónde salen las dos filas «Tornillo» y
 * «TORNILLO» en el mismo libro.
 *
 * Dos cosas que la pantalla dice, porque son lo que sorprende:
 *
 *  1. Las de **fábrica no se borran**: se ocultan, y se pueden devolver. El
 *     código es el mismo para todos los tenants; lo que cambia es qué ofrece
 *     ESTA planta.
 *  2. Cambiar un nombre **no reescribe lo ya cubicado ni lo ya declarado**. Una
 *     pieza guarda el nombre con el que se cargó: cambiarlo hacia atrás sería
 *     editar en silencio lo que dice un acta.
 */

import { useState } from "react";
import { Check, Loader2, Pencil, Plus, RotateCcw, Trash2, X } from "@buleje/design-system/icons";
import AdminModal from "@/components/admin/shared/AdminModal";
import { Btn } from "./ctp-shared";
import { useEspeciesCatalogo } from "./hooks/use-especies-catalogo";
import { EspeciesDuplicadas, EspeciesQueFaltan, EspeciesSinCientifico } from "./ctp-especies-del-libro";
import { especiesDisponibles } from "@/lib/forestal/especies-catalogo";

const CAMPO =
  "h-11 w-full rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-2.5 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]";
const LABEL =
  "text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--text-tertiary)]";

export default function CtpEspeciesCatalogoModal({
  open,
  onClose,
  /** Se llama tras cada cambio para que quien montó refresque su lista. */
  onCambio,
}: {
  open: boolean;
  onClose: () => void;
  onCambio?: () => void;
}) {
  /* `conLibro`: el gestor —y sólo el gestor— pregunta además qué especies ya
     están escritas en el libro. Es lo que permite sembrar el catálogo con lo
     que la planta usa hace meses, en vez de pedirle que lo tipee de nuevo. */
  const cat = useEspeciesCatalogo({ conLibro: true });
  const [nombre, setNombre] = useState("");
  const [cientifico, setCientifico] = useState("");
  const [editando, setEditando] = useState<string | null>(null);
  const [borrador, setBorrador] = useState({ nombre: "", cientifico: "" });
  const [aviso, setAviso] = useState<string | null>(null);

  const lista = especiesDisponibles(cat.catalogo);
  /* Las que no tienen binomio, ordenadas por cuánto las usa el libro: primero la
     que aparece en 125 asientos, no la que se cargó por las dudas. */
  const sinCientifico = lista
    .filter((e) => !e.cientifico?.trim())
    .map((e) => ({
      clave: e.clave,
      nombre: e.nombre,
      usos: cat.delLibro.find((l) => l.clave === e.clave)?.usos ?? 0,
    }))
    .sort((a, b) => b.usos - a.usos || a.nombre.localeCompare(b.nombre, "es"));

  const tras = (mensaje: string | null) => {
    if (mensaje) {
      setAviso(mensaje);
      onCambio?.();
    }
    return mensaje;
  };

  const crear = async () => {
    const m = await cat.agregar(nombre.trim(), cientifico.trim() || undefined);
    if (tras(m)) {
      setNombre("");
      setCientifico("");
    }
  };

  const guardarEdicion = async (clave: string) => {
    const m = await cat.editar(clave, {
      nombre: borrador.nombre.trim(),
      cientifico: borrador.cientifico.trim() || null,
    });
    if (tras(m)) setEditando(null);
  };

  return (
    <AdminModal
      open={open}
      onClose={onClose}
      title="Especies del aserradero"
      description="Las que se ofrecen al cubicar y al cargar el libro. Se guardan para esta planta."
      variant="wide"
      footer={
        <div className="flex w-full items-center gap-2">
          <span className="mr-auto text-xs text-[var(--text-tertiary)]">
            {lista.length} especie{lista.length === 1 ? "" : "s"} en la lista
          </span>
          <Btn variant="primary" onClick={onClose}>
            Listo
          </Btn>
        </div>
      }
    >
      <div className="space-y-3 px-5 py-4 sm:px-6">
        {/* Alta */}
        <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <label className="block">
            <span className={LABEL}>Especie nueva</span>
            <input
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void crear();
              }}
              placeholder="Cumala blanca"
              className={`mt-1 ${CAMPO}`}
            />
          </label>
          <label className="block">
            <span className={LABEL}>Nombre científico (opcional)</span>
            <input
              value={cientifico}
              onChange={(e) => setCientifico(e.target.value)}
              placeholder="Virola sp."
              className={`mt-1 ${CAMPO} italic`}
            />
          </label>
          <button
            type="button"
            onClick={() => void crear()}
            disabled={cat.guardando || !nombre.trim()}
            className="inline-flex h-11 items-center justify-center gap-1.5 rounded-xl bg-[var(--accent)] px-4 text-sm font-semibold text-white transition hover:brightness-95 disabled:opacity-50"
          >
            {cat.guardando ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Plus className="h-4 w-4" aria-hidden />
            )}
            Agregar
          </button>
        </div>

        {/* Lo que el libro ya dice: sembrar lo que falta y unificar lo escrito
            de dos formas. Va ARRIBA de la lista porque es lo que hay que
            resolver; la lista de abajo es el estado, no la tarea. */}
        <EspeciesQueFaltan
          faltan={cat.faltan}
          guardando={cat.guardando}
          onSembrar={(especies) => void cat.sembrar(especies).then(tras)}
        />
        <EspeciesDuplicadas
          duplicadas={cat.duplicadas}
          guardando={cat.guardando}
          onUnificar={(clave, nombre) => void cat.unificar(clave, nombre).then(tras)}
        />
        <EspeciesSinCientifico
          faltantes={sinCientifico}
          guardando={cat.guardando}
          onGuardar={(clave, cientifico) => void cat.editar(clave, { cientifico }).then(tras)}
        />

        {cat.error && (
          <p className="rounded-xl border border-[var(--data-error-500)]/40 bg-[var(--data-error-500)]/10 px-3 py-2 text-sm text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
            {cat.error}
          </p>
        )}
        {aviso && !cat.error && (
          <p className="rounded-xl border border-[var(--data-success-500)]/40 bg-[var(--data-success-500)]/10 px-3 py-2 text-sm text-[var(--text-secondary)]">
            {aviso}
          </p>
        )}

        {/* La lista */}
        <div className="max-h-[40vh] overflow-y-auto rounded-xl border border-[var(--rule-base)]">
          {cat.cargando ? (
            <p className="flex items-center gap-2 px-3 py-6 text-sm text-[var(--text-tertiary)]">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Buscando el catálogo…
            </p>
          ) : (
            <ul className="divide-y divide-[var(--rule-soft)]">
              {lista.map((e) => (
                <li key={e.clave} className="flex flex-wrap items-center gap-2 px-3 py-2">
                  {editando === e.clave ? (
                    <>
                      <input
                        value={borrador.nombre}
                        onChange={(ev) => setBorrador((b) => ({ ...b, nombre: ev.target.value }))}
                        aria-label={`Nombre de ${e.nombre}`}
                        className={`${CAMPO} h-10 min-w-0 flex-1`}
                      />
                      <input
                        value={borrador.cientifico}
                        onChange={(ev) =>
                          setBorrador((b) => ({ ...b, cientifico: ev.target.value }))
                        }
                        placeholder="Nombre científico"
                        aria-label={`Nombre científico de ${e.nombre}`}
                        className={`${CAMPO} h-10 min-w-0 flex-1 italic`}
                      />
                      <button
                        type="button"
                        onClick={() => void guardarEdicion(e.clave)}
                        disabled={cat.guardando}
                        aria-label="Guardar"
                        className="grid h-9 w-9 place-items-center rounded-lg bg-[var(--accent)] text-white disabled:opacity-50"
                      >
                        <Check className="h-4 w-4" aria-hidden />
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditando(null)}
                        aria-label="Cancelar"
                        className="grid h-9 w-9 place-items-center rounded-lg text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)]"
                      >
                        <X className="h-4 w-4" aria-hidden />
                      </button>
                    </>
                  ) : (
                    <>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-bold text-[var(--text-primary)]">
                          {e.nombre}
                        </span>
                        {e.cientifico && (
                          <span className="block truncate text-xs italic text-[var(--text-tertiary)]">
                            {e.cientifico}
                          </span>
                        )}
                      </span>
                      {!e.deFabrica && (
                        <span className="shrink-0 rounded-full border border-[var(--rule-base)] px-2 py-0.5 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--text-tertiary)]">
                          propia
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          setEditando(e.clave);
                          setBorrador({ nombre: e.nombre, cientifico: e.cientifico ?? "" });
                        }}
                        aria-label={`Modificar ${e.nombre}`}
                        title="Cambiar el nombre o el científico"
                        className="grid h-9 w-9 place-items-center rounded-lg text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]"
                      >
                        <Pencil className="h-4 w-4" aria-hidden />
                      </button>
                      <button
                        type="button"
                        onClick={() => void cat.quitar(e.clave).then(tras)}
                        disabled={cat.guardando}
                        aria-label={`Quitar ${e.nombre}`}
                        title={
                          e.deFabrica
                            ? "Dejar de ofrecerla en esta planta (se puede devolver)"
                            : "Sacarla del catálogo"
                        }
                        className="grid h-9 w-9 place-items-center rounded-lg text-[var(--text-tertiary)] hover:bg-[var(--data-error-500)]/10 hover:text-[var(--data-error-500)] disabled:opacity-50"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden />
                      </button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Las de fábrica que esta planta dejó de usar */}
        {cat.ocultas.length > 0 && (
          <details className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] px-3 py-2">
            <summary className="cursor-pointer list-none text-sm font-bold text-[var(--text-primary)]">
              Ocultas ({cat.ocultas.length}) — se pueden devolver
            </summary>
            <ul className="mt-2 flex flex-wrap gap-2">
              {cat.ocultas.map((e) => (
                <li key={e.clave}>
                  <button
                    type="button"
                    onClick={() => void cat.restaurar(e.clave).then(tras)}
                    disabled={cat.guardando}
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--rule-base)] px-2.5 text-sm text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--text-primary)] disabled:opacity-50"
                  >
                    <RotateCcw className="h-3.5 w-3.5" aria-hidden /> {e.nombre}
                  </button>
                </li>
              ))}
            </ul>
          </details>
        )}

        <p className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] px-3 py-2 text-[length:var(--ts-2xs)] leading-snug text-[var(--text-secondary)]">
          Esta lista es de <b>esta planta</b> y se guarda para todos sus usuarios. Las que vienen de
          fábrica no se borran: se dejan de ofrecer y se pueden devolver cuando haga falta. Cambiar
          un nombre <b>no reescribe lo ya cubicado ni lo ya declarado en el libro</b> — cada pieza
          conserva el nombre con el que se cargó.
        </p>
      </div>
    </AdminModal>
  );
}
