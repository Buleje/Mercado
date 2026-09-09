"use client";

/**
 * «Esto que sobra, reprocesalo en lo que falta» — el apartado de reprocesos
 * sugeridos de la distribución (ADR-404).
 *
 * La v1 era un párrafo por sugerencia y no se entendía cuál lado era cuál
 * (Brandon, 2026-09-09: «¿ese amarillo es para hacer reproceso a ese verdoso
 * que sale con la flecha?»). Ahora cada línea es una **conversión leída de
 * izquierda a derecha**, con las dos cantidades a la vista:
 *
 *      SALE DE                    →   SE CONVIERTE EN
 *      Comercial · 25 pzas            Paquetería larga · 22 pzas
 *      2.215 m³                       2.124 m³
 *
 * Las piezas suben y el volumen baja: es lo que hace la sierra al recortar. Por
 * eso el m³ de la derecha nunca es mayor que el de la izquierda.
 *
 * Es una SUGERENCIA, no un movimiento: acá no se registra nada en el Libro.
 */

import { ArrowRight, Info, RefreshCw, Target } from "@buleje/design-system/icons";
import { fmtM3, fmtPiezas } from "@/lib/forestal/cubicacion-formato";
import type { CuadreDeDistribucion, SugerenciaReproceso } from "@/lib/forestal/reproceso-sugerido";

const CHIP =
  "inline-flex items-center rounded-full px-2 py-0.5 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide";

/** Un lado de la conversión: el tipo arriba, la cantidad abajo. */
function Lado({
  tipo,
  m3,
  piezas,
  tono,
  nota,
}: {
  tipo: string;
  m3: number;
  piezas: number | null;
  tono: "origen" | "destino";
  nota?: string;
}) {
  return (
    <div className="min-w-0 flex-1">
      <span
        className={`${CHIP} ${
          tono === "origen"
            ? "bg-[var(--data-warning-500)]/15 text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]"
            : "bg-[var(--data-success-500)]/15 text-[var(--data-success-700)] dark:text-[var(--data-success-500)]"
        }`}
      >
        {tipo}
      </span>
      <p className="mt-1 font-mono text-sm font-bold tabular-nums text-[var(--text-primary)]">
        {fmtM3(m3)} m³
        {piezas != null && (
          <span className="ml-1.5 font-sans text-xs font-normal text-[var(--text-secondary)]">
            {fmtPiezas(piezas)} pzas
          </span>
        )}
      </p>
      {nota && (
        <p className="text-[length:var(--ts-2xs)] leading-tight text-[var(--text-tertiary)]">{nota}</p>
      )}
    </div>
  );
}

