"use client";

/**
 * Las trozas de la guía de SERFOR, en su propio apartado (Brandon 2026-09-25:
 * «el bloque de lista de trozas… hacer otro apartado donde estén especialmente
 * los detalles de trozas»).
 *
 * Antes era una tabla pegada al pie de la hoja de la guía, con las dimensiones
 * en un solo texto («105.0 x 101.0 x 6.16»). Es lo que se coteja pieza por
 * pieza contra el camión, así que acá tiene:
 *   · cómo ENTRA AL LIBRO: un ingreso por especie con sus trozas y su volumen,
 *     calculado con el mismo reparto que usa el servidor (ADR-312) — y cada
 *     especie filtra la tabla;
 *   · los avisos de una guía que no cuadra consigo misma, a la vista (antes
 *     vivían en el panel lateral que se sacó);
 *   · un buscador por codificación;
 *   · «Ampliar»: la misma tabla a pantalla completa, para cotejar una guía de
 *     ochenta trozas sin el alto de 26 rem del apartado;
 *   · las medidas en columnas: Ø1 · Ø2 · largo, en el orden en que las publica
 *     SERFOR (`medidasDeTroza`). Sólo cuando la guía es de madera rolliza: en
 *     un producto aserrado «2 X 8 X 10» son pulgadas y pies, y rotularlas como
 *     diámetros sería inventar.
 *
 * No se edita nada: es la declaración de un documento ajeno.
 */

import { useMemo, useState } from "react";
import { DataTable } from "@buleje/design-system";
import { AlertTriangle, Maximize2, Search, X } from "@buleje/design-system/icons";
import AdminModal from "@/components/admin/shared/AdminModal";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import type { GtfSerfor } from "@/lib/forestal/serfor-gtf";
import { medidasDeTroza, type ReparteGtf } from "@/lib/forestal/serfor-gtf-a-ingresos";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import { formatNumber } from "@/lib/format";
import { I } from "./ctp-shared";

type Fila = {
  /** Posición en la lista de la guía (1, 2, 3…), como la numera el papel. */
  n: number;
  especie: string;
  cientifico: string | null;
  /** A qué ingreso del libro va (índice del reparto); null si no se pudo repartir. */
  grupo: number | null;
  codificacion: string | null;
  dimensiones: string | null;
  d1: number | null;
  d2: number | null;
  largo: number | null;
  cantidad: number | null;
  volumen: number | null;
};


/** Desde cuántas trozas aparece el buscador: con cuatro filas estorba. */
const CON_BUSCADOR = 8;

