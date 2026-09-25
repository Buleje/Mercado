"use client";

/**
 * Lo que el libro ya tiene escrito, dentro del gestor del catálogo (ADR-410).
 *
 * Dos bloques que responden a dos preguntas que nadie se hace a tiempo:
 *
 *  1. **«¿Por qué tengo que tipear Cachimbo si mi libro lo dice hace meses?»**
 *     El catálogo arranca con las catorce de fábrica y la planta lleva media
 *     temporada cargando. Sembrar es traer lo que ya está escrito, no inventar.
 *
 *  2. **«¿Por qué aparecen dos Tornillo?»** Porque uno se cargó «Tornillo» y el
 *     otro «TORNILLO», y para el libro son dos maderas. Acá se ven juntas, con
 *     cuántas filas usa cada forma, y se puede dejar UNA.
 *
 * Unificar **reescribe filas del libro**, que es un acta que se declara ante
 * SERFOR: por eso pide confirmación explícita, dice exactamente qué va a
 * cambiar y no toca volúmenes, fechas ni atribuciones — sólo cómo se escribe
 * un nombre.
 */

import { useState } from "react";
import { AlertTriangle, Check, Combine, Loader2, TreePine } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import type { EspecieEnElLibro } from "@/lib/forestal/especies-catalogo";

const CAJA =
  "rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] px-3 py-2.5";
const TITULO = "text-sm font-bold text-[var(--text-primary)]";

const usos = (n: number) => `${n} fila${n === 1 ? "" : "s"}`;

