"use client";

/**
 * Las piezas de «Armar escaneando» (2026-09-26): la tarjeta de cada grupo de la
 * pila —un grupo = un lote— y el aviso de lo que se guardó. Aparte del núcleo
 * (`CtpArmarLoteEscaneando`) para que cada archivo se lea de una vez.
 */

import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, X } from "@buleje/design-system/icons";
import type { TrozaConsumible } from "@/lib/forestal/consumo-trozas";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import type { GrupoDeLaPila } from "@/lib/forestal/lote-por-escaneo";
import type { LoteAserrio } from "@/lib/forestal/lotes-aserrio";
import type { ResultadoGuardado } from "./hooks/use-lotes-aserrio";

/** Lo que se guardó de UN grupo: el lote, su especie y lo que el servidor no aceptó. */
export interface LoteArmado extends ResultadoGuardado {
  code: string | null;
  nuevo: boolean;
  especie: string;
  permiso: string | null;
}

/** Una pieza que salió sola de la pila: ya no está libre (otra tablet la usó, o el recargo la encontró tomada). */
export interface TrozaSacada {
  id: string;
  codigo: string | null;
  motivo: string;
}

export const CAMPO =
  "h-12 w-full rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-base text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-muted)]";

const ERROR =
  "rounded-xl bg-[var(--data-error-500)]/10 px-3 py-2 text-base font-bold text-[var(--data-error-ink)] dark:text-[var(--data-error-500)]";

/** El código que se lee en la chapa: el de planta y, si no, el del bosque. */
export const codigoDeTroza = (t: Pick<TrozaConsumible, "id" | "codigoPlanta" | "codificacion">) =>
  t.codigoPlanta?.trim() || t.codificacion?.trim() || t.id.slice(-6);

export const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

/**
 * Un grupo de la pila: una especie con un permiso, que se guarda como UN lote.
 * Las piezas van como fichas de ancho justo y no como filas: una pila de 30
 * trozas en filas eran tres pantallas de tablet.
 */
export function GrupoDeLaPilaCard({
  grupo,
  lotes,
  destino,
  onDestino,
  onQuitar,
  guardando,
  error,
  reciente,
}: {
  grupo: GrupoDeLaPila;
  /** Los lotes abiertos que aceptan a ESTE grupo (`lotesQueAceptan`). */
  lotes: readonly LoteAserrio[];
  /** `"nuevo"` o el id de un lote de `lotes`. */
  destino: string;
  onDestino: (destino: string) => void;
  onQuitar: (trozaId: string) => void;
  guardando: boolean;
  /** Este grupo no se pudo guardar: sigue en la pila con el motivo a la vista. */
  error: string | null;
  /** Tiene la última troza escaneada: es la tarjeta que se está mirando. */
  reciente: boolean;
}) {
  const valor = lotes.some((l) => l.id === destino) ? destino : "nuevo";
  return (
    <section
      aria-label={`Lote de ${grupo.especie}${grupo.permiso ? `, permiso ${grupo.permiso}` : ", sin permiso"}`}
      className={`space-y-2 rounded-2xl border-2 bg-[var(--surface-raised)] p-3 ${
        error
          ? "border-[var(--data-error-500)]"
          : reciente
            ? "border-[var(--accent)]"
            : "border-[var(--rule-base)]"
      }`}
    >
      <p className="text-base font-bold text-[var(--text-primary)]">
        {grupo.especie} · {plural(grupo.piezas, "troza", "trozas")} · {fmtM3(grupo.m3)} m³
        <span className="block text-sm font-normal text-[var(--text-secondary)]">
          {grupo.permiso ? `Permiso ${grupo.permiso}` : "Sin permiso en sus guías"} · guía
          {grupo.guias.length === 1 ? "" : "s"} {grupo.guias.join(", ") || "—"}
        </span>
      </p>

      {/* La última escaneada primero: es la que se acaba de tocar. */}
      <ul className="flex flex-wrap gap-2">
        {[...grupo.trozas].reverse().map((t) => (
          <li
            key={t.id}
            className="inline-flex items-center rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] pl-3"
          >
            <span className="font-mono text-base font-bold text-[var(--text-primary)]">
              {codigoDeTroza(t)}
            </span>
            <span className="ml-2 text-sm tabular-nums text-[var(--text-secondary)]">
              {t.volumenM3 != null ? `${fmtM3(Number(t.volumenM3))} m³` : "—"}
            </span>
            <button
              type="button"
              onClick={() => onQuitar(t.id)}
              disabled={guardando}
              aria-label={`Sacar ${codigoDeTroza(t)} de la pila`}
              className="inline-flex h-11 w-11 items-center justify-center rounded-xl text-[var(--text-tertiary)] hover:text-[var(--data-error-500)] disabled:opacity-50"
            >
              <X className="h-5 w-5" aria-hidden />
            </button>
          </li>
        ))}
      </ul>

      <label className="block text-sm">
        <span className="mb-1 block font-bold text-[var(--text-secondary)]">Guardar en</span>
        <select
          value={valor}
          onChange={(e) => onDestino(e.target.value)}
          disabled={guardando}
          className={CAMPO}
        >
          <option value="nuevo">Un lote nuevo de {grupo.especie}</option>
          {lotes.map((l) => (
            <option key={l.id} value={l.id}>
              Sumar al {l.code}
              {l.permiso ? ` · ${l.permiso}` : ""}
            </option>
          ))}
        </select>
      </label>

      {error && (
        <p role="alert" className={ERROR}>
          No se guardó: {error}
        </p>
      )}
    </section>
  );
}

