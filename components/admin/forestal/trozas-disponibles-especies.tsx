"use client";

/**
 * Las especies de «Trozas disponibles»: la tabla de TODAS (con su total) y la
 * lista corta que se abre debajo de un permiso.
 *
 * La especie es la de la TROZA, no la de la guía (ADR-435): en Blas, 29 de 84
 * trozas vinieron en una guía de otra especie (medido 2026-09-27).
 *
 * El clic en una especie filtra toda la página (y otro clic la suelta).
 *
 * Mismo criterio que «Por permiso» (revisión 2026-09-27): trozas, m³ y ≈pt son
 * EN EL PATIO; lo que espera su guía va en «Por recepcionar» y no se suma.
 */

import { useMemo, useState } from "react";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import { formatNumber } from "@/lib/format";
import { ptDe, type FilaEspecieDisponible } from "@/lib/forestal/trozas-disponibles";
import type { VolumenPatio } from "@/lib/forestal/patio-resumen";
import { FilaVacia, TablaCtp, TbodyCtp, TheadCtp, ThOrdenable } from "./ctp-tabla";
import { MasVieja } from "./ctp-patio-por-permiso-partes";

const nf = (n: number) => formatNumber(n);
const SOLO_ANCHO = "max-sm:hidden!";
const trozasTxt = (n: number) => `${nf(n)} troza${n === 1 ? "" : "s"}`;

/** Lo que espera su guía, en su columna: nunca sumado a lo del patio. */
function PorRecepcionarEspecie({ p }: { p: VolumenPatio }) {
  if (p.trozas === 0) return <span className="text-[var(--text-secondary)]">—</span>;
  return (
    <span className="whitespace-nowrap tabular-nums text-[var(--text-primary)]">
      {trozasTxt(p.trozas)} · {fmtM3(p.m3)} m³
    </span>
  );
}

type Campo = "especie" | "trozas" | "m3" | "dias";

function ordenar(
  filas: readonly FilaEspecieDisponible[],
  by: Campo,
  dir: "asc" | "desc",
): FilaEspecieDisponible[] {
  const s = dir === "asc" ? 1 : -1;
  const valor = (f: FilaEspecieDisponible) =>
    by === "trozas"
      ? f.trozas
      : by === "m3"
        ? f.m3
        : by === "dias"
          ? (f.masVieja?.dias ?? null)
          : null;
  return [...filas].sort((a, b) => {
    if (by === "especie") return s * a.especie.localeCompare(b.especie, "es");
    const va = valor(a);
    const vb = valor(b);
    /* Sin dato al final en los dos sentidos: no es «la que menos tiene». */
    if (va == null) return vb == null ? 0 : 1;
    if (vb == null) return -1;
    return s * (va - vb);
  });
}