/** Las que el libro usa y el catálogo no ofrece — sembrar de un toque. */
export function EspeciesQueFaltan({
  faltan,
  guardando,
  onSembrar,
}: {
  faltan: readonly EspecieEnElLibro[];
  guardando: boolean;
  onSembrar: (especies: { nombre: string; cientifico?: string | null }[]) => void;
}) {
  if (faltan.length === 0) return null;
  return (
    <div className={CAJA}>
      <div className="flex flex-wrap items-center gap-2">
        <TreePine className="h-4 w-4 shrink-0 text-[var(--accent)]" aria-hidden />
        <span className="mr-auto flex min-w-0 items-center gap-1.5">
          <p className={TITULO}>
            Tu libro ya usa {faltan.length} especie{faltan.length === 1 ? "" : "s"} que no está
            {faltan.length === 1 ? "" : "n"} en la lista
          </p>
          <InfoTip
            title="Especies que faltan en el catálogo"
            what="Salen de tus ingresos, trozas, asientos y lotes. El número es en cuántas filas del libro aparece cada una."
            affects="Agregarlas al catálogo no cambia nada de lo ya cargado: sólo las ofrece de acá en adelante."
          />
        </span>
        <button
          type="button"
          onClick={() =>
            onSembrar(faltan.map((e) => ({ nombre: e.nombre, cientifico: e.cientifico })))
          }
          disabled={guardando}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3 text-sm font-semibold text-white transition hover:brightness-95 disabled:opacity-50"
        >
          {guardando ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <TreePine className="h-4 w-4" aria-hidden />
          )}
          Agregar las {faltan.length}
        </button>
      </div>
      <ul className="mt-2 flex flex-wrap gap-1.5">
        {faltan.map((e) => (
          <li key={e.clave}>
            <button
              type="button"
              onClick={() => onSembrar([{ nombre: e.nombre, cientifico: e.cientifico }])}
              disabled={guardando}
              title={`Agregar sólo «${e.nombre}»${e.cientifico ? ` (${e.cientifico})` : ""} — la usan ${usos(e.usos)} del libro`}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-2.5 text-sm text-[var(--text-secondary)] transition hover:border-[var(--accent)] hover:text-[var(--text-primary)] disabled:opacity-50"
            >
              {e.nombre}
              <span className="text-[length:var(--ts-2xs)] font-bold text-[var(--text-tertiary)]">
                {e.usos}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Las escritas de más de una forma: se ve el reparto y se deja una sola. */
export function EspeciesDuplicadas({
  duplicadas,
  guardando,
  onUnificar,
}: {
  duplicadas: readonly EspecieEnElLibro[];
  guardando: boolean;
  onUnificar: (clave: string, nombre: string) => void;
}) {
  /** Qué grafía está esperando el sí. `null` = ninguna: unificar no se dispara
   *  de un solo clic, porque toca filas del libro. */
  const [confirmar, setConfirmar] = useState<{ clave: string; nombre: string } | null>(null);

  if (duplicadas.length === 0) return null;

  return (
    <div className={`${CAJA} border-[var(--data-warning-500)]/40`}>
      <div className="flex items-center gap-2">
        <AlertTriangle
          className="h-4 w-4 shrink-0 text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]"
          aria-hidden
        />
        <p className={TITULO}>
          {duplicadas.length} especie{duplicadas.length === 1 ? " está escrita" : "s están escritas"}{" "}
          de más de una forma
        </p>
        <InfoTip
          title="Especies escritas de más de una forma"
          what="Para el libro, «Tornillo» y «TORNILLO» son dos maderas distintas: se separan en los totales por especie y en el saldo por permiso."
          affects="Elegir una forma reescribe esas filas —sólo el texto del nombre, nunca volúmenes, fechas ni de qué guía salió— y queda auditado."
        />
      </div>

      <ul className="mt-2 space-y-2">
        {duplicadas.map((e) => (
          <li key={e.clave} className="rounded-lg bg-[var(--surface-raised)] px-2.5 py-2">
            <div className="flex flex-wrap items-center gap-1.5">
              {e.grafias.map((g) => {
                const esperando = confirmar?.clave === e.clave && confirmar.nombre === g.texto;
                return (
                  <button
                    key={g.texto}
                    type="button"
                    onClick={() =>
                      esperando
                        ? onUnificar(e.clave, g.texto)
                        : setConfirmar({ clave: e.clave, nombre: g.texto })
                    }
                    disabled={guardando}
                    title={
                      esperando
                        ? `Confirmar: el libro entero va a decir «${g.texto}»`
                        : `Dejar «${g.texto}» en todo el libro`
                    }
                    className={`inline-flex h-9 items-center gap-1.5 rounded-lg border px-2.5 text-sm transition disabled:opacity-50 ${
                      esperando
                        ? "border-[var(--data-warning-500)] bg-[var(--data-warning-500)]/12 font-bold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]"
                        : "border-[var(--rule-base)] text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--text-primary)]"
                    }`}
                  >
                    {esperando ? (
                      <>
                        {guardando ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                        ) : (
                          <Combine className="h-3.5 w-3.5" aria-hidden />
                        )}
                        Dejar «{g.texto}» en todo el libro
                      </>
                    ) : (
                      <>
                        <span className="font-bold text-[var(--text-primary)]">{g.texto}</span>
                        <span className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
                          {usos(g.usos)}
                        </span>
                      </>
                    )}
                  </button>
                );
              })}
              {confirmar?.clave === e.clave && (
                <button
                  type="button"
                  onClick={() => setConfirmar(null)}
                  className="h-9 rounded-lg px-2 text-sm text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
                >
                  Cancelar
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Las que están en la lista **sin nombre científico**.
 *
 * El binomio es una columna del LO-CTP y de la GTF: una especie sin él deja el
 * casillero vacío en cada asiento que la nombre. Las de fábrica lo traen del
 * código (datos de SERFOR); las que agregó la planta lo tienen sólo si alguien
 * lo escribió — y nadie vuelve a una pantalla de catálogo a completarlo.
 *
 * Por eso se piden acá, juntas, con el uso de cada una al lado: primero la que
 * aparece en 125 asientos, no la que se cargó por las dudas.
 */
export function EspeciesSinCientifico({
  faltantes,
  guardando,
  onGuardar,
}: {
  /** Las de la lista sin binomio, con cuántas filas del libro las nombran. */
  faltantes: readonly { clave: string; nombre: string; usos: number }[];
  guardando: boolean;
  onGuardar: (clave: string, cientifico: string) => void;
}) {
  const [borradores, setBorradores] = useState<Record<string, string>>({});
  if (faltantes.length === 0) return null;

  const guardar = (clave: string) => {
    const v = (borradores[clave] ?? "").trim();
    if (!v) return;
    onGuardar(clave, v);
    setBorradores((b) => ({ ...b, [clave]: "" }));
  };

  return (
    <details className={CAJA}>
      <summary className={`cursor-pointer list-none ${TITULO}`}>
        {faltantes.length} especie{faltantes.length === 1 ? "" : "s"} sin nombre científico — es una
        columna del LO-CTP
      </summary>
      <ul className="mt-2 max-h-52 space-y-1.5 overflow-y-auto pr-1">
        {faltantes.map((e) => (
          <li key={e.clave} className="flex flex-wrap items-center gap-2">
            <span className="min-w-[7rem] flex-1 truncate text-sm font-bold text-[var(--text-primary)]">
              {e.nombre}
              {e.usos > 0 && (
                <span className="ml-1.5 text-[length:var(--ts-2xs)] font-bold text-[var(--text-tertiary)]">
                  {usos(e.usos)}
                </span>
              )}
            </span>
            <input
              value={borradores[e.clave] ?? ""}
              onChange={(ev) => setBorradores((b) => ({ ...b, [e.clave]: ev.target.value }))}
              onKeyDown={(ev) => {
                if (ev.key === "Enter") guardar(e.clave);
              }}
              placeholder="Cedrelinga cateniformis"
              aria-label={`Nombre científico de ${e.nombre}`}
              className="h-9 min-w-0 flex-[2] rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-2.5 text-sm italic text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
            />
            <button
              type="button"
              onClick={() => guardar(e.clave)}
              disabled={guardando || !(borradores[e.clave] ?? "").trim()}
              aria-label={`Guardar el científico de ${e.nombre}`}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[var(--accent)] text-white transition hover:brightness-95 disabled:opacity-40"
            >
              {guardando ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Check className="h-4 w-4" aria-hidden />
              )}
            </button>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[length:var(--ts-2xs)] leading-snug text-[var(--text-tertiary)]">
        Lo que se escriba acá va a la columna «nombre científico» de los asientos que se abran de
        ahora en adelante, y al Anexo 04 y la guía que salgan de ellos. <b>No reescribe</b> los que
        ya están cargados.
      </p>
    </details>
  );
}