export default function CtpGuiaSerforTrozas({ gtf, reparto }: { gtf: GtfSerfor; reparto: ReparteGtf | null }) {
  const [q, setQ] = useState("");
  const [grupo, setGrupo] = useState<number | null>(null);
  const [ampliada, setAmpliada] = useState(false);

  // Troza → ingreso, con el MISMO reparto del servidor: `orden` es la posición
  // en la lista de la guía. Comparar por nombre de especie fallaba con las
  // trozas «sueltas», que el servidor cuelga del primer producto.
  const grupoDe = useMemo(() => {
    const m = new Map<number, number>();
    if (reparto?.ok) reparto.ingresos.forEach((ing, gi) => ing.trozas.forEach((t) => m.set(t.orden, gi)));
    return m;
  }, [reparto]);

  const filas: Fila[] = useMemo(
    () =>
      (gtf.trozas ?? []).map((t, i) => {
        const m = medidasDeTroza(t.dimensiones);
        return {
          n: i + 1,
          especie: t.comun ?? t.cientifico ?? "—",
          cientifico: t.cientifico ?? null,
          grupo: grupoDe.get(i) ?? null,
          codificacion: t.codificacion ?? null,
          dimensiones: t.dimensiones ?? null,
          d1: m.d1Cm,
          d2: m.d2Cm,
          largo: m.largoM,
          cantidad: t.cantidad ?? null,
          volumen: t.volumen ?? null,
        };
      }),
    [gtf, grupoDe],
  );

  const productos = gtf.productos ?? [];
  const partirMedidas =
    filas.length > 0 &&
    productos.length > 0 &&
    productos.every((p) => /roll|troz/i.test(p.tipoProducto ?? "")) &&
    filas.every((f) => f.largo != null && f.d1 != null);

  const visibles = useMemo(() => {
    const t = q.trim().toLowerCase();
    return filas.filter(
      (f) =>
        (grupo == null || f.grupo === grupo) &&
        (!t || (f.codificacion ?? "").toLowerCase().includes(t) || f.especie.toLowerCase().includes(t)),
    );
  }, [filas, q, grupo]);

  const volTotal = filas.reduce((a, f) => a + (f.volumen ?? 0), 0);
  const volVisible = visibles.reduce((a, f) => a + (f.volumen ?? 0), 0);
  const filtrando = grupo != null || q.trim() !== "";
  const ingresos = reparto?.ok ? reparto.ingresos : [];

  return (
    <div className="min-w-0 space-y-3 sm:col-span-12">
      {/* ── Qué problema tiene la guía, antes que nada ─────────────────── */}
      {reparto && !reparto.ok && (
        <div className="flex items-start gap-2 rounded-xl border border-[var(--data-error-500)]/40 bg-[var(--data-error-500)]/10 px-3.5 py-2.5 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--data-error-700)] dark:text-[var(--data-error-500)]" aria-hidden />
          <p className="min-w-0 text-[var(--text-primary)]">
            <span className="font-bold">No se puede registrar sola.</span> {reparto.motivo}
          </p>
        </div>
      )}
      {reparto?.ok && reparto.avisos.length > 0 && (
        <div className="rounded-xl border border-[var(--data-warning-500)]/40 bg-[var(--data-warning-50)] px-3.5 py-2.5 dark:bg-[var(--data-warning-500)]/10">
          <p className="mb-1 flex items-center gap-1.5 text-sm font-bold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
            <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden /> La guía no cuadra consigo misma
          </p>
          <ul className="space-y-0.5 pl-5.5">
            {reparto.avisos.map((a, i) => (
              <li key={i} className="list-disc text-sm leading-snug text-[var(--text-secondary)]">
                {a}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ── Cómo entra al libro: un ingreso por especie ────────────────── */}
      {ingresos.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex items-center gap-1 text-sm font-medium text-[var(--text-secondary)]">
            Entra al libro como {ingresos.length} ingreso{ingresos.length === 1 ? "" : "s"}
            <InfoTip
              title="Un ingreso por especie"
              what="El libro registra por especie, no por documento: una guía con dos especies deja dos ingresos, cada uno con su volumen y sus trozas (ADR-312)."
              example="Copaiba 9,065 m³ (2 trozas) + Sapotillo 4,874 m³ (2 trozas) = dos renglones en Ingresos."
              ariaLabel="Ayuda: cómo entra al libro"
            />
          </span>
          {ingresos.map((ing, gi) => {
            const activo = grupo === gi;
            return (
              <button
                key={gi}
                type="button"
                aria-pressed={activo}
                onClick={() => setGrupo(activo ? null : gi)}
                className={`inline-flex min-h-9 items-center gap-2 rounded-full border px-3 text-sm transition-colors ${
                  activo
                    ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--text-primary)]"
                    : "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:border-[var(--accent)]"
                }`}
              >
                <span className="font-bold text-[var(--text-primary)]">{ing.especieComun}</span>
                <span className="text-[var(--text-tertiary)]">
                  {ing.trozas.length} troza{ing.trozas.length === 1 ? "" : "s"}
                </span>
                <span className="font-mono font-bold tabular-nums">{fmtM3(ing.volumenM3)} m³</span>
              </button>
            );
          })}
        </div>
      )}

      {filas.length === 0 ? (
        <p className="rounded-xl bg-[var(--surface-sunken)] px-3.5 py-3 text-sm text-[var(--text-secondary)]">
          La guía no trae lista de trozas: el ingreso entra con el volumen declarado por especie.
        </p>
      ) : (
        <>
          {/* ── Totales + buscador ─────────────────────────────────────── */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <p className="text-sm text-[var(--text-secondary)]">
              <span className="font-bold text-[var(--text-primary)]">{filas.length}</span> troza{filas.length === 1 ? "" : "s"} ·{" "}
              <span className="font-mono font-bold tabular-nums text-[var(--text-primary)]">{fmtM3(volTotal)}</span> m³
              {filtrando && (
                <span className="ml-2 text-[var(--text-tertiary)]">
                  (mostrando {visibles.length} · {fmtM3(volVisible)} m³)
                </span>
              )}
            </p>
            {filas.length >= CON_BUSCADOR && (
              <div className="relative ml-auto w-full sm:w-72">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-tertiary)]" aria-hidden />
                <input
                  type="search"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Buscar codificación o especie"
                  aria-label="Buscar troza por codificación o especie"
                  className={`${I} pl-9`}
                />
              </div>
            )}
            <button
              type="button"
              onClick={() => setAmpliada(true)}
              className={`inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-[var(--rule-base)] px-3 text-sm font-semibold text-[var(--text-secondary)] transition-colors hover:border-[var(--accent)] hover:text-[var(--text-primary)] ${filas.length >= CON_BUSCADOR ? "" : "ml-auto"}`}
            >
              <Maximize2 className="h-4 w-4" aria-hidden /> Ampliar
            </button>
            {filtrando && (
              <button
                type="button"
                onClick={() => {
                  setGrupo(null);
                  setQ("");
                }}
                className="inline-flex min-h-9 items-center gap-1 rounded-lg px-2 text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              >
                <X className="h-4 w-4" aria-hidden /> Ver todas
              </button>
            )}
          </div>

          <TablaDeTrozas
            visibles={visibles}
            partirMedidas={partirMedidas}
            filtrando={filtrando}
            volVisible={volVisible}
            q={q}
            alto="limitado"
          />
        </>
      )}

      {/* La MISMA tabla, filtro y buscador, a pantalla completa. Se abre
          desde otro modal: `aboveModals` o queda detrás (ui-components). */}
      {ampliada && (
        <AdminModal
          open
          onClose={() => setAmpliada(false)}
          variant="fullscreen"
          aboveModals
          title={`Trozas de la guía N° ${gtf.gtfNumber ?? gtf.numeroRegistro}`}
          description={`${filas.length} troza${filas.length === 1 ? "" : "s"} · ${fmtM3(volTotal)} m³${filtrando ? ` · mostrando ${visibles.length}` : ""}`}
        >
          <div className="space-y-3 px-5 py-4 sm:px-6">
            <div className="flex flex-wrap items-center gap-2">
              {ingresos.map((ing, gi) => {
                const activo = grupo === gi;
                return (
                  <button
                    key={gi}
                    type="button"
                    aria-pressed={activo}
                    onClick={() => setGrupo(activo ? null : gi)}
                    className={`inline-flex min-h-9 items-center gap-2 rounded-full border px-3 text-sm transition-colors ${
                      activo
                        ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--text-primary)]"
                        : "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:border-[var(--accent)]"
                    }`}
                  >
                    <span className="font-bold text-[var(--text-primary)]">{ing.especieComun}</span>
                    <span className="font-mono font-bold tabular-nums">{fmtM3(ing.volumenM3)} m³</span>
                  </button>
                );
              })}
              <div className="relative ml-auto w-full sm:w-80">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-tertiary)]" aria-hidden />
                <input
                  type="search"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Buscar codificación o especie"
                  aria-label="Buscar troza por codificación o especie"
                  className={`${I} pl-9`}
                />
              </div>
            </div>
            <TablaDeTrozas
              visibles={visibles}
              partirMedidas={partirMedidas}
              filtrando={filtrando}
              volVisible={volVisible}
              q={q}
              alto="completo"
            />
          </div>
        </AdminModal>
      )}
    </div>
  );
}