export function TablaEspecies({
  filas,
  activas,
  onElegir,
  cargando,
}: {
  filas: readonly FilaEspecieDisponible[];
  /** Las especies que filtran la página: su fila va `aria-pressed`. */
  activas: readonly string[];
  onElegir: (especie: string) => void;
  cargando: boolean;
}) {
  const [orden, setOrden] = useState<{ by: Campo; dir: "asc" | "desc" }>({ by: "m3", dir: "desc" });
  const onOrdenar = (c: Campo) =>
    setOrden((o) =>
      o.by === c
        ? { by: c, dir: o.dir === "asc" ? "desc" : "asc" }
        : { by: c, dir: c === "especie" ? "asc" : "desc" },
    );
  const vista = useMemo(() => ordenar(filas, orden.by, orden.dir), [filas, orden]);
  const total = useMemo(() => {
    const m3 = filas.reduce((a, f) => a + f.m3, 0);
    return {
      trozas: filas.reduce((a, f) => a + f.trozas, 0),
      m3,
      pt: ptDe(m3),
      sinRecepcionar: {
        trozas: filas.reduce((a, f) => a + f.sinRecepcionar.trozas, 0),
        m3: filas.reduce((a, f) => a + f.sinRecepcionar.m3, 0),
      },
    };
  }, [filas]);
  const celda = "px-3 py-2";

  return (
    <TablaCtp>
      <caption className="sr-only">Trozas disponibles por especie</caption>
      <TheadCtp>
        <tr>
          <ThOrdenable campo="especie" orden={orden} onOrdenar={onOrdenar}>
            Especie
          </ThOrdenable>
          <ThOrdenable
            campo="trozas"
            orden={orden}
            onOrdenar={onOrdenar}
            align="right"
            className="relative"
          >
            Trozas<span className="sr-only"> en el patio</span>
          </ThOrdenable>
          <ThOrdenable
            campo="m3"
            orden={orden}
            onOrdenar={onOrdenar}
            align="right"
            className="relative"
          >
            m³<span className="sr-only"> en el patio</span>
          </ThOrdenable>
          <th scope="col" className={`relative ${celda} text-right`}>
            ≈pt<span className="sr-only"> aserrable, derivado al 56 %</span>
          </th>
          <th scope="col" className={`${celda} ${SOLO_ANCHO} text-right`}>
            % del m³
          </th>
          <th scope="col" className={`${celda} ${SOLO_ANCHO} text-right`}>
            Permisos
          </th>
          <ThOrdenable campo="dias" orden={orden} onOrdenar={onOrdenar}>
            La más vieja
          </ThOrdenable>
          <th scope="col" className={celda}>
            Por recepcionar
          </th>
        </tr>
      </TheadCtp>
      <TbodyCtp>
        {cargando && filas.length === 0 && <FilaVacia cols={8}>Leyendo el patio…</FilaVacia>}
        {!cargando && filas.length === 0 && (
          <FilaVacia cols={8}>Ninguna troza con estos filtros.</FilaVacia>
        )}
        {vista.map((f) => {
          const activa = activas.some((a) => a.toLowerCase() === f.especie.toLowerCase());
          return (
            <tr
              key={f.clave || "sin-especie"}
              className={activa ? "bg-primary/10" : "hover:bg-[var(--surface-sunken)]"}
            >
              <td className={celda}>
                {f.clave ? (
                  <button
                    type="button"
                    onClick={() => onElegir(f.especie)}
                    aria-pressed={activa}
                    aria-label={`Filtrar por ${f.especie}: ${nf(f.trozas)} trozas, ${fmtM3(f.m3)} m³`}
                    className={`min-h-8 rounded-lg border-2 px-2 py-1 text-left font-bold text-[var(--text-primary)] transition-colors ${
                      activa
                        ? "border-[var(--accent)]"
                        : "border-transparent hover:border-[var(--accent)]"
                    }`}
                  >
                    {f.especie}
                  </button>
                ) : (
                  <span className="px-2 font-bold text-[var(--text-secondary)]">{f.especie}</span>
                )}
              </td>
              <td
                className={`${celda} text-right font-bold tabular-nums text-[var(--text-primary)]`}
              >
                {nf(f.trozas)}
                {f.enLote > 0 && (
                  <span className="block text-sm font-normal text-[var(--text-secondary)]">
                    {nf(f.enLote)} en lote
                  </span>
                )}
              </td>
              <td className={`${celda} text-right tabular-nums text-[var(--text-primary)]`}>
                {fmtM3(f.m3)}
              </td>
              <td className={`${celda} text-right tabular-nums text-[var(--text-secondary)]`}>
                ≈{nf(f.pt)}
              </td>
              <td
                className={`${celda} ${SOLO_ANCHO} text-right tabular-nums text-[var(--text-secondary)]`}
              >
                {f.pctM3} %
              </td>
              <td
                className={`${celda} ${SOLO_ANCHO} text-right tabular-nums text-[var(--text-secondary)]`}
              >
                {nf(f.permisos)}
              </td>
              <td className={celda}>
                <MasVieja fila={f} />
              </td>
              <td className={celda}>
                <PorRecepcionarEspecie p={f.sinRecepcionar} />
              </td>
            </tr>
          );
        })}
      </TbodyCtp>
      {filas.length > 1 && (
        <tfoot className="border-t-2 border-[var(--rule-base)] bg-[var(--surface-sunken)]">
          <tr>
            <th scope="row" className={`${celda} text-left font-bold text-[var(--text-primary)]`}>
              Total · {nf(filas.length)} especies
            </th>
            <td className={`${celda} text-right font-bold tabular-nums text-[var(--text-primary)]`}>
              {nf(total.trozas)}
            </td>
            <td className={`${celda} text-right font-bold tabular-nums text-[var(--text-primary)]`}>
              {fmtM3(total.m3)}
            </td>
            <td className={`${celda} text-right tabular-nums text-[var(--text-secondary)]`}>
              ≈{nf(total.pt)}
            </td>
            <td
              className={`${celda} ${SOLO_ANCHO} text-right tabular-nums text-[var(--text-secondary)]`}
            >
              100 %
            </td>
            <td className={`${celda} ${SOLO_ANCHO}`} />
            <td className={celda} />
            <td className={celda}>
              <PorRecepcionarEspecie p={total.sinRecepcionar} />
            </td>
          </tr>
        </tfoot>
      )}
    </TablaCtp>
  );
}