export default function ReprocesosSugeridos({
  sugerencias,
  cuadre,
  meta,
}: {
  sugerencias: SugerenciaReproceso[];
  cuadre: CuadreDeDistribucion;
  /** La meta de mix, si hay lote cubicado: cierra la cuenta del apartado. */
  meta?: {
    tipo: string;
    pctMinimo: number;
    actual: number;
    cumple: boolean;
    aporteM3: number;
  } | null;
}) {
  if (sugerencias.length === 0) return null;

  return (
    <div className="space-y-3">
      {/* La cuenta de cierre: qué falta, con qué se tapa, qué queda. Con todo
          respaldado, cuatro ceros no dicen nada: se dice en una línea. */}
      {cuadre.faltaM3 <= 0 ? (
        <p className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] px-3 py-2 text-sm text-[var(--text-secondary)]">
          <b className="text-[var(--data-success-700)] dark:text-[var(--data-success-500)]">
            Todo lo cubicado tiene respaldo.
          </b>{" "}
          Lo de abajo es lo que ese respaldo <b>da por hecho</b>: reprocesos que el Libro todavía no
          tiene.
          {cuadre.libreM3 > 0 && (
            <span className="text-[var(--text-tertiary)]">
              {" "}
              Quedan {fmtM3(cuadre.libreM3)} m³ de capacidad sin usar.
            </span>
          )}
        </p>
      ) : (
      <div className="grid gap-2 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] p-3 sm:grid-cols-4">
        {[
          { label: "Falta respaldar", v: cuadre.faltaM3, extra: `${fmtPiezas(cuadre.faltaPiezas)} pzas` },
          { label: "Tapan los reprocesos", v: cuadre.cubreReprocesoM3, tono: "ok" as const },
          { label: "Capacidad libre", v: cuadre.libreM3 },
          { label: "Queda sin respaldo", v: cuadre.quedaM3, tono: cuadre.quedaM3 > 0 ? ("falta" as const) : ("ok" as const) },
        ].map((c) => (
          <div key={c.label}>
            <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
              {c.label}
            </p>
            <p
              className={`font-mono text-base font-bold tabular-nums ${
                c.tono === "ok"
                  ? "text-[var(--data-success-700)] dark:text-[var(--data-success-500)]"
                  : c.tono === "falta"
                    ? "text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]"
                    : "text-[var(--text-primary)]"
              }`}
            >
              {fmtM3(c.v)} <span className="text-xs font-normal">m³</span>
            </p>
            {c.extra && (
              <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">{c.extra}</p>
            )}
          </div>
        ))}
      </div>
      )}

      {meta && (
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-[var(--rule-base)] px-3 py-2 text-xs text-[var(--text-secondary)]">
          <Target className="h-3.5 w-3.5 shrink-0 text-[var(--accent)]" aria-hidden />
          <b className="text-[var(--text-primary)]">Meta: {meta.tipo} ≥ {meta.pctMinimo} %</b>
          <span>· hoy {meta.actual} %</span>
          {meta.aporteM3 > 0 ? (
            <span>
              · los reprocesos hacia {meta.tipo.toLowerCase()} suman{" "}
              <b className="font-mono tabular-nums">{fmtM3(meta.aporteM3)} m³</b>
            </span>
          ) : (
            <span>· ninguna sugerencia apunta a ese tipo</span>
          )}
          {meta.cumple && <span className="font-bold text-[var(--data-success-700)] dark:text-[var(--data-success-500)]">· ya cumple</span>}
        </p>
      )}

      {sugerencias.map((s, i) => (
        <div
          key={`${s.especie}|${s.motivo}|${s.desdeTipo}|${s.haciaTipo}|${i}`}
          className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] p-3"
        >
          <div className="flex items-start gap-3">
            {/* Las piezas del origen NO van al lado del m³ convertido: son el
                tamaño del bloque, y leerlas ahí haría pensar que se consumen
                25 piezas en cada una de las cuatro conversiones del mismo
                bloque. Van como contexto, abajo. */}
            <Lado
              tipo={s.desdeTipo}
              m3={s.convertirM3}
              piezas={null}
              tono="origen"
              nota={`de ${fmtM3(s.m3Desde)} m³${
                s.piezasDesde != null ? ` · ${fmtPiezas(s.piezasDesde)} pzas` : ""
              } que hay`}
            />
            <ArrowRight className="mt-6 h-4 w-4 shrink-0 text-[var(--text-tertiary)]" aria-hidden />
            <Lado
              tipo={s.haciaTipo}
              m3={s.motivo === "faltante" ? s.convertirM3 : s.faltanteM3}
              piezas={s.faltantePiezas}
              tono="destino"
              nota={
                s.motivo === "faltante" && !s.cubreTodo
                  ? `faltan ${fmtM3(s.restaM3)} m³ más`
                  : undefined
              }
            />
            <span
              className={`${CHIP} shrink-0 ${
                s.motivo === "faltante"
                  ? "bg-[var(--surface-sunken)] text-[var(--text-secondary)]"
                  : "bg-[var(--data-error-500)]/12 text-[var(--data-error-700)] dark:text-[var(--data-error-500)]"
              }`}
              title={
                s.motivo === "faltante"
                  ? "Esa madera está parada y esas piezas no tienen respaldo: reprocesar cuadra la hoja."
                  : "El bloque YA está respaldando esas piezas: el papel afirma un reproceso que el Libro todavía no tiene."
              }
            >
              {s.motivo === "faltante" ? "Cuadra el faltante" : "Falta declararlo"}
            </span>
          </div>

          <p className="mt-1.5 truncate text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
            {s.especie} · {s.bloques.map((b) => b.etiqueta || "(sin etiqueta)").join(" · ")}
          </p>
        </div>
      ))}

      <p className="flex items-start gap-1.5 text-[length:var(--ts-2xs)] leading-snug text-[var(--text-tertiary)]">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
        <span>
          Al recortar suben las piezas y <b>baja</b> el volumen: por eso lo convertido nunca pasa de
          lo que hay. Esto no mueve nada en el Libro — el reproceso se registra desde Productos
          disponibles.
        </span>
      </p>
    </div>
  );
}

/** El ícono del apartado: el MISMO que «Reprocesar» en Productos disponibles —
 *  la misma acción no puede tener dos símbolos en el mismo módulo. */
export const ICONO_REPROCESOS = RefreshCw;
