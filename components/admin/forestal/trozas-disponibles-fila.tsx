/**
 * Una fila de la tabla «Por troza» de Trozas disponibles, y el orden de la
 * tabla. Salió a su archivo para que la tabla quede bajo las 300 líneas.
 */

import type { TrozaConsumible } from "@/lib/forestal/consumo-trozas";
import { diametroDe, esSinCodigo } from "@/lib/forestal/consumo-trozas";
import { diasDelAsiento, diasEnPatio } from "@/lib/forestal/patio-dias";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import { formatNumber } from "@/lib/format";
import {
  ETIQUETA_ESTADO_DISPONIBLE,
  estadoDisponible,
  ptDe,
  type EstadoDisponible,
} from "@/lib/forestal/trozas-disponibles";
import { Dias } from "./ctp-patio-por-permiso-partes";

const nf = (n: number) => formatNumber(n);

export type CampoOrdenTroza = "codigo" | "m3" | "dias";

const numero = (v: unknown): number | null => {
  const n = v == null ? Number.NaN : Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Ordena las trozas; lo que no tiene el dato va al final en los dos sentidos. */
export function ordenarTrozas(
  trozas: readonly TrozaConsumible[],
  by: CampoOrdenTroza,
  dir: "asc" | "desc",
  ahora: Date,
): TrozaConsumible[] {
  const s = dir === "asc" ? 1 : -1;
  const valor = (t: TrozaConsumible): number | string | null =>
    by === "m3"
      ? numero(t.volumenM3)
      : by === "dias"
        ? diasEnPatio(t, ahora)
        : (t.codigoPlanta ?? t.codificacion ?? null);
  return [...trozas].sort((a, b) => {
    const va = valor(a);
    const vb = valor(b);
    if (va == null) return vb == null ? 0 : 1;
    if (vb == null) return -1;
    if (typeof va === "string" || typeof vb === "string")
      return s * String(va).localeCompare(String(vb), "es", { numeric: true });
    return s * (va - vb);
  });
}

const TONO_ESTADO: Record<EstadoDisponible, string> = {
  libre: "bg-[var(--data-success-500)]/15",
  "en-lote": "bg-[var(--data-info-500)]/15",
  "sin-recepcionar": "bg-[var(--data-warning-500)]/20",
};

function Estado({ t }: { t: TrozaConsumible }) {
  const e = estadoDisponible(t);
  /* El código del lote en su propio renglón: en uno solo la columna medía
     169 px y la tabla se salía de su caja a 1280 (medido 2026-09-27). */
  return (
    <span
      className={`inline-flex flex-col rounded-lg px-1.5 py-0.5 text-sm font-semibold text-[var(--text-primary)] ${TONO_ESTADO[e]}`}
    >
      <span className="whitespace-nowrap">{ETIQUETA_ESTADO_DISPONIBLE[e]}</span>
      {e === "en-lote" && t.loteAserrioCode && (
        <span className="font-normal tabular-nums">{t.loteAserrioCode}</span>
      )}
    </span>
  );
}

function Medidas({ t }: { t: TrozaConsumible }) {
  const d1 = numero(t.d1Cm);
  const d2 = numero(t.d2Cm);
  const d =
    d1 != null || d2 != null
      ? `${d1?.toFixed(0) ?? "—"}×${d2?.toFixed(0) ?? "—"}`
      : (diametroDe(t)?.toFixed(0) ?? "—");
  const largo = numero(t.largoM);
  return (
    <span className="whitespace-nowrap tabular-nums">
      Ø {d} · {largo != null ? formatNumber(largo, 2) : "—"}
    </span>
  );
}

export function FilaTrozaDisponible({ t, ahora }: { t: TrozaConsumible; ahora: Date }) {
  const m3 = numero(t.volumenM3) ?? 0;
  const dias = diasEnPatio(t, ahora);
  const asiento = t.guiaRecepcionada === false ? diasDelAsiento(t, ahora) : null;
  const sinCodigo = esSinCodigo(t) && !t.codigoPlanta;
  return (
    <tr className="hover:bg-[var(--surface-sunken)]">
      <td className="px-2! py-2">
        {sinCodigo ? (
          <span className="text-[var(--text-secondary)]">Sin código</span>
        ) : (
          <span className="flex flex-col">
            <span className="font-bold text-[var(--text-primary)]">
              {t.codigoPlanta ?? t.codificacion}
            </span>
            {t.codigoPlanta && t.codificacion && !esSinCodigo(t) && (
              <span className="text-sm text-[var(--text-secondary)]">{t.codificacion}</span>
            )}
          </span>
        )}
      </td>
      <td className="px-2! py-2 tabular-nums text-[var(--text-primary)]">
        <span className="block max-w-[8rem] break-all">{t.gtfNumber ?? "—"}</span>
      </td>
      <td className="px-2! py-2">
        <span className="line-clamp-2 max-w-[11rem] break-all text-[var(--text-primary)]">
          {t.permiso ?? "Sin permiso"}
        </span>
      </td>
      <td className="px-2! py-2 font-semibold text-[var(--text-primary)]">
        {t.especieComun ?? "—"}
      </td>
      <td className="px-2! py-2 text-[var(--text-primary)]">
        <Medidas t={t} />
      </td>
      <td className="px-2! py-2 text-right tabular-nums text-[var(--text-primary)]">{fmtM3(m3)}</td>
      <td className="px-2! py-2 text-right tabular-nums text-[var(--text-secondary)]">
        ≈{nf(ptDe(m3))}
      </td>
      <td className="px-2! py-2">
        <Estado t={t} />
      </td>
      <td className="px-2! py-2">
        {dias != null ? (
          <Dias dias={dias} />
        ) : asiento != null ? (
          <span className="text-sm text-[var(--text-secondary)]">
            guía asentada hace {nf(asiento)} días
          </span>
        ) : (
          <span className="text-[var(--text-secondary)]">—</span>
        )}
      </td>
    </tr>
  );
}