/**
 * Las especies de UN permiso, debajo de su fila: trozas, m³ y ≈pt EN EL PATIO
 * (suman la fila) con una barrita de cuánto pesa, y lo por recepcionar aparte. Lista y no tabla: a 400 px una tabla anidada se
 * vuelve tarjetas dentro de una tarjeta.
 */
export function EspeciesDelPermiso({
  filas,
  onElegir,
}: {
  filas: readonly FilaEspecieDisponible[];
  onElegir?: (especie: string) => void;
}) {
  if (filas.length === 0)
    return (
      <span className="text-sm text-[var(--text-secondary)]">Sin trozas con estos filtros.</span>
    );
  const mayor = Math.max(0, ...filas.map((f) => f.m3));
  return (
    <ul
      className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2 xl:grid-cols-3"
      aria-label="Especies del permiso"
    >
      {filas.map((f) => (
        <li key={f.clave || "sin-especie"} className="min-w-0">
          <span className="flex items-baseline justify-between gap-2 text-sm">
            {onElegir && f.clave ? (
              <button
                type="button"
                onClick={() => onElegir(f.especie)}
                className="truncate font-bold text-[var(--text-primary)] underline-offset-2 hover:underline"
              >
                {f.especie}
              </button>
            ) : (
              <span className="truncate font-bold text-[var(--text-primary)]">{f.especie}</span>
            )}
            <span className="shrink-0 tabular-nums text-[var(--text-secondary)]">
              {f.trozas > 0
                ? `${trozasTxt(f.trozas)} · ${fmtM3(f.m3)} m³ · ≈${nf(f.pt)} pt`
                : "0 en el patio"}
            </span>
          </span>
          {mayor > 0 && (
            <span
              aria-hidden
              className="mt-0.5 block h-1.5 w-full overflow-hidden rounded-full bg-[var(--surface-canvas)]"
            >
              <span
                className="block h-full rounded-full bg-[var(--accent)]"
                style={{ width: `${f.m3 > 0 ? Math.max(2, (f.m3 / mayor) * 100) : 0}%` }}
              />
            </span>
          )}
          {f.sinRecepcionar.trozas > 0 && (
            <span className="block text-sm tabular-nums text-[var(--text-secondary)]">
              Por recepcionar: {trozasTxt(f.sinRecepcionar.trozas)} · {fmtM3(f.sinRecepcionar.m3)}{" "}
              m³
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}