/** Las que salieron solas de la pila, dicho pieza por pieza y con el motivo. */
export function AvisoSacadas({
  sacadas,
  onCerrar,
}: {
  sacadas: readonly TrozaSacada[];
  onCerrar: () => void;
}) {
  const perdidas = sacadas.filter((s) => !s.codigo).length;
  return (
    <div
      role="status"
      className="flex items-start gap-2 rounded-2xl border-2 border-[var(--data-warning-500)] bg-[var(--data-warning-500)]/10 py-1 pl-3 pr-1 text-base text-[var(--text-primary)]"
    >
      <AlertTriangle
        className="mt-2.5 h-5 w-5 shrink-0 text-[var(--data-warning-ink)] dark:text-[var(--data-warning-500)]"
        aria-hidden
      />
      <p className="min-w-0 flex-1 py-2">
        <b>Salieron de la pila:</b>{" "}
        {sacadas
          .filter((s) => s.codigo)
          .map((s) => `${s.codigo} (${s.motivo.charAt(0).toLowerCase()}${s.motivo.slice(1)})`)
          .join(" · ")}
        {perdidas > 0 &&
          ` ${plural(perdidas, "troza guardada que ya no está en el patio", "trozas guardadas que ya no están en el patio")}.`}
      </p>
      <button
        type="button"
        onClick={onCerrar}
        aria-label="Cerrar el aviso"
        className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]"
      >
        <X className="h-5 w-5" aria-hidden />
      </button>
    </div>
  );
}

/**
 * Lo que pasó al guardar, un lote por fila y pieza por pieza lo rechazado:
 * «2 no entraron» no sirve en el patio. `acciones` pone el paso siguiente de
 * cada lote (producir, verlo en Consumos) en su propia fila.
 */
export function AvisoLotesArmados({
  lotes,
  acciones,
}: {
  lotes: readonly LoteArmado[];
  acciones?: (r: LoteArmado) => ReactNode;
}) {
  if (lotes.length === 0) return null;
  return (
    /* `role="status"` en un envoltorio y no en la `<ul>`: pisarle el rol a la
       lista deja sus `<li>` huérfanos para un lector de pantalla. */
    <div
      role="status"
      className="rounded-2xl border-2 border-[var(--data-success-500)] bg-[var(--data-success-500)]/10 p-3"
    >
      <ul className="space-y-2">
        {lotes.map((r, i) => (
          <li key={`${r.loteId}-${i}`} className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <div className="min-w-0 flex-1 basis-[16rem]">
              <span className="flex items-start gap-2 text-base font-bold text-[var(--text-primary)]">
                <CheckCircle2
                  className="mt-0.5 h-5 w-5 shrink-0 text-[var(--data-success-ink)] dark:text-[var(--data-success-500)]"
                  aria-hidden
                />
                <span>
                  {r.nuevo ? `${r.code ?? "Lote"} creado` : `Sumadas al ${r.code ?? "lote"}`} ·{" "}
                  {r.especie} · {plural(r.agregadas, "troza adentro", "trozas adentro")}
                  {r.permiso && (
                    <span className="block text-sm font-normal text-[var(--text-secondary)]">
                      Permiso {r.permiso}
                    </span>
                  )}
                </span>
              </span>
              {r.rechazadas.length > 0 && (
                <ul className="mt-1 pl-7 text-sm text-[var(--data-error-ink)] dark:text-[var(--data-error-500)]">
                  {r.rechazadas.map((x) => (
                    <li key={x.id}>
                      {x.codigo ?? x.id.slice(-6)}: {x.motivo}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {acciones && r.agregadas > 0 && r.code && (
              <span className="flex flex-wrap gap-2">{acciones(r)}</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