/** La tabla (escritorio) y las tarjetas (celular) de trozas: la usan el
 *  apartado y su vista ampliada, así las dos dicen exactamente lo mismo. */
function TablaDeTrozas({
  visibles,
  partirMedidas,
  filtrando,
  volVisible,
  q,
  alto,
}: {
  visibles: Fila[];
  partirMedidas: boolean;
  filtrando: boolean;
  volVisible: number;
  q: string;
  /** «limitado» = 26 rem con scroll propio (en el apartado); «completo» = sin tope. */
  alto: "limitado" | "completo";
}) {
  return (
    <>
          {/* ── Escritorio: tabla con cabecera fija ───────────────────── */}
          <div className={`hidden overflow-auto rounded-xl border border-[var(--rule-base)] sm:block ${alto === "limitado" ? "max-h-[26rem]" : ""}`}>
            <DataTable className="w-full text-sm">
              <thead className="sticky top-0 z-[1] bg-[var(--surface-sunken)] text-left text-xs text-[var(--text-tertiary)]">
                <tr>
                  <th className="w-12 px-3 py-2 text-right font-semibold">N°</th>
                  <th className="px-3 py-2 font-semibold">Especie</th>
                  <th className="px-3 py-2 font-semibold">Codificación</th>
                  {partirMedidas ? (
                    <>
                      <th className="px-3 py-2 text-right font-semibold" title="Diámetro 1, como lo publica SERFOR">
                        Ø1 (cm)
                      </th>
                      <th className="px-3 py-2 text-right font-semibold" title="Diámetro 2, como lo publica SERFOR">
                        Ø2 (cm)
                      </th>
                      <th className="px-3 py-2 text-right font-semibold">Largo (m)</th>
                    </>
                  ) : (
                    <th className="px-3 py-2 font-semibold">Dimensiones</th>
                  )}
                  <th className="px-3 py-2 text-right font-semibold">Cant.</th>
                  <th className="px-3 py-2 text-right font-semibold">Volumen (m³)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--rule-soft)]">
                {visibles.map((f) => (
                  <tr key={f.n}>
                    <td className="px-3 py-2 text-right font-mono tabular-nums text-[var(--text-tertiary)]">{f.n}</td>
                    <td className="px-3 py-2">
                      <span className="block font-medium text-[var(--text-primary)]">{f.especie}</span>
                      {f.cientifico && f.cientifico !== f.especie && (
                        <span className="block text-xs italic text-[var(--text-tertiary)]">{f.cientifico}</span>
                      )}
                    </td>
                    <td className="px-3 py-2 font-mono font-bold text-[var(--text-primary)]">{f.codificacion ?? "—"}</td>
                    {partirMedidas ? (
                      <>
                        <td className="px-3 py-2 text-right font-mono tabular-nums text-[var(--text-secondary)]">{formatNumber(f.d1, 1)}</td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums text-[var(--text-secondary)]">{formatNumber(f.d2, 1)}</td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums text-[var(--text-secondary)]">{formatNumber(f.largo, 2)}</td>
                      </>
                    ) : (
                      <td className="px-3 py-2 font-mono text-[var(--text-secondary)]">{f.dimensiones ?? "—"}</td>
                    )}
                    <td className="px-3 py-2 text-right font-mono tabular-nums text-[var(--text-secondary)]">{f.cantidad ?? "—"}</td>
                    <td className="px-3 py-2 text-right font-mono font-bold tabular-nums text-[var(--text-primary)]">
                      {f.volumen == null ? "—" : fmtM3(f.volumen)}
                    </td>
                  </tr>
                ))}
                {visibles.length === 0 && (
                  <tr>
                    <td colSpan={partirMedidas ? 8 : 6} className="px-3 py-4 text-center text-sm text-[var(--text-tertiary)]">
                      Ninguna troza coincide con «{q.trim()}».
                    </td>
                  </tr>
                )}
              </tbody>
              <tfoot className="sticky bottom-0 border-t-2 border-[var(--rule-base)] bg-[var(--surface-sunken)]">
                <tr>
                  <td colSpan={partirMedidas ? 7 : 5} className="px-3 py-2 text-right text-sm font-bold text-[var(--text-primary)]">
                    {filtrando ? `Total de lo mostrado (${visibles.length})` : "Total de la lista"}
                  </td>
                  <td className="px-3 py-2 text-right font-mono font-bold tabular-nums text-[var(--text-primary)]">
                    {fmtM3(volVisible)}
                  </td>
                </tr>
              </tfoot>
            </DataTable>
          </div>

          {/* ── Celular: una tarjeta por troza ────────────────────────── */}
          <ul className="space-y-2 sm:hidden">
            {visibles.map((f) => (
              <li key={f.n} className="rounded-xl border border-[var(--rule-base)] px-3.5 py-2.5">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="min-w-0 truncate font-mono font-bold text-[var(--text-primary)]">
                    <span className="mr-1.5 font-normal text-[var(--text-tertiary)]">{f.n}.</span>
                    {f.codificacion ?? "—"}
                  </span>
                  <span className="shrink-0 font-mono font-bold tabular-nums text-[var(--text-primary)]">
                    {f.volumen == null ? "—" : `${fmtM3(f.volumen)} m³`}
                  </span>
                </div>
                <p className="mt-0.5 text-sm text-[var(--text-secondary)]">
                  {f.especie}
                  <span className="text-[var(--text-tertiary)]">
                    {" · "}
                    {partirMedidas
                      ? `Ø ${formatNumber(f.d1, 1)} / ${formatNumber(f.d2, 1)} cm · ${formatNumber(f.largo, 2)} m`
                      : (f.dimensiones ?? "sin medidas")}
                  </span>
                </p>
              </li>
            ))}
          </ul>
    </>
  );
}
